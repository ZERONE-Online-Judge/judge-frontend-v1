import type { PresentationSoundCue } from './presentationAnnouncements';
import type {
  OperatorPresentationScoreboardSection,
  ScoreboardRow,
} from './types';

type Section = OperatorPresentationScoreboardSection;
export type PresentationReveal = {
  key: string;
  kind: 'resolver' | 'rank' | 'all';
  divisionId: string;
  section: Section;
  previous: Section;
  teams: ScoreboardRow[];
};
export type PresentationReleaseMotionSnapshot = {
  scopeKey: string;
  sections: Section[];
  reveal: PresentationReveal | null;
  stage:
    | 'board'
    | 'focusing'
    | 'suspense'
    | 'result'
    | 'returning'
    | 'holding'
    | 'highlighting'
    | 'moving';
  nextAt: number | null;
};
type Update = {
  scopeKey: string;
  contestId: string;
  sections: Section[];
  ended: boolean;
  updatedAt: number;
  now: number;
  visible: boolean;
  reducedMotion?: boolean;
  suppressed?: boolean;
};
type Observation = { section: Section; identity: string; roster: string[] };

export const PRESENTATION_FOCUS_DURATION = 420;
export const PRESENTATION_SUSPENSE_DURATION = 1100;
export const PRESENTATION_RESULT_DURATION = 1400;
export const PRESENTATION_RESULT_MAX_DURATION = 2600;
export const PRESENTATION_RETURN_DURATION = 340;
export const PRESENTATION_BOARD_HOLD_DURATION = 300;
export const PRESENTATION_RANK_HIGHLIGHT_DURATION = 180;
export const PRESENTATION_RANK_DURATION = 600;
export const PRESENTATION_RANK_FADE_DURATION = 300;
const MAX_FETCH_GAP = 20_000;
const MAX_DATA_AGE = 10_000;
const MAX_QUEUE = 12;
const modeOrder = { not_started: 0, partial: 1, all: 2 };
function clone<T>(value: T): T {
  return structuredClone(value);
}

