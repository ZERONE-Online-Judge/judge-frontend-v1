const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(
  __dirname,
  '../src/components/operator/guide/scoreboardPractice.ts',
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const {
  PRACTICE_DIVISION,
  PRACTICE_PROBLEMS,
  createScoreboardPractice: create,
  getScoreboardPractice: project,
  applyScoreboardPractice: apply,
} = loaded.exports;

const row = (board, name) =>
  board.rows.find((candidate) => candidate.team_name === name);
const cell = (board, name, code) =>
  row(board, name).problem_scores.find((score) => score.problem_code === code);
const start = (strategy = 'manual') =>
  apply(create(strategy), { action: 'start' });
const scoreboardValues = (board) =>
  board.rows.map((item) => ({
    name: item.team_name,
    rank: item.rank,
    solved: item.solved,
    penalty: item.penalty,
    submission_count: item.submission_count,
    scores: item.problem_scores,
  }));

function deepFreeze(value) {
  Object.freeze(value);
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Object.isFrozen(item))
      deepFreeze(item);
  }
  return value;
}

test('practice is a deterministic fictional division with five ordered problems', () => {
  assert.match(PRACTICE_DIVISION.division_id, /^guide-practice-/);
  assert.deepEqual(
    PRACTICE_PROBLEMS.map((problem) => [
      problem.problem_code,
      problem.display_order,
    ]),
    [
      ['A', 0],
      ['B', 1],
      ['C', 2],
      ['D', 3],
      ['E', 4],
    ],
  );
  assert.deepEqual(project(create(), true), project(create(), true));
  assert.equal(create().strategy, 'resolver');
  assert.equal(project(create(), true).rows.length, 7);
  assert.ok(
    project(create(), true).rows.every((team) =>
      team.team_id.startsWith('guide-team-'),
    ),
  );
});

test('frozen rows retain public records and never reveal hidden verdicts or scores', () => {
  const hidden = project(create(), false);
  const counts = project(create(), true);
  assert.equal(hidden.frozen, true);
  assert.ok(hidden.rows.every((team) => !Object.hasOwn(team, 'rank_is_final')));
  assert.ok(hidden.rows.every((team) => !Object.hasOwn(team, 'is_finalized')));
  assert.deepEqual(hidden.release.ranks, []);
  assert.equal(hidden.release.total_count, 0);
  assert.equal(row(hidden, '느린 번개').rank, 2);
  assert.equal(row(hidden, '하늘 고래').solved, 3);
  assert.equal(row(hidden, '하늘 고래').penalty, 120);
  assert.equal(row(hidden, '차분한 오리').submission_count, 3);
  assert.equal(cell(hidden, '차분한 오리', 'B').attempts, 2);
  assert.equal(cell(hidden, '하늘 고래', 'D').best_status, null);
  assert.equal(cell(hidden, '하늘 고래', 'D').penalty, null);
  assert.equal(cell(hidden, '하늘 고래', 'D').solved_at, null);
  assert.ok(
    hidden.rows.every((team) =>
      team.problem_scores.every(
        (score) => !Object.hasOwn(score, 'pending_attempts'),
      ),
    ),
  );
  assert.equal(cell(counts, '하늘 고래', 'D').pending_attempts, 3);
  assert.equal(cell(counts, '차분한 오리', 'B').pending_attempts, 2);
  assert.equal(cell(counts, '차분한 오리', 'C').pending_attempts, 3);
  // These two submissions were after an already public AC. No ?n is shown.
  assert.equal(cell(counts, '하늘 고래', 'A').pending_attempts, undefined);
  assert.equal(cell(counts, '하늘 고래', 'A').penalty, 20);
  assert.equal(cell(counts, '하늘 고래', 'E').pending_attempts, undefined);
  for (const team of counts.rows) {
    for (const score of team.problem_scores) delete score.pending_attempts;
  }
  assert.deepEqual(counts, hidden);
});

