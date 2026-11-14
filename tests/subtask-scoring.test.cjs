const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const loaded = new Map();
function source(relative) {
  let filename = path.resolve(__dirname, '../src', relative);
  if (!path.extname(filename))
    filename += fs.existsSync(`${filename}.tsx`) ? '.tsx' : '.ts';
  if (filename.endsWith('.css')) return {};
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const entry = new Module(filename, module);
  entry.filename = filename;
  entry.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.set(filename, entry);
  const native = entry.require.bind(entry);
  entry.require = (id) =>
    id.startsWith('@/')
      ? source(id.slice(2))
      : id.startsWith('.')
        ? source(
            path.relative(
              path.resolve(__dirname, '../src'),
              path.resolve(path.dirname(filename), id),
            ),
          )
        : native(id);
  entry._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return entry.exports;
}
const {
  validateSubtaskDrafts: validate,
  parseSubtaskOrders: orders,
  nextSubtaskId,
} = source('domains/problemManagement/subtasks.ts');
const { submissionScoreLabel: label } = source(
  'domains/submissionScoreboard/scoring.ts',
);
const {
  createScoreboardPractice: create,
  getScoreboardPractice: project,
  applyScoreboardPractice: apply,
} = source('components/operator/guide/scoreboardPractice.ts');
const Table = source(
  'components/contest/scoreboard/ContestScoreboardTable.tsx',
).default;
const Details = source(
  'components/contest/submissions/SubmissionScoreDetails.tsx',
).default;
const base = [
  { id: 'small', name: '작은 입력', points: '30', testcases: '1,2' },
  { id: 'large', name: '큰 입력', points: '70', testcases: '2-4' },
];

test('subtask editing validates real coverage and exact 100 points while allowing overlap', () => {
  const result = validate(base, [1, 2, 3, 4]);
  assert.equal(result.error, null);
  assert.equal(
    validate([{ ...base[0], id: 'group.small' }, base[1]], [1, 2, 3, 4]).error,
    null,
  );
  assert.match(
    validate([{ ...base[0], id: '_reserved' }, base[1]], [1, 2, 3, 4]).error,
    /식별자/,
  );
  assert.deepEqual(result.groups[1].testcase_orders, [2, 3, 4]);
  assert.match(validate(base, [1, 2, 3, 4, 5]).error, /배정하지 않은/);
  assert.match(
    validate([{ ...base[0], testcases: '0' }], [1]).error,
    /테스트 번호/,
  );
  assert.match(
    validate([{ ...base[0], points: '100.0' }], [1, 2]).error,
    /정수/,
  );
  assert.match(
    validate([{ ...base[0], testcases: '1, 9' }], [1, 2]).error,
    /없는 테스트/,
  );
  assert.match(
    validate([{ ...base[0], points: '29' }, base[1]], [1, 2, 3, 4]).error,
    /100점/,
  );
  assert.match(
    validate([base[0], { ...base[1], id: 'small' }], [1, 2, 3, 4]).error,
    /고유한/,
  );
  assert.deepEqual(validate([], [1, 2]), { groups: [], error: null });
  assert.deepEqual(orders('5, 1-3 2，4'), [1, 2, 3, 4, 5]);
  assert.equal(nextSubtaskId(['st1', 'st2', 'large']), 'st3');
  for (const value of ['1.5', '-1', '5-1', 'a', '1-10000000'])
    assert.equal(orders(value), null);
});

test('submission points keep null unofficial scores separate from legitimate zero and never change ICPC labels', () => {
  assert.equal(
    label({
      scoring_mode: 'ioi',
      score: 30,
      max_score: 100,
      status: 'wrong_answer',
    }),
    '30 / 100점',
  );
  assert.equal(
    label({
      scoring_mode: 'ioi',
      score: 0,
      max_score: 100,
      status: 'compile_error',
    }),
    '0 / 100점',
  );
  assert.equal(
    label({
      scoring_mode: 'ioi',
      score: null,
      max_score: 100,
      status: 'system_error',
    }),
    '점수 미반영',
  );
  assert.equal(
    label({
      scoring_mode: 'ioi',
      score: 30,
      max_score: 100,
      status: 'judging',
    }),
    null,
  );
  assert.equal(label({ score: 100, status: 'accepted' }), null);
});

