const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true });
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('./')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const resolved = ['.ts', '.tsx']
        .map((extension) => base + extension)
        .find(fs.existsSync);
      if (resolved)
        return source(
          path.relative(path.resolve(__dirname, '../src'), resolved),
        );
    }
    return native(id);
  };
  modules.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Board = source(
  'components/presentation/PresentationDivisionBoard.tsx',
).default;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.body.innerHTML = '';
  delete window.HTMLElement.prototype.animate;
  delete window.HTMLTableRowElement.prototype.getBoundingClientRect;
  window.matchMedia = () => ({ matches: true });
});
after(() => dom.window.close());
const score = (code, extra = {}) => ({
  problem_code: code,
  attempts: 1,
  wrong_attempts: 1,
  solved: false,
  best_status: 'wrong_answer',
  ...extra,
});
const row = (id, rank, extra = {}) => ({
  team_id: id,
  team_name: id,
  rank,
  solved: 0,
  submission_count: 1,
  division: null,
  problem_scores: [],
  ...extra,
});
const section = (extra = {}) => ({
  division: { division_id: 'division', name: '일반부' },
  frozen: true,
  problems: [],
  rows: [],
  ...extra,
});
async function render(value, extra = {}) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root.render(h(Board, { section: value, ...extra })));
  return document.body;
}

test('hidden manual rows never reveal team, score or medal even with populated data', async () => {
  const body = await render(
    section({
      release: {
        mode: 'partial',
        ranks: [],
        total_count: 1,
        revealed_count: 0,
      },
      rows: [
        row(undefined, 1, {
          team_name: 'Private team name',
          rank_is_final: false,
          is_revealed: false,
          total_score: 87.5,
          problem_scores: [score('A', { score: 87.5, max_score: 100 })],
        }),
      ],
    }),
  );
  assert.doesNotMatch(body.innerHTML, /Private team name|87\.5|금메달/);
  assert.doesNotMatch(body.textContent, /프리즈|공개 대기/);
  assert.ok(body.querySelector('[aria-label="미공개 참가팀"]'));
  assert.equal(
    body.querySelector('[data-scoreboard-row]').dataset.scoreboardRow,
    'unrevealed-1',
  );
});

test('IOI decimal totals and non-100 maximums stay distinct from solved counts', async () => {
  const body = await render(
    section({
      scoring_mode: 'ioi',
      rows: [
        row('Team', 1, {
          total_score: 37.5,
          max_score: 75,
          solved: 1,
          problem_scores: [
            score('A', { score: 12.5, max_score: 25, pending_attempts: 2 }),
            score('B', { score: 25, max_score: 50 }),
          ],
        }),
      ],
    }),
  );
  assert.equal(
    body.querySelector('.presentation-stage-board__total').textContent,
    '37.537.5',
  );
  assert.equal(
    body
      .querySelector('.presentation-stage-board__total')
      .getAttribute('aria-label'),
    '37.5 / 75점',
  );
  assert.equal(
    body.querySelector('.presentation-stage-board__total').title,
    '37.5 / 75점',
  );
  const a = body.querySelectorAll('.presentation-stage-board__problem-cell')[0];
  assert.equal(a.getAttribute('aria-label'), '12.5 / 25점 · 미공개 제출 2건');
  assert.match(a.textContent, /12\.5.*\?2/);
  assert.equal(
    a
      .querySelector('.presentation-stage-board__score')
      .classList.contains('is-partial'),
    true,
  );
  assert.doesNotMatch(body.querySelector('thead').textContent, /페널티/);
  assert.doesNotMatch(a.title, /100/);
});

test('IOI zero, unknown, partial and full scores do not collapse into the same state', async () => {
  const body = await render(
    section({
      scoring_mode: 'ioi',
      rows: [
        row('Team', 1, {
          total_score: 25,
          problem_scores: [
            score('A', {
              attempts: 0,
              wrong_attempts: 0,
              score: 0,
              max_score: 25,
            }),
            score('B', { score: 0, max_score: 25 }),
            score('C', { score: 12.5, max_score: 25 }),
            score('D', { score: 25, max_score: 25, pending_attempts: 3 }),
          ],
        }),
      ],
    }),
  );
  const cells = [
    ...body.querySelectorAll('.presentation-stage-board__problem-cell'),
  ];
  assert.ok(cells[0].querySelector('.presentation-stage-board__empty-mark'));
  assert.ok(cells[1].querySelector('[data-score-state="wrong"]'));
  assert.ok(cells[2].querySelector('.is-partial'));
  assert.ok(cells[3].querySelector('.is-full'));
  assert.doesNotMatch(cells[3].textContent, /\?/);
});