test('manual 5th remains final 5th as another team is revealed', () => {
  const initial = start();
  // No hidden submissions remain for this team, but its final rank has not
  // been announced. Cell completion and final-rank publication are separate.
  assert.equal(row(project(initial, true), '느린 번개').is_finalized, true);
  assert.equal(row(project(initial, true), '느린 번개').rank_is_final, false);
  const fifth = apply(initial, { action: 'rank', rank: 5 });
  const fifthBoard = project(fifth, true);
  assert.equal(row(fifthBoard, '느린 번개').rank, 5);
  assert.equal(row(fifthBoard, '느린 번개').rank_is_final, true);
  assert.equal(row(fifthBoard, '초록 별').rank_is_final, false);
  assert.equal(row(fifthBoard, '초록 별').rank, 3);
  assert.equal(row(fifthBoard, '초록 별').solved, 2);
  assert.ok(fifthBoard.rows.every((team) => team.is_revealed === true));
  assert.equal(fifthBoard.release.revealed_count, 1);

  const fourth = apply(fifth, { action: 'rank', rank: 4 });
  assert.equal(row(project(fourth, true), '느린 번개').rank, 5);
  assert.deepEqual(
    project(fourth, true)
      .rows.filter((team) => team.rank_is_final)
      .map((team) => [team.team_name, team.rank]),
    [
      ['초록 별', 4],
      ['느린 번개', 5],
    ],
  );
  assert.equal(project(fourth, true).release.revealed_count, 2);
  const undo = apply(fourth, { action: 'undo' });
  assert.deepEqual(undo.current, fifth.current);
  assert.deepEqual(
    scoreboardValues(project(undo, true)),
    scoreboardValues(fifthBoard),
  );
});

test('manual tied ranks publish and undo both teams atomically', () => {
  const initial = start();
  assert.deepEqual(
    project(initial, true).release.ranks.find((item) => item.rank === 6),
    { rank: 6, team_count: 2, revealed: false },
  );
  assert.equal(
    project(initial, true).release.ranks.some((item) => item.rank === 7),
    false,
  );
  const tied = apply(initial, { action: 'rank', rank: 6 });
  const board = project(tied, false);
  assert.equal(board.release.revealed_count, 2);
  for (const name of ['차분한 오리', '새벽 토끼']) {
    assert.equal(row(board, name).rank, 6);
    assert.equal(row(board, name).rank_is_final, true);
    assert.equal(row(board, name).penalty, 215);
    assert.equal(cell(board, name, 'B').attempts, 4);
  }
  assert.deepEqual(apply(tied, { action: 'undo' }).current, initial.current);
});

test('all and undo restore partial ranks and the frozen pre-start state exactly', () => {
  const initial = create('manual');
  const begun = apply(initial, { action: 'start' });
  const partial = apply(begun, { action: 'rank', rank: 5 });
  const all = apply(partial, { action: 'all' });
  assert.equal(project(all, true).frozen, false);
  assert.equal(project(all, true).release.revealed_count, 7);
  const restored = apply(all, { action: 'undo' });
  assert.deepEqual(restored.current, partial.current);
  const unranked = apply(restored, { action: 'undo' });
  assert.deepEqual(unranked.current, begun.current);
  assert.deepEqual(
    apply(unranked, { action: 'undo' }).current,
    initial.current,
  );
});

test('resolver consumes all-WA cell, then CE-WA-AC cell and refreshes rank', () => {
  const initial = start('resolver');
  assert.equal(project(initial, true).release.resolver.total_steps, 11);
  assert.deepEqual(project(initial, true).release.ranks, []);
  const first = apply(initial, { action: 'next', expected_step: 0 });
  const firstBoard = project(first, true);
  assert.deepEqual(firstBoard.release.resolver.last_event, {
    team_id: 'guide-team-duck',
    team_name: '차분한 오리',
    problem_code: 'B',
    status: 'wrong_answer',
    from_rank: 6,
    to_rank: 7,
  });
  assert.equal(firstBoard.release.resolver.step, 1);
  assert.equal(cell(firstBoard, '차분한 오리', 'B').attempts, 4);
  assert.equal(
    cell(firstBoard, '차분한 오리', 'B').pending_attempts,
    undefined,
  );
  assert.equal(row(firstBoard, '차분한 오리').solved, 1);
  assert.equal(row(firstBoard, '차분한 오리').penalty, 45);

  const second = apply(first, { action: 'next', expected_step: 1 });
  const secondBoard = project(second, true);
  assert.equal(
    secondBoard.release.resolver.last_event.team_name,
    '차분한 오리',
  );
  assert.equal(secondBoard.release.resolver.last_event.problem_code, 'C');
  assert.equal(secondBoard.release.resolver.last_event.status, 'accepted');
  assert.equal(secondBoard.release.resolver.last_event.from_rank, 7);
  assert.equal(secondBoard.release.resolver.last_event.to_rank, 6);
  assert.equal(cell(secondBoard, '차분한 오리', 'C').wrong_attempts, 1);
  assert.equal(cell(secondBoard, '차분한 오리', 'C').penalty, 170);
  assert.equal(row(secondBoard, '차분한 오리').penalty, 215);
  const third = apply(second, { action: 'next', expected_step: 2 });
  assert.equal(
    project(third, true).release.resolver.last_event.team_name,
    '새벽 토끼',
  );
  assert.equal(
    project(third, true).release.resolver.last_event.problem_code,
    'B',
  );
});

