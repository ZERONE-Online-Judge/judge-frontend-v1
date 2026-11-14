import type {
  OperatorPresentationScoreboardSection,
  ScoreboardRow,
} from './types';

type Section = OperatorPresentationScoreboardSection;
export type PresentationAwardGroup = {
  rank: 1 | 2 | 3;
  teams: ScoreboardRow[];
};

/** Competition ranks are authoritative: a tied first does not invent a second. */
export function presentationAwardGroups(
  section: Section,
): PresentationAwardGroup[] {
  if (section.release?.mode !== 'all') return [];
  return ([1, 2, 3] as const).flatMap((rank) => {
    const teams = section.rows.filter(
      (row) =>
        row.rank === rank &&
        row.team_id &&
        row.team_name.trim() &&
        row.is_revealed !== false,
    );
    return teams.length ? [{ rank, teams }] : [];
  });
}

export type PresentationAwardsUpdate = {
  scopeKey: string;
  contestId: string;
  sections: Section[];
  ended: boolean;
  updatedAt: number;
  now: number;
  visible: boolean;
  ready: boolean;
  suppressed?: boolean;
};
export type PresentationAwardsSnapshot = {
  scopeKey: string;
  contestId: string;
  contentIdentity: string;
  section: Section | null;
  key: string | null;
  pendingCount: number;
  expiresAt: number | null;
};
type Observation = {
  section: Section;
  roster: string[];
  finalTeams: string[];
  identity: string;
};

const MAX_DATA_AGE = 10_000;
const MAX_FETCH_GAP = 20_000;
const modeOrder = { not_started: 0, partial: 1, all: 2 };

