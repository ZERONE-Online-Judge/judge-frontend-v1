import type { PresentationSoundCue } from './presentationAnnouncements';
import type {
  OperatorPresentationScoreboardSection,
  ScoreboardRelease,
} from './types';

type ReleaseSnapshot = {
  release: ScoreboardRelease;
  roster: string[];
  finalTeams: Set<string>;
  identity: string;
};
type ReleaseSoundUpdate = {
  contestId: string;
  sections: OperatorPresentationScoreboardSection[];
  ended: boolean;
  updatedAt: number;
  now: number;
  visible: boolean;
  suppressed?: boolean;
};

const MAX_FETCH_GAP = 20_000;
const MAX_DATA_AGE = 10_000;
const priorities: Partial<Record<PresentationSoundCue, number>> = {
  reveal: 1,
  rejected: 2,
  accepted: 3,
  result: 4,
  complete: 5,
};
const modeOrder = { not_started: 0, partial: 1, all: 2 };

function snapshot(
  section: OperatorPresentationScoreboardSection,
): ReleaseSnapshot | undefined {
  const release = section.release;
  if (
    !release ||
    !Number.isInteger(release.total_count) ||
    release.total_count < 0 ||
    !Number.isInteger(release.revealed_count) ||
    release.revealed_count < 0 ||
    release.revealed_count > release.total_count
  )
    return;
  const roster = section.rows
    .map((row) => row.team_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
  if (
    roster.length !== section.rows.length ||
    new Set(roster).size !== roster.length
  )
    return;
  const finalTeams = new Set(
    section.rows
      .filter((row) => release.mode === 'all' || row.rank_is_final === true)
      .map((row) => row.team_id as string),
  );
  return {
    release: {
      ...release,
      resolver: release.resolver
        ? {
            ...release.resolver,
            last_event: release.resolver.last_event
              ? { ...release.resolver.last_event }
              : null,
          }
        : release.resolver,
    },
    roster,
    finalTeams,
    // Revision/undo are not part of the presentation payload. Row order and
    // live scores are deliberately absent: neither is a reveal event.
    identity: JSON.stringify([
      release.strategy,
      release.mode,
      release.total_count,
      release.revealed_count,
      roster,
      [...finalTeams].sort(),
      release.resolver?.step,
      release.resolver?.total_steps,
      release.resolver?.last_event,
    ]),
  };
}

function forwardCue(
  previous: ReleaseSnapshot,
  current: ReleaseSnapshot,
): PresentationSoundCue | undefined {
  const before = previous.release;
  const after = current.release;
  const initializesCount =
    before.mode === 'not_started' &&
    before.total_count === 0 &&
    after.total_count === current.roster.length;
  if (
    before.strategy !== after.strategy ||
    previous.roster.join('\0') !== current.roster.join('\0') ||
    (before.total_count !== after.total_count && !initializesCount) ||
    modeOrder[after.mode] < modeOrder[before.mode] ||
    after.revealed_count < before.revealed_count ||
    [...previous.finalTeams].some((id) => !current.finalTeams.has(id)) ||
    (before.resolver &&
      after.resolver &&
      (after.resolver.step < before.resolver.step ||
        (before.mode !== 'not_started' &&
          after.resolver.total_steps !== before.resolver.total_steps)))
  )
    return;
  if (before.mode !== 'all' && after.mode === 'all' && after.total_count > 0)
    return 'complete';
  if (after.strategy === 'resolver') {
    const resolver = after.resolver;
    const previousStep = before.resolver?.step;
    const event = resolver?.last_event;
    if (
      resolver &&
      previousStep !== undefined &&
      resolver.step > previousStep &&
      event &&
      current.roster.includes(event.team_id) &&
      typeof event.status === 'string' &&
      event.status.length > 0
    )
      return event.status === 'accepted' ? 'accepted' : 'rejected';
  } else if (
    after.strategy === 'manual' &&
    (after.revealed_count > before.revealed_count ||
      [...current.finalTeams].some((id) => !previous.finalTeams.has(id)))
  ) {
    return 'result';
  }
  if (before.mode === 'not_started' && after.mode === 'partial')
    return 'reveal';
}

export class PresentationReleaseSoundTracker {
  private contestId: string | undefined;
  private updatedAt: number | undefined;
  private now: number | undefined;
  private sections = new Map<string, ReleaseSnapshot>();
  private needsBaseline = true;

  pause() {
    this.needsBaseline = true;
  }

  update({
    contestId,
    sections,
    ended,
    updatedAt,
    now,
    visible,
    suppressed = false,
  }: ReleaseSoundUpdate): PresentationSoundCue | undefined {
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      !Number.isFinite(now)
    ) {
      this.pause();
      return;
    }
    const next = new Map<string, ReleaseSnapshot>();
    for (const section of sections) {
      const value = snapshot(section);
      if (value) next.set(section.division.division_id, value);
    }
    const sameContest = this.contestId === contestId;
    const changed =
      !sameContest ||
      updatedAt !== this.updatedAt ||
      next.size !== this.sections.size ||
      [...next].some(
        ([id, value]) => value.identity !== this.sections.get(id)?.identity,
      );
    const stale = now - updatedAt > MAX_DATA_AGE;
    const rollback =
      (this.now !== undefined && now < this.now) ||
      (this.updatedAt !== undefined && updatedAt < this.updatedAt);
    this.now = now;
    if (!visible || stale) this.pause();
    if (!changed) {
      if (rollback) this.pause();
      return;
    }
    const quiet =
      !sameContest ||
      this.needsBaseline ||
      rollback ||
      (this.updatedAt !== undefined &&
        updatedAt - this.updatedAt > MAX_FETCH_GAP);
    let cue: PresentationSoundCue | undefined;
    if (!quiet && ended && visible && !suppressed) {
      for (const [id, current] of next) {
        const previous = this.sections.get(id);
        const candidate = previous ? forwardCue(previous, current) : undefined;
        if (
          candidate &&
          (priorities[candidate] ?? 0) > (cue ? (priorities[cue] ?? 0) : 0)
        )
          cue = candidate;
      }
    }
    this.contestId = contestId;
    this.updatedAt = updatedAt;
    this.sections = next;
    this.needsBaseline = !visible || stale;
    return cue;
  }
}