test('resolver WA-WA-AC is one step, solved cells are skipped and post-AC WA is ignored', () => {
  let state = start('resolver');
  let steps = 0;
  let whaleStep;
  let rabbitStep;
  while (project(state, true).release.mode !== 'all') {
    state = apply(state, { action: 'next', expected_step: steps });
    steps++;
    const board = project(state, true);
    const event = board.release.resolver.last_event;
    assert.notEqual(event.problem_code, 'A');
    if (event.team_name === '하늘 고래') whaleStep = board;
    if (event.team_name === '새벽 토끼' && event.problem_code === 'C')
      rabbitStep = board;
    assert.ok(
      steps <= 11,
      'resolver must finish in exactly one action per pending cell',
    );
  }
  assert.equal(steps, 11);
  assert.equal(cell(whaleStep, '하늘 고래', 'D').solved, true);
  assert.equal(cell(whaleStep, '하늘 고래', 'D').attempts, 2);
  assert.equal(cell(whaleStep, '하늘 고래', 'D').penalty, 190);
  assert.equal(cell(rabbitStep, '새벽 토끼', 'C').wrong_attempts, 1);
  assert.equal(cell(rabbitStep, '새벽 토끼', 'C').penalty, 170);
  assert.equal(cell(project(state, true), '하늘 고래', 'A').penalty, 20);
});

test('resolver undo restores whole problem and next resumes the identical step', () => {
  let state = start('resolver');
  state = apply(state, { action: 'next' });
  const before = state;
  const after = apply(before, { action: 'next' });
  const restored = apply(after, { action: 'undo' });
  assert.deepEqual(restored.current, before.current);
  assert.equal(
    cell(project(restored, true), '차분한 오리', 'C').pending_attempts,
    3,
  );
  assert.equal(cell(project(restored, true), '차분한 오리', 'C').attempts, 0);
  const replayed = apply(restored, { action: 'next' });
  assert.deepEqual(replayed.current, after.current);
  const all = apply(replayed, { action: 'all' });
  assert.equal(project(all, true).release.resolver.last_event, null);
  assert.deepEqual(apply(all, { action: 'undo' }).current, replayed.current);
});

test('all modes finish with independently calculated final ranking and penalty', () => {
  const expected = [
    ['하늘 고래', 1, 4, 310, 8],
    ['달빛 코더', 2, 4, 400, 5],
    ['파란 여우', 3, 4, 415, 4],
    ['초록 별', 4, 4, 430, 6],
    ['느린 번개', 5, 3, 155, 3],
    ['새벽 토끼', 6, 2, 215, 8],
    ['차분한 오리', 6, 2, 215, 8],
  ];
  let reference;
  for (const strategy of ['manual', 'resolver', 'manual_all', 'immediate']) {
    let state = create(strategy);
    if (strategy === 'manual') {
      state = apply(state, { action: 'start' });
      for (const rank of [6, 5, 4, 3, 2, 1])
        state = apply(state, { action: 'rank', rank });
    } else if (strategy === 'resolver') {
      state = apply(state, { action: 'start' });
      for (let step = 0; step < 11; step++)
        state = apply(state, { action: 'next' });
    } else if (strategy === 'manual_all') {
      state = apply(state, { action: 'all' });
    }
    const board = project(state, true);
    assert.equal(board.frozen, false);
    assert.equal(board.release.mode, 'all');
    assert.ok(
      board.rows.every((team) => !Object.hasOwn(team, 'rank_is_final')),
    );
    assert.ok(board.rows.every((team) => !Object.hasOwn(team, 'is_finalized')));
    assert.deepEqual(
      board.rows.map((team) => [
        team.team_name,
        team.rank,
        team.solved,
        team.penalty,
        team.submission_count,
      ]),
      expected,
    );
    assert.ok(
      board.rows.every((team) =>
        team.problem_scores.every(
          (score) => score.pending_attempts === undefined,
        ),
      ),
    );
    const values = scoreboardValues(board);
    if (reference) assert.deepEqual(values, reference);
    else reference = values;
  }
});

test('immediate undo holds freeze until explicitly published again', () => {
  const automatic = create('immediate');
  assert.equal(project(automatic, true).release.mode, 'all');
  assert.equal(project(automatic, true).release.undo.action, 'automatic');
  const held = apply(automatic, { action: 'undo' });
  assert.equal(project(held, true).frozen, true);
  assert.equal(project(held, true).release.mode, 'partial');
  assert.equal(row(project(held, true), '느린 번개').rank, 2);
  assert.equal(apply(held, { action: 'next' }), held);
  const published = apply(held, { action: 'all' });
  assert.equal(row(project(published, true), '느린 번개').rank, 5);
  assert.deepEqual(apply(published, { action: 'undo' }).current, held.current);
});

