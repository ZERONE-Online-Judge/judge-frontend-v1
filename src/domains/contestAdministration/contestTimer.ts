export type ContestTiming = {
  status?: string;
  start_at: string;
  end_at: string;
  freeze_at?: string;
  scoreboard_freeze_mode?: string | null;
};

export function contestTimerState(
  contest: ContestTiming,
  now: number,
  presentation = false,
) {
  const start = Date.parse(contest.start_at);
  const end = Date.parse(contest.end_at);
  const freeze = Date.parse(contest.freeze_at ?? '');
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const draft = ['draft', 'schedule_tbd'].includes(contest.status ?? '');
  const forcedEnd = ['ended', 'finalized', 'archived'].includes(
    contest.status ?? '',
  );
  const phase = draft
    ? 'draft'
    : !valid || !Number.isFinite(now) || now <= 0
      ? 'unknown'
      : forcedEnd || now >= end
        ? 'ended'
        : now < start
          ? 'before'
          : 'running';
  const remaining =
    phase === 'before' ? start - now : phase === 'running' ? end - now : null;
  const view =
    phase === 'before'
      ? remaining! <= 10_000
        ? 'startCountdown'
        : 'waiting'
      : phase === 'running'
        ? now - start < 2_000
          ? 'started'
          : remaining! <= (presentation ? 60_000 : 10_000)
            ? 'endCountdown'
            : 'running'
        : phase === 'ended'
          ? 'ended'
          : 'unavailable';
  const freezeMode = contest.scoreboard_freeze_mode ?? 'auto';
  const hasFreeze =
    valid &&
    !draft &&
    freezeMode !== 'live' &&
    Number.isFinite(freeze) &&
    freeze > start &&
    freeze < end;
  const freezeActive =
    phase === 'running' &&
    (freezeMode === 'frozen' || (hasFreeze && now >= freeze));
  const freezeRemaining =
    phase === 'running' && freezeMode === 'auto' && hasFreeze && now < freeze
      ? freeze - now
      : null;
  const progress =
    valid && !draft && now > 0
      ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
      : 0;
  const afterFreeze = hasFreeze && now >= freeze;
  const anchors = hasFreeze
    ? phase === 'before'
      ? { start: 40, freeze: 145, end: 250 }
      : afterFreeze
        ? { start: 40, freeze: 94, end: 250 }
        : { start: 40, freeze: 194, end: 250 }
    : { start: 40, freeze: 40, end: 216 };
  const current =
    !valid || now < start
      ? anchors.start
      : !hasFreeze
        ? anchors.start + ((anchors.end - anchors.start) * progress) / 100
        : afterFreeze
          ? anchors.freeze +
            (anchors.end - anchors.freeze) *
              Math.min(1, (now - freeze) / (end - freeze))
          : anchors.start +
            ((anchors.freeze - anchors.start) * (now - start)) /
              (freeze - start);
  return {
    phase,
    view,
    valid,
    start,
    end,
    freeze,
    hasFreeze,
    freezeActive,
    freezeRemaining,
    afterFreeze,
    remaining,
    progress,
    anchors,
    current,
    showPresentationCountdown:
      phase === 'before' ||
      view === 'started' ||
      view === 'endCountdown' ||
      (phase === 'ended' && valid && now >= end && now - end < 2_000),
  };
}

export type ContestTimerState = ReturnType<typeof contestTimerState>;