function observation(section: Section): Observation | undefined {
  const release = section.release;
  if (
    !section.division.division_id ||
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
  return {
    section,
    roster,
    identity: JSON.stringify([
      release.strategy,
      release.mode,
      release.total_count,
      release.revealed_count,
      roster,
      section.rows
        .filter((row) => row.rank_is_final === true)
        .map((row) => row.team_id)
        .sort(),
      release.resolver?.step,
      release.resolver?.total_steps,
      release.resolver?.last_event,
    ]),
  };
}

function transition(
  before: Observation,
  after: Observation,
): PresentationReveal | 'reset' | null {
  const previous = before.section;
  const section = after.section;
  const a = previous.release!;
  const b = section.release!;
  const initializes =
    a.mode === 'not_started' &&
    a.total_count === 0 &&
    b.total_count === after.roster.length;
  if (
    a.strategy !== b.strategy ||
    JSON.stringify(before.roster) !== JSON.stringify(after.roster) ||
    (a.total_count !== b.total_count && !initializes) ||
    modeOrder[b.mode] < modeOrder[a.mode] ||
    b.revealed_count < a.revealed_count ||
    previous.rows.some(
      (row) =>
        row.rank_is_final === true &&
        !section.rows.some(
          (next) =>
            next.team_id === row.team_id &&
            (next.rank_is_final === true || b.mode === 'all'),
        ),
    ) ||
    (a.resolver &&
      b.resolver &&
      (b.resolver.step < a.resolver.step ||
        (a.mode !== 'not_started' &&
          b.resolver.total_steps !== a.resolver.total_steps)))
  )
    return 'reset';
  const divisionId = section.division.division_id;
  const make = (
    kind: PresentationReveal['kind'],
    teams: ScoreboardRow[],
    identity: unknown,
  ): PresentationReveal => ({
    key: JSON.stringify([divisionId, kind, identity]),
    kind,
    divisionId,
    previous,
    section,
    teams: teams.filter((row) => row.is_revealed !== false),
  });
  if (b.strategy === 'resolver' && a.resolver && b.resolver) {
    const delta = b.resolver.step - a.resolver.step;
    // A missed poll cannot reconstruct the intermediate submissions fairly.
    if (delta > 1 && !(b.mode === 'all' && !b.resolver.last_event))
      return 'reset';
    if (delta === 1) {
      const event = b.resolver.last_event;
      const team =
        event &&
        section.rows.find(
          (row) => row.team_id === event.team_id && row.is_revealed !== false,
        );
      if (event && team && event.problem_code && event.status)
        return make('resolver', [team], [b.resolver.step, event]);
      if (b.mode !== 'all' || event) return 'reset';
    }
  }
  if (a.mode !== 'all' && b.mode === 'all' && b.total_count > 0) {
    // The final single/tied rank is still a rank announcement, rather than a
    // second full-results splash. An all-at-once action has multiple groups.
    if (b.strategy === 'manual') {
      const finalIds = new Set(
        previous.rows
          .filter((row) => row.rank_is_final === true)
          .map((row) => row.team_id),
      );
      const teams = section.rows.filter(
        (row) => !finalIds.has(row.team_id) && row.is_revealed !== false,
      );
      // Public responses omit rank controls, and fully public rows no longer
      // carry rank_is_final. The previous published IDs identify the last group.
      if (teams.length && new Set(teams.map((row) => row.rank)).size === 1)
        return make('rank', teams, [
          teams[0].rank,
          teams.map((row) => row.team_id),
        ]);
    }
    return make('all', section.rows, b.revealed_count);
  }
  if (b.strategy === 'manual' && b.revealed_count > a.revealed_count) {
    const finalIds = new Set(
      previous.rows
        .filter((row) => row.rank_is_final === true)
        .map((row) => row.team_id),
    );
    const ranks = b.ranks.filter(
      (rank) =>
        rank.revealed &&
        !a.ranks.some((old) => old.rank === rank.rank && old.revealed),
    );
    const teams = section.rows.filter(
      (row) =>
        (row.rank_is_final === true && !finalIds.has(row.team_id)) ||
        (ranks.some((rank) => rank.rank === row.rank) &&
          row.is_revealed === true),
    );
    if (new Set(teams.map((row) => row.rank)).size > 1) return 'reset';
    if (teams.length)
      return make('rank', teams, [
        b.revealed_count,
        teams.map((row) => row.team_id),
      ]);
  }
  return null;
}

export function presentationRevealDuration(reveal: PresentationReveal) {
  if (reveal.kind === 'all') return PRESENTATION_RESULT_DURATION;
  const event = reveal.section.release?.resolver?.last_event;
  const title =
    reveal.section.problems.find(
      (problem) => problem.problem_code === event?.problem_code,
    )?.title ?? '';
  const characters =
    Math.max(0, ...reveal.teams.map((team) => team.team_name.length)) +
    title.length;
  return Math.min(
    PRESENTATION_RESULT_MAX_DURATION,
    PRESENTATION_RESULT_DURATION +
      Math.max(0, characters - 40) * 6 +
      Math.max(0, reveal.teams.length - 1) * 100,
  );
}

/** Emphasize only announced teams whose authoritative rank actually changes. */
export function presentationRevealMovedTeamIds(reveal: PresentationReveal) {
  const previousRanks = new Map(
    reveal.previous.rows.map((row) => [row.team_id, row.rank]),
  );
  return [
    ...new Set(
      reveal.teams.flatMap((team) => {
        const previousRank = previousRanks.get(team.team_id);
        return team.team_id &&
          Number.isFinite(previousRank) &&
          Number.isFinite(team.rank) &&
          previousRank !== team.rank
          ? [team.team_id]
          : [];
      }),
    ),
  ];
}

function cue(reveal: PresentationReveal): PresentationSoundCue {
  if (reveal.kind === 'all') return 'complete';
  if (reveal.kind === 'rank') return 'result';
  const event = reveal.section.release!.resolver!.last_event!;
  if (
    reveal.section.scoring_mode === 'ioi' ||
    (reveal.section.scoring_mode == null &&
      (typeof event.score_delta === 'number' ||
        typeof event.to_score === 'number'))
  ) {
    const delta =
      event.score_delta ?? (event.to_score ?? 0) - (event.from_score ?? 0);
    return delta > 0 ? 'accepted' : 'result';
  }
  return event.status === 'accepted' ? 'accepted' : 'rejected';
}

/** Holds the authoritative rows until the audience has seen their result. */
export class PresentationReleaseMotionCoordinator {
  private state: PresentationReleaseMotionSnapshot = {
    scopeKey: '',
    sections: [],
    reveal: null,
    stage: 'board',
    nextAt: null,
  };
  private observations = new Map<string, Observation>();
  private latest: Section[] = [];
  private queue: PresentationReveal[] = [];
  private contestId = '';
  private updatedAt = 0;
  private now = 0;
  private contentIdentity = '';
  private needsBaseline = true;
  private listeners = new Set<() => void>();

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: PresentationReleaseMotionSnapshot) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  pause = () => {
    this.needsBaseline = true;
    this.queue = [];
    this.publish({
      ...this.state,
      sections: this.latest,
      reveal: null,
      stage: 'board',
      nextAt: null,
    });
  };
  private start(now: number): undefined {
    const reveal = this.queue.shift();
    if (!reveal) return;
    this.publish({
      ...this.state,
      reveal,
      stage: 'focusing',
      nextAt: now + PRESENTATION_FOCUS_DURATION,
    });
  }
  finish = (now: number) => {
    if (this.state.stage !== 'result') return;
    this.publish({
      ...this.state,
      stage: 'returning',
      nextAt: now + PRESENTATION_RETURN_DURATION,
    });
  };
  advance = (now: number): PresentationSoundCue | undefined => {
    if (this.state.nextAt === null || now < this.state.nextAt) return;
    if (!Number.isFinite(now) || now - this.updatedAt > MAX_DATA_AGE) {
      this.pause();
      return;
    }
    if (this.state.stage === 'focusing' && this.state.reveal) {
      this.publish({
        ...this.state,
        stage: 'suspense',
        nextAt: now + PRESENTATION_SUSPENSE_DURATION,
      });
      return;
    }
    if (this.state.stage === 'suspense' && this.state.reveal) {
      const reveal = this.state.reveal;
      this.publish({
        ...this.state,
        stage: 'result',
        nextAt: now + presentationRevealDuration(reveal),
      });
      return cue(reveal);
    }
    if (this.state.stage === 'result') {
      this.finish(now);
      return;
    }
    if (this.state.stage === 'returning' && this.state.reveal) {
      this.publish({
        ...this.state,
        stage: 'holding',
        nextAt: now + PRESENTATION_BOARD_HOLD_DURATION,
      });
      return;
    }
    if (this.state.stage === 'holding' && this.state.reveal) {
      this.publish({
        ...this.state,
        stage: 'highlighting',
        nextAt: now + PRESENTATION_RANK_HIGHLIGHT_DURATION,
      });
      return;
    }
    if (this.state.stage === 'highlighting' && this.state.reveal) {
      const current = this.state.reveal.section;
      this.publish({
        ...this.state,
        sections: this.state.sections.map((section) =>
          section.division.division_id === current.division.division_id
            ? current
            : section,
        ),
        stage: 'moving',
        nextAt: now + PRESENTATION_RANK_DURATION,
      });
      return;
    }
    if (this.state.stage === 'moving') {
      this.publish({
        ...this.state,
        reveal: null,
        stage: 'board',
        nextAt: now + PRESENTATION_RANK_FADE_DURATION,
      });
      return;
    }
    if (this.queue.length) return this.start(now);
    this.publish({
      ...this.state,
      sections: this.latest,
      reveal: null,
      stage: 'board',
      nextAt: null,
    });
  };

  update(input: Update): PresentationSoundCue | undefined {
    const {
      scopeKey,
      contestId,
      sections,
      ended,
      updatedAt,
      now,
      visible,
      reducedMotion = false,
      suppressed = false,
    } = input;
    const sameScope =
      scopeKey === this.state.scopeKey && contestId === this.contestId;
    if (sameScope && updatedAt < this.updatedAt) return;
    const copied = clone(sections);
    const next = new Map<string, Observation>();
    for (const section of copied) {
      const value = observation(section);
      if (value) next.set(section.division.division_id, value);
    }
    const invalid =
      next.size !== copied.length ||
      new Set(copied.map((section) => section.division.division_id)).size !==
        copied.length;
    const contentIdentity = JSON.stringify(copied);
    const changed =
      !sameScope ||
      updatedAt !== this.updatedAt ||
      contentIdentity !== this.contentIdentity ||
      next.size !== this.observations.size ||
      [...next].some(
        ([id, value]) => value.identity !== this.observations.get(id)?.identity,
      );
    const ineligible =
      !ended ||
      !visible ||
      reducedMotion ||
      suppressed ||
      !Number.isFinite(now) ||
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      now - updatedAt > MAX_DATA_AGE;
    const discontinuity =
      !sameScope ||
      invalid ||
      now < this.now ||
      (this.updatedAt > 0 && updatedAt - this.updatedAt > MAX_FETCH_GAP) ||
      [...this.observations.keys()].some((id) => !next.has(id));
    if (!changed && !ineligible && !discontinuity) return;
    const quiet = this.needsBaseline || ineligible || discontinuity;
    const events: PresentationReveal[] = [];
    let resets = false;
    if (!quiet) {
      for (const [id, current] of next) {
        const previous = this.observations.get(id);
        if (!previous) continue;
        const event = transition(previous, current);
        if (event === 'reset') resets = true;
        else if (event) events.push(event);
      }
    }
    this.latest = copied;
    this.contestId = contestId;
    this.updatedAt = updatedAt;
    this.now = now;
    this.contentIdentity = contentIdentity;
    this.observations = next;
    this.needsBaseline = ineligible || invalid;
    if (quiet || resets || this.queue.length + events.length > MAX_QUEUE) {
      this.queue = [];
      this.publish({
        scopeKey,
        sections: copied,
        reveal: null,
        stage: 'board',
        nextAt: null,
      });
      return;
    }
    this.queue.push(...events);
    if (this.state.stage === 'board' && this.state.nextAt === null) {
      if (this.queue.length) return this.start(now);
      this.publish({ ...this.state, sections: copied });
    }
  }
}