function observe(section: Section): Observation | undefined {
  if (!section.division?.division_id || !Array.isArray(section.rows)) return;
  const roster = section.rows
    .map((row) => row.team_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
  if (
    roster.length !== section.rows.length ||
    new Set(roster).size !== roster.length ||
    section.rows.some(
      (row) =>
        !Number.isInteger(row.rank) ||
        row.rank < 1 ||
        typeof row.team_name !== 'string',
    )
  )
    return;
  if (!roster.length)
    return { section, roster, finalTeams: [], identity: 'empty' };
  const release = section.release;
  // An empty division need not have a release summary and never delays awards.
  if (!release && roster.length) return;
  if (
    release &&
    (!Object.hasOwn(modeOrder, release.mode) ||
      !Number.isInteger(release.total_count) ||
      release.total_count < 0 ||
      !Number.isInteger(release.revealed_count) ||
      release.revealed_count < 0 ||
      release.revealed_count > release.total_count ||
      (release.mode === 'all' &&
        (release.total_count !== roster.length ||
          release.revealed_count !== release.total_count ||
          section.rows.some((row) => row.is_revealed === false))) ||
      (release.revision !== undefined &&
        (!Number.isInteger(release.revision) || release.revision < 0)) ||
      (release.resolver &&
        (!Number.isInteger(release.resolver.step) ||
          release.resolver.step < 0 ||
          !Number.isInteger(release.resolver.total_steps) ||
          release.resolver.total_steps < release.resolver.step)))
  )
    return;
  const finalTeams = section.rows
    .filter((row) => release?.mode === 'all' || row.rank_is_final === true)
    .map((row) => row.team_id as string)
    .sort();
  return {
    section,
    roster,
    finalTeams,
    identity: JSON.stringify([
      release?.strategy,
      release?.mode,
      release?.total_count,
      release?.revealed_count,
      release?.revision,
      release?.resolver?.step,
      release?.resolver?.total_steps,
      release?.resolver?.last_event,
      roster,
      finalTeams,
    ]),
  };
}

function backwards(before: Observation, after: Observation) {
  if (JSON.stringify(before.roster) !== JSON.stringify(after.roster))
    return true;
  if (!after.roster.length) return false;
  const a = before.section.release;
  const b = after.section.release;
  if (!a || !b) return Boolean(a) !== Boolean(b);
  const initializes =
    a.mode === 'not_started' &&
    a.total_count === 0 &&
    b.total_count === after.roster.length;
  return (
    a.strategy !== b.strategy ||
    (a.total_count !== b.total_count && !initializes) ||
    modeOrder[b.mode] < modeOrder[a.mode] ||
    b.revealed_count < a.revealed_count ||
    (a.revision !== undefined &&
      b.revision !== undefined &&
      b.revision < a.revision) ||
    before.finalTeams.some((id) => !after.finalTeams.includes(id)) ||
    Boolean(
      a.resolver &&
      b.resolver &&
      (b.resolver.step < a.resolver.step ||
        (a.mode !== 'not_started' &&
          b.resolver.total_steps !== a.resolver.total_steps) ||
        (b.resolver.step - a.resolver.step > 1 &&
          !(b.mode === 'all' && !b.resolver.last_event))),
    )
  );
}

/** Observed completion only; loaded or interrupted all-public results stay quiet. */
export class PresentationAwardsTracker {
  private state: PresentationAwardsSnapshot = {
    scopeKey: '',
    contestId: '',
    contentIdentity: '',
    section: null,
    key: null,
    pendingCount: 0,
    expiresAt: null,
  };
  private observations = new Map<string, Observation>();
  private pending: string[] = [];
  private scopeKey = '';
  private contestId = '';
  private contentIdentity = '';
  private updatedAt = 0;
  private now = 0;
  private ready = false;
  private ended = false;
  private eligible = false;
  private needsBaseline = true;
  private sequence = 0;
  private listeners = new Set<() => void>();

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Render the newest official values without restarting a valid ceremony. */
  currentSection(
    input: Omit<PresentationAwardsUpdate, 'now' | 'ready'>,
  ): Section | null {
    const active = this.state.section;
    if (
      !active ||
      input.scopeKey !== this.scopeKey ||
      input.contestId !== this.contestId ||
      !input.ended ||
      !input.visible ||
      input.suppressed ||
      !Number.isFinite(input.updatedAt) ||
      input.updatedAt < this.updatedAt ||
      (this.updatedAt > 0 &&
        input.updatedAt - this.updatedAt > MAX_FETCH_GAP) ||
      input.updatedAt <= 0
    )
      return null;
    const next = new Map<string, Observation>();
    for (const section of input.sections) {
      const current = observe(section);
      if (!current || next.has(section.division.division_id)) return null;
      next.set(section.division.division_id, current);
    }
    if (
      next.size !== this.observations.size ||
      [...next].some(([id, current]) => {
        const previous = this.observations.get(id);
        return (
          !previous ||
          (current.roster.length > 0 &&
            current.section.release?.mode !== 'all') ||
          backwards(previous, current)
        );
      })
    )
      return null;
    return next.get(active.division.division_id)?.section ?? null;
  }

  private publish(section: Section | null, key: string | null) {
    if (
      key === this.state.key &&
      JSON.stringify(section) === JSON.stringify(this.state.section)
    )
      section = this.state.section;
    const next: PresentationAwardsSnapshot = {
      scopeKey: this.scopeKey,
      contestId: this.contestId,
      contentIdentity: this.contentIdentity,
      section,
      key,
      pendingCount: this.pending.length,
      expiresAt:
        section || this.pending.length
          ? this.updatedAt + MAX_DATA_AGE + 1
          : null,
    };
    if (
      Object.keys(next).every(
        (field) =>
          next[field as keyof typeof next] ===
          this.state[field as keyof typeof next],
      )
    )
      return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  pause = () => {
    this.needsBaseline = true;
    this.eligible = false;
    this.pending = [];
    this.publish(null, null);
  };

  private allPublic() {
    return [...this.observations.values()].every(
      ({ section, roster }) =>
        !roster.length || section.release?.mode === 'all',
    );
  }

  check = (now: number, visible = true) => {
    if (
      !visible ||
      !Number.isFinite(now) ||
      now < this.now ||
      now - this.updatedAt > MAX_DATA_AGE
    ) {
      this.pause();
      return false;
    }
    this.now = now;
    return true;
  };

  private start() {
    if (
      this.state.section ||
      !this.ready ||
      !this.eligible ||
      !this.allPublic()
    )
      return;
    const id = this.pending.shift();
    if (!id) return;
    const section = this.observations.get(id)?.section;
    if (!section?.rows.length || section.release?.mode !== 'all') {
      this.pause();
      return;
    }
    const key = JSON.stringify([
      this.scopeKey,
      this.contestId,
      id,
      ++this.sequence,
    ]);
    this.publish(section, key);
    return 'celebration' as const;
  }

  complete = (key: string | null, now: number, visible = true) => {
    // A stale timeout from a previous division cannot skip the next ceremony.
    if (!key || key !== this.state.key || !this.check(now, visible)) return;
    this.publish(null, null);
    const cue = this.start();
    if (!cue) this.publish(null, null);
    return cue;
  };

  update(input: PresentationAwardsUpdate) {
    const {
      scopeKey,
      contestId,
      sections,
      ended,
      updatedAt,
      now,
      visible,
      ready,
      suppressed = false,
    } = input;
    const sameScope =
      scopeKey === this.scopeKey && contestId === this.contestId;
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      (sameScope && updatedAt < this.updatedAt)
    ) {
      this.pause();
      return;
    }
    const copied = structuredClone(sections);
    const next = new Map<string, Observation>();
    let invalid = false;
    for (const section of copied) {
      const current = observe(section);
      if (!current || next.has(section.division.division_id)) invalid = true;
      else next.set(section.division.division_id, current);
    }
    const sameSelection =
      next.size === this.observations.size &&
      [...next.keys()].every((id) => this.observations.has(id));
    const ineligible =
      !visible ||
      suppressed ||
      now < updatedAt ||
      now - updatedAt > MAX_DATA_AGE;
    const discontinuity =
      !sameScope ||
      !sameSelection ||
      invalid ||
      (this.ended && !ended) ||
      now < this.now ||
      (this.updatedAt > 0 && updatedAt - this.updatedAt > MAX_FETCH_GAP) ||
      [...next].some(([id, current]) => {
        const previous = this.observations.get(id);
        return previous && backwards(previous, current);
      });
    const quiet = this.needsBaseline || ineligible || discontinuity;
    const crossedEnd = !this.ended && ended;
    const changed =
      this.ended !== ended ||
      [...next].some(
        ([id, current]) =>
          current.identity !== this.observations.get(id)?.identity,
      );
    if (!quiet && ended) {
      for (const [id, current] of next) {
        const previous = this.observations.get(id);
        if (
          ((this.ended && previous?.section.release?.mode !== 'all') ||
            (crossedEnd &&
              current.section.release?.strategy === 'immediate')) &&
          current.section.release?.mode === 'all' &&
          current.roster.length &&
          !this.pending.includes(id) &&
          this.state.section?.division.division_id !== id
        )
          this.pending.push(id);
      }
    }
    this.scopeKey = scopeKey;
    this.contestId = contestId;
    this.contentIdentity = JSON.stringify(copied);
    this.observations = next;
    this.updatedAt = updatedAt;
    this.now = now;
    this.ready = ready;
    this.ended = ended;
    this.eligible = ended && !ineligible && !invalid;
    this.needsBaseline = ineligible || invalid;
    if (quiet) {
      this.pending = [];
      this.publish(null, null);
      return;
    }
    // Give the release-motion effect a commit to leave its old idle state.
    // A final result must finish, return, move ranks and settle before awards.
    if (!changed) {
      const cue = this.start();
      if (cue) return cue;
    }
    const active = this.state.section;
    this.publish(
      active ? (next.get(active.division.division_id)?.section ?? null) : null,
      this.state.key,
    );
  }
}