test('IOI practice combines complementary group passes across submissions and shares equal-score ranks without time penalty', () => {
  const board = project(create('resolver', 'ioi'), true);
  const duck = board.rows.find((row) => row.team_name === '차분한 오리');
  const cell = duck.problem_scores.find((cell) => cell.problem_code === 'B');
  assert.equal(cell.best_status, 'wrong_answer');
  assert.equal(cell.score, 100);
  assert.equal(cell.solved, true);
  assert.deepEqual(
    cell.subtask_scores.map((group) => group.score),
    [30, 70],
  );
  const final = project(
    apply(create('resolver', 'ioi'), { action: 'all' }),
    true,
  );
  for (const row of final.rows)
    for (const other of final.rows)
      if (row.total_score === other.total_score)
        assert.equal(row.rank, other.rank);
  assert.equal(final.rows[0].total_score, 400);
});

test('IOI freeze and resolver undo restore the same published scores and expose the score delta', () => {
  const initial = apply(create('resolver', 'ioi'), { action: 'start' });
  const frozen = project(initial, true);
  const next = apply(initial, { action: 'next' });
  const reveal = project(next, true);
  assert.equal(typeof reveal.release.resolver.last_event.to_score, 'number');
  assert.equal(typeof reveal.release.resolver.last_event.score_delta, 'number');
  const restored = project(apply(next, { action: 'undo' }), true);
  const scores = (board) =>
    board.rows.map((row) => [
      row.team_id,
      row.rank,
      row.total_score,
      row.problem_scores.map((cell) => cell.score),
    ]);
  assert.deepEqual(scores(restored), scores(frozen));
  assert.equal(frozen.frozen, true);
});

test('IOI table shows total and visible partial points beside a pending marker without ICPC penalty columns', () => {
  const rows = [
    {
      rank: 1,
      team_id: 'team',
      team_name: '테스트 팀',
      solved: 0,
      total_score: 30,
      penalty: 999,
      submission_count: 2,
      problem_scores: [
        {
          problem_code: 'A',
          score: 30,
          max_score: 100,
          attempts: 1,
          wrong_attempts: 1,
          solved: false,
          pending_attempts: 1,
          best_status: 'wrong_answer',
        },
      ],
    },
  ];
  const points = renderToStaticMarkup(
    React.createElement(Table, { rows, scoringMode: 'ioi' }),
  );
  assert.match(points, /총점/);
  assert.match(points, /30점/);
  assert.match(points, /30 \/ 100점/);
  assert.match(points, /미공개 제출 1건/);
  assert.doesNotMatch(points, /총시간\(min\)|999/);
  const icpc = renderToStaticMarkup(React.createElement(Table, { rows }));
  assert.match(icpc, /총시간\(min\)/);
  assert.match(icpc, /999/);
  assert.doesNotMatch(icpc, /30점/);
});

test('submission group detail preserves failure verdict and does not render hidden input evidence', () => {
  const markup = renderToStaticMarkup(
    React.createElement(Details, {
      submission: {
        scoring_mode: 'ioi',
        score: 30,
        max_score: 100,
        status: 'wrong_answer',
        subtask_results: [
          {
            subtask_id: 'small',
            name: '작은 입력',
            score: 30,
            max_score: 30,
            status: 'accepted',
          },
          {
            subtask_id: 'large',
            name: '큰 입력',
            score: 0,
            max_score: 70,
            status: 'wrong_answer',
            failed_testcase_order: 8,
            input: 'SECRET-TEST',
          },
        ],
      },
    }),
  );
  const text = markup.replace(/<[^>]+>/g, '');
  assert.match(text, /30 \/ 100점/);
  assert.match(markup, /틀렸습니다/);
  assert.match(markup, /#8/);
  assert.doesNotMatch(markup, /SECRET-TEST/);
  assert.match(markup, /최고점을 여러 제출/);
});
