import {
  contestTimerState,
  type ContestTiming,
} from '../contestAdministration/contestTimer';

export type PresentationAnnouncementContest = ContestTiming & {
  contest_id: string;
};
export type PresentationSoundCue =
  | 'warning'
  | 'tick'
  | 'start'
  | 'end'
  | 'reveal'
  | 'accepted'
  | 'rejected'
  | 'result'
  | 'complete';
export type PresentationAnnouncement = {
  key: string;
  kinds: ('freeze' | 'end')[];
  minutes: 30 | 20 | 10 | 5;
  milestones: { kind: 'freeze' | 'end'; minutes: 30 | 20 | 10 | 5 }[];
  title: string;
  expiresAt: number;
};
export type PresentationAnnouncementMemory = [string, number][];

const MINUTE = 60_000;
const FRESHNESS = 5_000;
const MEMORY_LIFETIME = 7 * 24 * 60 * MINUTE;
const WARNING_MINUTES = [30, 20, 10, 5] as const;

export const PRESENTATION_ANNOUNCEMENT_STORAGE_KEY =
  'zoj.presentation.announcements.v1';
export const PRESENTATION_ANNOUNCEMENT_DURATION = 8_000;

export function readPresentationAnnouncementMemory(
  stored: string | null,
): PresentationAnnouncementMemory {
  try {
    const value: unknown = JSON.parse(stored ?? 'null');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is [string, number] =>
          Array.isArray(item) &&
          typeof item[0] === 'string' &&
          item[0].length < 300 &&
          typeof item[1] === 'number' &&
          Number.isFinite(item[1]),
      )
      .slice(-256);
  } catch {
    return [];
  }
}

type ScheduledEvent = {
  key: string;
  at: number;
  cue: PresentationSoundCue;
  kind?: 'freeze' | 'end';
  minutes?: 30 | 20 | 10 | 5;
};

/** Start/end countdowns take priority over a scheduled automatic freeze. */
export function presentationFreezeCountdown(
  contest: PresentationAnnouncementContest | undefined,
  now: number,
) {
  if (!contest) return null;
  const timer = contestTimerState(contest, now, true);
  return !timer.showPresentationCountdown &&
    timer.freezeRemaining !== null &&
    timer.freezeRemaining > 0 &&
    timer.freezeRemaining <= 3_000
    ? Math.ceil(timer.freezeRemaining / 1_000)
    : null;
}

function schedule(contest: PresentationAnnouncementContest): ScheduledEvent[] {
  const start = Date.parse(contest.start_at);
  const end = Date.parse(contest.end_at);
  const freeze = Date.parse(contest.freeze_at ?? '');
  if (
    !contest.contest_id ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    ['draft', 'schedule_tbd', 'ended', 'finalized', 'archived'].includes(
      contest.status ?? '',
    )
  )
    return [];

  const targets: { kind: 'freeze' | 'end'; at: number }[] = [
    { kind: 'end', at: end },
  ];
  if (
    (contest.scoreboard_freeze_mode ?? 'auto') === 'auto' &&
    Number.isFinite(freeze) &&
    freeze > start &&
    freeze < end
  )
    targets.unshift({ kind: 'freeze', at: freeze });
  const events: ScheduledEvent[] = targets.flatMap(({ kind, at }) =>
    WARNING_MINUTES.map((minutes) => ({
      key: `${contest.contest_id}:${kind}:${at}:${minutes}`,
      kind,
      minutes,
      at: at - minutes * MINUTE,
      cue: 'warning' as const,
    })),
  );
  if (targets.some((target) => target.kind === 'freeze')) {
    for (let seconds = 3; seconds >= 1; seconds--) {
      events.push({
        key: `${contest.contest_id}:freeze:${freeze}:second:${seconds}`,
        kind: 'freeze',
        at: freeze - seconds * 1000,
        cue: 'tick',
      });
    }
  }
  for (const [kind, at] of [
    ['start', start],
    ['end', end],
  ] as const) {
    for (let seconds = 10; seconds >= 0; seconds--) {
      events.push({
        key: `${contest.contest_id}:${kind}:${at}:second:${seconds}`,
        at: at - seconds * 1000,
        cue: seconds ? 'tick' : kind,
      });
    }
  }
  return events;
}

/** Keeps crossings separate from React renders, polling and audio preferences. */
export class PresentationAnnouncementTracker {
  private seen: Map<string, number>;
  private previousNow?: number;
  private previousContest?: string;
  private previousActive = false;
  private wasVisible = true;
  private active: PresentationAnnouncement | null = null;
  private listeners = new Set<() => void>();

  constructor(memory: PresentationAnnouncementMemory = []) {
    this.seen = new Map(memory);
  }