test('IOI point and pending pills keep the published value and hidden count together', async () => {
  const body = await render(
    section({
      scoring_mode: 'ioi',
      rows: [
        row('Team', 1, {
          problem_scores: [
            score('A', { score: 80, max_score: 250, pending_attempts: 1 }),
            score('B', { score: 249.75, max_score: 250 }),
            score('C', { score: 250, max_score: 250, pending_attempts: 2 }),
            score('D', { pending_attempts: 3 }),
          ],
        }),
      ],
    }),
    { fontScale: 3 },
  );
  const cells = [
    ...body.querySelectorAll('.presentation-stage-board__problem-cell'),
  ];
  const group = cells[0].querySelector('.presentation-stage-board__cell-stack');
  assert.equal(group.children.length, 2);
  assert.equal(
    group.querySelector('.is-partial [aria-hidden]').textContent,
    '80',
  );
  assert.equal(group.querySelector('.is-pending').textContent, '?1');
  assert.equal(
    cells[0].getAttribute('aria-label'),
    '80 / 250점 · 미공개 제출 1건',
  );
  assert.equal(cells[1].getAttribute('aria-label'), '249.75 / 250점');
  assert.equal(cells[2].getAttribute('aria-label'), '250 / 250점');
  assert.doesNotMatch(cells[2].textContent, /\?/);
  assert.equal(cells[3].getAttribute('aria-label'), '미공개 제출 3건');
  assert.equal(cells[3].textContent, '?3');
  for (const cell of cells) {
    for (const pill of cell.querySelectorAll('.presentation-score')) {
      assert.ok(
        pill.classList.contains('presentation-stage-board__score-pill'),
      );
      assert.ok(pill.classList.contains('rounded-full'));
    }
  }
});

test('ICPC pending counts follow published data and do not invent hidden counts', async () => {
  const body = await render(
    section({
      rows: [
        row('Team', 1, {
          problem_scores: [
            score('A', { pending_attempts: 3 }),
            score('B'),
            score('C', {
              solved: true,
              wrong_attempts: 0,
              pending_attempts: 2,
            }),
          ],
        }),
      ],
    }),
  );
  const cells = [
    ...body.querySelectorAll('.presentation-stage-board__problem-cell'),
  ];
  assert.equal(cells[0].textContent, '?3');
  assert.equal(cells[1].textContent, '-1');
  assert.equal(cells[2].querySelector('svg') != null, true);
  assert.doesNotMatch(cells[2].textContent, /\?/);
});

test('natural problem order and full accessible names survive the simplified projection table', async () => {
  const longTitle =
    '이것은 매우 긴 문제 이름으로 공백이 없는VeryLongUnbrokenProblemName도 모두 확인할 수 있어야 합니다';
  const longTeam = '매우매우긴팀이름과 함께하는 The Team With A Very Long Name';
  const body = await render(
    section({
      problems: ['A10', 'A2', 'A1'].map((code) => ({
        problem_id: code,
        problem_code: code,
        title: longTitle,
      })),
      rows: [
        row('Team', 1, {
          team_name: longTeam,
          problem_scores: [score('A1'), score('B')],
        }),
      ],
    }),
  );
  assert.deepEqual(
    [...body.querySelectorAll('.presentation-stage-board__problem-code')].map(
      (el) => el.textContent,
    ),
    ['A1', 'A2', 'A10', 'B'],
  );
  assert.equal(
    body.querySelector('table').style.getPropertyValue('--stage-problem-count'),
    '4',
  );
  assert.equal(
    body.querySelector('.presentation-stage-board__team-name').textContent,
    longTeam,
  );
  const headings = [
    ...body.querySelectorAll('.presentation-stage-board__problem-heading'),
  ];
  assert.equal(headings[0].getAttribute('aria-label'), `A1. ${longTitle}`);
  assert.equal(headings[0].title, `A1. ${longTitle}`);
  assert.equal(headings.length, 4);
  assert.equal(body.querySelector('details'), null);
  assert.equal(body.querySelector('.presentation-stage-board__eyebrow'), null);
});