test('operator bulk release waits for all, then undo restores frozen waiting without a rank snapshot', () => {
  const waiting = deepFreeze(create('manual_all'));
  const frozen = project(waiting, true);
  assert.equal(frozen.release.mode, 'not_started');
  assert.equal(frozen.release.total_count, frozen.rows.length);
  assert.equal(frozen.release.undo, null);
  assert.equal(frozen.frozen, true);
  assert.deepEqual(frozen.release.ranks, []);
  assert.equal(frozen.release.resolver, null);
  assert.equal(row(frozen, '느린 번개').rank, 2);
  for (const action of [
    { action: 'start' },
    { action: 'rank', rank: 5 },
    { action: 'next' },
    { action: 'undo' },
  ])
    assert.equal(apply(waiting, action), waiting);
  assert.equal(
    apply(waiting, { action: 'all', expected_revision: 1 }),
    waiting,
  );
  const published = deepFreeze(
    apply(waiting, { action: 'all', expected_revision: 0 }),
  );
  const live = project(published, true);
  assert.equal(live.release.mode, 'all');
  assert.equal(live.release.undo.action, 'all');
  assert.equal(live.release.revealed_count, 7);
  assert.equal(live.frozen, false);
  assert.deepEqual(live.release.ranks, []);
  assert.ok(
    live.rows.every(
      (team) =>
        !Object.hasOwn(team, 'rank_is_final') &&
        !Object.hasOwn(team, 'is_finalized'),
    ),
  );
  assert.equal(row(live, '느린 번개').rank, 5);
  assert.deepEqual(
    scoreboardValues(live),
    scoreboardValues(project(create('immediate'), true)),
  );
  assert.equal(apply(published, { action: 'all' }), published);
  assert.equal(
    apply(published, { action: 'undo', expected_revision: 0 }),
    published,
  );
  const restored = apply(published, { action: 'undo', expected_revision: 1 });
  assert.deepEqual(restored.current, waiting.current);
  assert.equal(project(restored, true).release.total_count, frozen.rows.length);
  assert.deepEqual(
    scoreboardValues(project(restored, true)),
    scoreboardValues(frozen),
  );
  assert.equal(project(restored, true).release.mode, 'not_started');
  assert.deepEqual(project(restored, true).release.ranks, []);
  assert.deepEqual(
    scoreboardValues(project(apply(restored, { action: 'all' }), true)),
    scoreboardValues(live),
  );
});

test('the count policy changes only pending counts in all four release strategies', () => {
  for (const strategy of ['resolver', 'manual', 'manual_all', 'immediate']) {
    const waiting =
      strategy === 'immediate'
        ? apply(create(strategy), { action: 'undo' })
        : create(strategy);
    const hidden = project(waiting, false);
    const counts = project(waiting, true);
    assert.equal(hidden.frozen, true);
    assert.equal(cell(hidden, '차분한 오리', 'B').attempts, 2);
    assert.equal(cell(hidden, '차분한 오리', 'B').pending_attempts, undefined);
    assert.equal(cell(counts, '차분한 오리', 'B').pending_attempts, 2);
    assert.equal(cell(counts, '차분한 오리', 'C').solved, false);
    assert.equal(cell(counts, '차분한 오리', 'C').best_status, null);
    assert.equal(cell(counts, '차분한 오리', 'C').penalty, null);
    for (const team of counts.rows)
      for (const score of team.problem_scores) delete score.pending_attempts;
    assert.deepEqual(counts, hidden);
  }
});

test('stale revisions, duplicate clicks and invalid actions do not mutate state', () => {
  const initial = deepFreeze(create('resolver'));
  assert.equal(apply(initial, { action: 'next' }), initial);
  assert.equal(apply(initial, { action: 'rank', rank: 5 }), initial);
  const begun = deepFreeze(
    apply(initial, { action: 'start', expected_revision: 0 }),
  );
  assert.equal(apply(begun, { action: 'start' }), begun);
  assert.equal(apply(begun, { action: 'next', expected_revision: 0 }), begun);
  const next = deepFreeze(
    apply(begun, { action: 'next', expected_revision: 1, expected_step: 0 }),
  );
  assert.equal(apply(next, { action: 'next', expected_step: 0 }), next);
  assert.equal(apply(next, { action: 'undo', expected_revision: 1 }), next);
  assert.equal(project(begun, true).release.resolver.step, 0);
  assert.equal(project(next, true).release.resolver.step, 1);
  const manual = deepFreeze(start());
  assert.equal(apply(manual, { action: 'rank', rank: 7 }), manual);
  assert.equal(apply(manual, { action: 'next' }), manual);
  const fifth = deepFreeze(apply(manual, { action: 'rank', rank: 5 }));
  assert.equal(apply(fifth, { action: 'rank', rank: 5 }), fifth);
  assert.equal(project(manual, true).release.revealed_count, 0);
});