  memory(now: number): PresentationAnnouncementMemory {
    const recent = [...this.seen].filter(
      ([, at]) => now - at < MEMORY_LIFETIME,
    );
    this.seen = new Map(recent.slice(-256));
    return [...this.seen];
  }

  pause() {
    this.wasVisible = false;
    this.dismiss();
  }

  getSnapshot = () => this.active;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(announcement: PresentationAnnouncement | null) {
    if (this.active === announcement) return;
    this.active = announcement;
    this.listeners.forEach((listener) => listener());
  }

  dismiss = () => this.publish(null);

  advance(
    contest: PresentationAnnouncementContest | undefined,
    now: number,
    options: { visible: boolean; suppressed?: boolean },
  ) {
    const result = this.update(contest, now, options);
    const current = this.active;
    this.publish(
      result.announcement ??
        (current &&
        current.expiresAt > now &&
        !options.suppressed &&
        this.isCurrent(current, contest)
          ? current
          : null),
    );
    return result;
  }

  isCurrent(
    announcement: PresentationAnnouncement,
    contest: PresentationAnnouncementContest | undefined,
  ) {
    if (!contest) return false;
    const keys = new Set(schedule(contest).map((event) => event.key));
    return announcement.key.split('|').every((key) => keys.has(key));
  }

  update(
    contest: PresentationAnnouncementContest | undefined,
    now: number,
    options: { visible: boolean; suppressed?: boolean },
  ): {
    announcement?: PresentationAnnouncement;
    cue?: PresentationSoundCue;
    changed: boolean;
  } {
    if (!Number.isFinite(now)) return { changed: false };
    const previous =
      this.previousContest === contest?.contest_id
        ? this.previousNow
        : undefined;
    const wasActive = this.previousActive && previous !== undefined;
    const resumed = !this.wasVisible;
    this.previousNow = now;
    this.previousContest = contest?.contest_id;
    this.previousActive = Boolean(contest && schedule(contest).length);
    this.wasVisible = options.visible;
    if (!contest) return { changed: false };

    const events = schedule(contest);
    const end = Date.parse(contest.end_at);
    // A response may change to `ended` on the exact final tick. Preserve that
    // cue only when this display was actively watching the actual end cross.
    if (
      wasActive &&
      ['ended', 'finalized', 'archived'].includes(contest.status ?? '') &&
      previous! < end &&
      now >= end &&
      now - end < 1000
    ) {
      events.push({
        key: `${contest.contest_id}:end:${end}:second:0`,
        at: end,
        cue: 'end',
      });
    }
    const crossed = events.filter(
      (event) =>
        !this.seen.has(event.key) &&
        event.at <= now &&
        (previous === undefined || event.at > previous),
    );
    for (const event of crossed) this.seen.set(event.key, now);
    this.memory(now);
    // Never replay a backlog after a suspended laptop, background tab or jump.
    if (
      !options.visible ||
      resumed ||
      (previous !== undefined && (now < previous || now - previous > FRESHNESS))
    )
      return { changed: crossed.length > 0 };

    const fresh = crossed.filter((event) => now - event.at < FRESHNESS);
    // Only the current second can beep. A delayed tick never creates a burst.
    const countdown = fresh
      .filter(
        (event) =>
          event.cue !== 'warning' &&
          now - event.at < 1_000 &&
          (event.kind !== 'freeze' ||
            presentationFreezeCountdown(contest, now) !== null),
      )
      .sort((a, b) => b.at - a.at)[0];
    if (countdown) return { cue: countdown.cue, changed: crossed.length > 0 };
    const warnings = fresh.filter((event) => event.cue === 'warning');
    if (options.suppressed || !warnings.length)
      return { changed: crossed.length > 0 };
    const latestAt = Math.max(...warnings.map((event) => event.at));
    const latest = warnings.filter((event) => event.at === latestAt);
    const minutes = latest[0].minutes!;
    const milestones = latest.map((event) => ({
      kind: event.kind!,
      minutes: event.minutes!,
    }));
    const kinds = milestones.map((milestone) => milestone.kind);
    const title = milestones
      .map(
        ({ kind, minutes }) =>
          `${kind === 'freeze' ? '스코어보드 프리즈' : '제출 마감'} ${minutes}분 전입니다`,
      )
      .join(' · ');
    return {
      announcement: {
        key: latest.map((event) => event.key).join('|'),
        kinds,
        minutes,
        milestones,
        title,
        expiresAt: now + PRESENTATION_ANNOUNCEMENT_DURATION,
      },
      cue: 'warning',
      changed: crossed.length > 0,
    };
  }
}
