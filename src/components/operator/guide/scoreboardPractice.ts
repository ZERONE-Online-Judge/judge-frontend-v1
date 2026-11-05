import type {
  Division,
  ScoreboardReleaseMode,
} from '@/domains/contestAdministration/types';
import type { Problem } from '@/domains/problemManagement/types';
import type {
  ScoreboardProblemScore,
  ScoreboardRelease,
  ScoreboardReleaseAction,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';

export const PRACTICE_DIVISION: Division = {
  division_id: 'guide-practice-division',
  code: 'practice',
  name: '연습 대회',
  description: '실제 대회와 연결되지 않은 가상 스코어보드입니다.',
  display_order: 0,
};

export const PRACTICE_PROBLEMS: Problem[] = ['A', 'B', 'C', 'D', 'E'].map(
  (code, index) => ({
    problem_id: `guide-practice-${code}`,
    division_id: PRACTICE_DIVISION.division_id,
    problem_code: code,
    title: `${code}번 연습 문제`,
    statement: '',
    time_limit_ms: 1000,
    memory_limit_mb: 512,
    display_order: index,
  }),
);

type Verdict = 'accepted' | 'wrong_answer' | 'compile_error';
type Attempt = { minute: number; status: Verdict };
type Team = {
  id: string;
  name: string;
  submissions: Partial<Record<string, Attempt[]>>;
};
type LastEvent = NonNullable<
  NonNullable<ScoreboardRelease['resolver']>['last_event']
>;
type Snapshot = {
  mode: ScoreboardRelease['mode'];
  revealedRanks: number[];
  revealedProblems: string[];
  lastEvent: LastEvent | null;
};
type Undo = NonNullable<ScoreboardRelease['undo']>;

export type PracticeState = {
  strategy: ScoreboardReleaseMode;
  revision: number;
  current: Snapshot;
  history: { before: Snapshot; action: Undo }[];
};

const FREEZE_MINUTE = 120;
const accepted = (minute: number): Attempt => ({ minute, status: 'accepted' });
const wrong = (minute: number): Attempt => ({ minute, status: 'wrong_answer' });
const compileError = (minute: number): Attempt => ({
  minute,
  status: 'compile_error',
});

// Fixed, fictional submissions only. Nothing here reads or changes a contest.
// 느린 번개 is frozen 2nd but final 5th; the last two teams share final 6th.
const TEAMS: Team[] = [
  {
    id: 'guide-team-whale',
    name: '하늘 고래',
    submissions: {
      A: [accepted(20), wrong(125), accepted(170)],
      B: [accepted(40)],
      C: [accepted(60)],
      D: [wrong(130), wrong(135), accepted(150)],
    },
  },
  {
    id: 'guide-team-lightning',
    name: '느린 번개',
    submissions: { A: [accepted(25)], B: [accepted(50)], C: [accepted(80)] },
  },
  {
    id: 'guide-team-star',
    name: '초록 별',
    submissions: {
      A: [accepted(30)],
      B: [accepted(55)],
      C: [wrong(125), wrong(130), accepted(145)],
      D: [accepted(160)],
    },
  },
  {
    id: 'guide-team-moon',
    name: '달빛 코더',
    submissions: {
      A: [compileError(10), accepted(35)],
      B: [accepted(60)],
      C: [accepted(140)],
      D: [accepted(165)],
    },
  },
  {
    id: 'guide-team-fox',
    name: '파란 여우',
    submissions: {
      A: [accepted(40)],
      B: [accepted(70)],
      C: [accepted(135)],
      D: [accepted(170)],
    },
  },
  {
    id: 'guide-team-duck',
    name: '차분한 오리',
    submissions: {
      A: [accepted(45)],
      B: [wrong(65), wrong(100), wrong(130), wrong(140)],
      C: [compileError(122), wrong(128), accepted(150)],
    },
  },
  {
    id: 'guide-team-rabbit',
    name: '새벽 토끼',
    submissions: {
      A: [accepted(45)],
      B: [wrong(65), wrong(100), wrong(130), wrong(140)],
      C: [wrong(128), accepted(150), wrong(165)],
    },
  },
];

const cellKey = (teamId: string, code: string) => `${teamId}:${code}`;
const instant = (minute: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

function preFreeze(attempts: Attempt[]) {
  return attempts.filter((attempt) => attempt.minute <= FREEZE_MINUTE);
}

function pendingAttempts(team: Team, code: string) {
  const attempts = team.submissions[code] ?? [];
  if (preFreeze(attempts).some((attempt) => attempt.status === 'accepted'))
    return [];
  return attempts.filter((attempt) => attempt.minute > FREEZE_MINUTE);
}

const PENDING_CELLS = TEAMS.flatMap((team) =>
  PRACTICE_PROBLEMS.filter(
    (problem) => pendingAttempts(team, problem.problem_code).length > 0,
  ).map((problem) => cellKey(team.id, problem.problem_code)),
);

function problemScore(
  problem: Problem,
  attempts: Attempt[],
): ScoreboardProblemScore {
  let wrongAttempts = 0;
  let firstAccepted: Attempt | undefined;
  for (const attempt of attempts) {
    if (attempt.status === 'accepted') {
      firstAccepted = attempt;
      break;
    }
    if (attempt.status === 'wrong_answer') wrongAttempts++;
  }
  return {
    problem_id: problem.problem_id,
    problem_code: problem.problem_code,
    attempts: wrongAttempts,
    wrong_attempts: wrongAttempts,
    solved: !!firstAccepted,
    penalty: firstAccepted ? firstAccepted.minute + wrongAttempts * 20 : null,
    solved_at: firstAccepted ? instant(firstAccepted.minute) : null,
    best_status: firstAccepted ? 'accepted' : null,
  };
}

function unresolvedAttempts(row: ScoreboardRow) {
  return row.problem_scores.reduce(
    (total, score) => total + (score.solved ? 0 : score.attempts),
    0,
  );
}

function rankRows(rows: ScoreboardRow[]) {
  const scoreCompare = (a: ScoreboardRow, b: ScoreboardRow) =>
    b.solved - a.solved ||
    (a.penalty ?? 0) - (b.penalty ?? 0) ||
    unresolvedAttempts(a) - unresolvedAttempts(b);
  rows.sort(
    (a, b) =>
      scoreCompare(a, b) ||
      (a.last_solved_at ?? 'z').localeCompare(b.last_solved_at ?? 'z') ||
      a.team_name.localeCompare(b.team_name, 'ko'),
  );
  let rank = 1;
  rows.forEach((row, index) => {
    if (index > 0 && scoreCompare(row, rows[index - 1]) !== 0) rank = index + 1;
    row.rank = rank;
  });
  return rows;
}

function scoreRows(snapshot: Snapshot, showCounts: boolean) {
  return rankRows(
    TEAMS.map((team): ScoreboardRow => {
      let submissionCount = 0;
      const problemScores = PRACTICE_PROBLEMS.map((problem) => {
        const code = problem.problem_code;
        const attempts = team.submissions[code] ?? [];
        const visible =
          snapshot.mode === 'all' ||
          snapshot.revealedProblems.includes(cellKey(team.id, code));
        const visibleAttempts = visible ? attempts : preFreeze(attempts);
        submissionCount += visibleAttempts.length;
        const score = problemScore(problem, visibleAttempts);
        if (showCounts && !visible && !score.solved) {
          const pendingCount = pendingAttempts(team, code).length;
          if (pendingCount > 0) score.pending_attempts = pendingCount;
        }
        return score;
      });
      return {
        team_id: team.id,
        team_name: team.name,
        division: PRACTICE_DIVISION.name,
        division_id: PRACTICE_DIVISION.division_id,
        rank: 0,
        solved: problemScores.filter((score) => score.solved).length,
        penalty: problemScores.reduce(
          (total, score) => total + (score.penalty ?? 0),
          0,
        ),
        submission_count: submissionCount,
        last_solved_at:
          problemScores
            .flatMap((score) => (score.solved_at ? [score.solved_at] : []))
            .sort()
            .at(-1) ?? null,
        problem_scores: problemScores,
        is_revealed: true,
      };
    }),
  );
}

function emptySnapshot(mode: Snapshot['mode'] = 'not_started'): Snapshot {
  return { mode, revealedRanks: [], revealedProblems: [], lastEvent: null };
}

const FINAL_ROWS = scoreRows(emptySnapshot('all'), false);
const FINAL_RANKS = Array.from(new Set(FINAL_ROWS.map((row) => row.rank)));

export function createScoreboardPractice(
  strategy: ScoreboardReleaseMode = 'resolver',
): PracticeState {
  return {
    strategy,
    revision: 0,
    current: emptySnapshot(strategy === 'immediate' ? 'all' : 'not_started'),
    history:
      strategy === 'immediate'
        ? [
            {
              before: emptySnapshot('partial'),
              action: { action: 'automatic' },
            },
          ]
        : [],
  };
}

export function getScoreboardPractice(
  state: PracticeState,
  showCounts: boolean,
) {
  const { current, strategy } = state;
  const revealedRanks =
    current.mode === 'all' ? FINAL_RANKS : current.revealedRanks;
  let rows = scoreRows(current, showCounts);
  const hasPendingProblem = (teamId: string | undefined) =>
    PENDING_CELLS.some(
      (key) =>
        key.startsWith(`${teamId}:`) && !current.revealedProblems.includes(key),
    );
  if (strategy === 'manual' && current.mode === 'partial') {
    const finalById = new Map(FINAL_ROWS.map((row) => [row.team_id, row]));
    rows = rows.map((row) => {
      const final = finalById.get(row.team_id)!;
      const published = revealedRanks.includes(final.rank);
      return {
        ...(published
          ? {
              ...final,
              problem_scores: final.problem_scores.map((score) => ({
                ...score,
              })),
            }
          : row),
        is_finalized: published || !hasPendingProblem(row.team_id),
        rank_is_final: published,
      };
    });
    rows.sort(
      (a, b) =>
        Number(b.rank_is_final) - Number(a.rank_is_final) || a.rank - b.rank,
    );
  } else if (strategy === 'resolver' && current.mode === 'partial') {
    rows = rows.map((row) => ({
      ...row,
      is_finalized: !hasPendingProblem(row.team_id),
    }));
  }
  const revealedCount =
    current.mode === 'not_started'
      ? 0
      : strategy === 'manual'
        ? FINAL_ROWS.filter((row) => revealedRanks.includes(row.rank)).length
        : current.mode === 'all'
          ? TEAMS.length
          : rows.filter((row) => row.is_finalized).length;
  const release: ScoreboardRelease = {
    strategy,
    revision: state.revision,
    mode: current.mode,
    ranks:
      current.mode === 'not_started' ||
      strategy === 'immediate' ||
      strategy === 'manual_all' ||
      (strategy === 'resolver' && current.mode !== 'all')
        ? []
        : FINAL_RANKS.map((rank) => ({
            rank,
            team_count: FINAL_ROWS.filter((row) => row.rank === rank).length,
            revealed: revealedRanks.includes(rank),
          })),
    total_count:
      current.mode === 'not_started' && strategy !== 'manual_all'
        ? 0
        : TEAMS.length,
    revealed_count: revealedCount,
    undo: state.history.at(-1) ? { ...state.history.at(-1)!.action } : null,
    resolver:
      strategy === 'resolver'
        ? {
            step:
              current.mode === 'all'
                ? PENDING_CELLS.length
                : current.revealedProblems.length,
            total_steps:
              current.mode === 'not_started' ? 0 : PENDING_CELLS.length,
            pending_count:
              current.mode === 'all' || current.mode === 'not_started'
                ? 0
                : PENDING_CELLS.length - current.revealedProblems.length,
            last_event: current.lastEvent ? { ...current.lastEvent } : null,
          }
        : null,
  };
  return { rows, release, frozen: current.mode !== 'all' };
}

function changeState(
  state: PracticeState,
  current: Snapshot,
  action: Undo,
): PracticeState {
  return {
    ...state,
    current,
    revision: state.revision + 1,
    history: [...state.history, { before: state.current, action }],
  };
}

/** Invalid/stale clicks are no-ops; the preview never contacts a release API. */
export function applyScoreboardPractice(
  state: PracticeState,
  action: ScoreboardReleaseAction,
): PracticeState {
  if (
    action.expected_revision !== undefined &&
    action.expected_revision !== state.revision
  )
    return state;
  const { current, strategy } = state;
  if (action.action === 'undo') {
    const previous = state.history.at(-1);
    if (!previous) return state;
    return {
      ...state,
      current: previous.before,
      revision: state.revision + 1,
      history: state.history.slice(0, -1),
    };
  }
  if (action.action === 'all') {
    if (current.mode === 'all') return state;
    return changeState(
      state,
      {
        ...current,
        mode: 'all',
        ...(strategy === 'resolver' ? { lastEvent: null } : {}),
      },
      { action: 'all' },
    );
  }
  if (
    strategy === 'immediate' ||
    strategy === 'manual_all' ||
    current.mode === 'all'
  )
    return state;
  if (action.action === 'start') {
    if (current.mode !== 'not_started') return state;
    return changeState(
      state,
      { ...current, mode: 'partial' },
      { action: 'start' },
    );
  }
  if (current.mode !== 'partial') return state;
  if (strategy === 'manual' && action.action === 'rank') {
    const rank = action.rank;
    if (
      rank === undefined ||
      !FINAL_RANKS.includes(rank) ||
      current.revealedRanks.includes(rank)
    )
      return state;
    const revealedRanks = [...current.revealedRanks, rank];
    return changeState(
      state,
      {
        ...current,
        revealedRanks,
        mode: revealedRanks.length === FINAL_RANKS.length ? 'all' : 'partial',
      },
      { action: 'rank', rank },
    );
  }
  if (strategy !== 'resolver' || action.action !== 'next') return state;
  if (
    action.expected_step !== undefined &&
    action.expected_step !== current.revealedProblems.length
  )
    return state;
  const pending = PENDING_CELLS.filter(
    (key) => !current.revealedProblems.includes(key),
  );
  const rows = scoreRows(current, false);
  const team = [...rows]
    .reverse()
    .find((row) => pending.some((key) => key.startsWith(`${row.team_id}:`)));
  if (!team) return state;
  const problem = PRACTICE_PROBLEMS.find((problem) =>
    pending.includes(cellKey(team.team_id!, problem.problem_code)),
  );
  if (!problem) return state;
  const key = cellKey(team.team_id!, problem.problem_code);
  const revealedProblems = [...current.revealedProblems, key];
  const next: Snapshot = {
    ...current,
    revealedProblems,
    mode: revealedProblems.length === PENDING_CELLS.length ? 'all' : 'partial',
  };
  const updated = scoreRows(next, false).find(
    (row) => row.team_id === team.team_id,
  )!;
  const teamFixture = TEAMS.find((item) => item.id === team.team_id)!;
  const attempts = pendingAttempts(teamFixture, problem.problem_code);
  next.lastEvent = {
    team_id: team.team_id!,
    team_name: team.team_name,
    problem_code: problem.problem_code,
    status:
      attempts.find((attempt) => attempt.status === 'accepted')?.status ??
      attempts.at(-1)!.status,
    from_rank: team.rank,
    to_rank: updated.rank,
  };
  return changeState(state, next, { action: 'next' });
}