test('manual final and frozen ranks stay in separate published sections with medal gate intact', async () => {
  const rows = [
    row('Released', 5, { rank_is_final: true, is_revealed: true }),
    row('Frozen', 1, { rank_is_final: false }),
  ];
  const value = section({
    rows,
    release: {
      mode: 'partial',
      strategy: 'rank',
      ranks: [],
      total_count: 2,
      revealed_count: 1,
    },
  });
  const body = await render(value);
  assert.deepEqual(
    [...body.querySelectorAll('[data-scoreboard-rank-section]')].map(
      (el) => el.dataset.scoreboardRankSection,
    ),
    ['final', 'frozen'],
  );
  assert.doesNotMatch(body.innerHTML, /금메달/);
  await render({
    ...value,
    release: { ...value.release, mode: 'all' },
    rows: [row('Winner', 1, { is_revealed: true })],
  });
  assert.equal(
    document.querySelector('[aria-label="1위 금메달"]') != null,
    true,
  );
});

for (const reduced of [false, true])
  test(`rank movement retains the row and ${reduced ? 'respects reduced motion' : 'animates the published reorder'}`, async () => {
    window.matchMedia = () => ({ matches: reduced });
    const animations = [];
    window.HTMLElement.prototype.animate = function (frames, options) {
      animations.push({ id: this.dataset.scoreboardRow, frames, options });
      return { cancel() {} };
    };
    window.HTMLTableRowElement.prototype.getBoundingClientRect = function () {
      return { top: [...this.parentElement.children].indexOf(this) * 75 };
    };
    const body = await render(section({ rows: [row('A', 1), row('B', 2)] }));
    const b = body.querySelector('[data-scoreboard-row="B"]');
    await render(section({ rows: [row('B', 1), row('A', 2)] }));
    assert.equal(body.querySelector('[data-scoreboard-row="B"]'), b);
    assert.deepEqual(
      [...body.querySelectorAll('[data-scoreboard-row]')].map(
        (el) => el.dataset.scoreboardRow,
      ),
      ['B', 'A'],
    );
    assert.equal(animations.length, reduced ? 0 : 2);
    if (!reduced) assert.equal(animations[0].options.duration, 600);
  });

test('team and problem highlights remain without public status badges', async () => {
  const value = section({
    rows: [row('A', 1, { problem_scores: [score('A')] })],
    release: {
      mode: 'partial',
      strategy: 'resolver',
      ranks: [],
      total_count: 1,
      revealed_count: 0,
      resolver: {
        step: 1,
        total_steps: 1,
        pending_count: 0,
        last_event: { team_id: 'A', problem_code: 'A' },
      },
    },
  });
  const body = await render(value);
  assert.equal(body.querySelector('.presentation-stage-board__status'), null);
  assert.ok(body.querySelector('.presentation-stage-board__row.is-active'));
  assert.ok(
    body.querySelector(
      '.presentation-stage-board__problem-heading.is-active-problem',
    ),
  );
  assert.ok(
    body.querySelector(
      '.presentation-stage-board__problem-cell.is-active-problem',
    ),
  );
  await render(value, { activeTeamId: null, activeProblemCode: null });
  assert.equal(
    body.querySelector('.presentation-stage-board__row.is-active'),
    null,
  );
  assert.equal(
    body.querySelector(
      '.presentation-stage-board__problem-heading.is-active-problem',
    ),
    null,
  );
});

test('a missing IOI score is not fabricated as zero', async () => {
  const body = await render(
    section({
      scoring_mode: 'ioi',
      rows: [row('A', 1, { problem_scores: [score('A', { max_score: 100 })] })],
    }),
  );
  const cell = body.querySelector('.presentation-stage-board__problem-cell');
  assert.equal(cell.getAttribute('aria-label'), '점수 정보 없음');
  assert.equal(cell.textContent.trim(), '-');
});

test('published, waiting and finalized boards keep visible release status prose out of the scoreboard', async () => {
  for (const mode of ['not_started', 'partial', 'all']) {
    const body = await render(
      section({
        release: {
          mode,
          ranks: [],
          total_count: 2,
          revealed_count: 1,
          resolver: {
            step: 1,
            total_steps: 2,
            pending_count: 1,
            last_event: null,
          },
        },
        rows: [
          row('Known', 1, { is_finalized: true, rank_is_final: true }),
          row('Secret', 2, { is_revealed: false, rank_is_final: false }),
        ],
      }),
    );
    assert.doesNotMatch(
      body.textContent,
      /공개 완료|공개 대기|순위 공개|프리즈|확정 순위|남은 문제|팀·문제 공개|Secret/,
    );
    const separators = [
      ...body.querySelectorAll('[data-scoreboard-rank-section]'),
    ];
    assert.equal(separators.length, 2);
    assert.ok(
      separators.every(
        (el) => el.textContent === '' && el.getAttribute('aria-label'),
      ),
    );
  }
});

test('reveal focus marks every tied target without replacing published rows or values', async () => {
  const value = section({
    scoring_mode: 'ioi',
    rows: [
      row('A', 5, {
        total_score: 25,
        problem_scores: [
          score('C', { score: 25, max_score: 100, pending_attempts: 1 }),
        ],
      }),
      row('B', 6, {
        total_score: 30,
        problem_scores: [
          score('C', { score: 30, max_score: 100, pending_attempts: 1 }),
        ],
      }),
      row('C', 7, {
        team_name: 'Secret team',
        is_revealed: false,
        total_score: 99,
        problem_scores: [score('C', { score: 99, max_score: 100 })],
      }),
    ],
  });
  const body = await render(value, {
    focusTeamIds: ['A', 'B', 'C'],
    activeTeamId: null,
    activeProblemCode: 'C',
    revealFocused: true,
  });
  const board = body.querySelector('.presentation-stage-board');
  assert.equal(board.dataset.presentationDivision, 'division');
  assert.equal(board.dataset.revealFocused, 'true');
  assert.deepEqual(
    [...body.querySelectorAll('[data-active-team="true"]')].map(
      (el) => el.dataset.scoreboardRow,
    ),
    ['A', 'B', 'C'],
  );
  assert.equal(body.querySelectorAll('td.is-active-problem').length, 2);
  assert.equal(
    body.querySelector(
      '[data-scoreboard-row="A"] .presentation-stage-board__rank-value',
    ).textContent,
    '5',
  );
  assert.equal(
    body.querySelector(
      '[data-scoreboard-row="A"] .presentation-stage-board__total [aria-hidden="true"]',
    ).textContent,
    '25',
  );
  assert.doesNotMatch(body.textContent, /Secret team|99/);
  assert.deepEqual(
    value.rows.map((r) => [r.rank, r.total_score]),
    [
      [5, 25],
      [6, 30],
      [7, 99],
    ],
  );
  await render(value, {
    focusTeamIds: [],
    activeTeamId: 'A',
    revealFocused: false,
  });
  assert.equal(board.hasAttribute('data-reveal-focused'), false);
  assert.equal(body.querySelector('[data-active-team="true"]'), null);
});

test('focus reveals an offscreen published row and problem once without fighting later scrolling', async () => {
  const value = section({
    rows: [row('A', 1, { problem_scores: [score('A'), score('B')] })],
  });
  const props = { focusTeamIds: ['A'], activeProblemCode: 'B' };
  const body = await render(value, props);
  const target = body.querySelector('[data-scoreboard-row="A"]');
  const scroll = body.querySelector('.presentation-stage-board__scroll');
  const cell = target.querySelectorAll(
    '.presentation-stage-board__problem-cell',
  )[1];
  const moves = [];
  target.getBoundingClientRect = () => ({ top: 1200, bottom: 1275 });
  target.scrollIntoView = () => {
    throw new Error('Focusing a division must not scroll its ancestors');
  };
  scroll.getBoundingClientRect = () => ({
    left: 20,
    right: 620,
    width: 600,
    top: 100,
    bottom: 700,
    height: 600,
  });
  scroll.querySelector('thead').getBoundingClientRect = () => ({ height: 40 });
  for (const heading of scroll.querySelectorAll('thead th')) {
    heading.style.position = 'sticky';
    heading.style.top = '0px';
    heading.getBoundingClientRect = () => ({ width: 100 });
  }
  cell.getBoundingClientRect = () => ({ left: 1020, right: 1120, width: 100 });
  Object.defineProperties(scroll, {
    clientWidth: { value: 600 },
    scrollWidth: { value: 2000 },
    clientHeight: { value: 600 },
    scrollHeight: { value: 2000 },
  });
  scroll.scrollTo = (options) => moves.push(options);
  await render(value, { ...props, revealFocused: true });
  assert.deepEqual(moves, [
    { top: 817.5, behavior: 'instant' },
    { left: 750, behavior: 'instant' },
  ]);
  scroll.scrollLeft = 500;
  await render(value, { ...props, focusTeamIds: ['A'], revealFocused: true });
  assert.equal(moves.length, 2);
});
