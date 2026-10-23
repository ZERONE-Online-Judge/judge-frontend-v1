const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file))),
    );
  };
  cache.set(filename, loaded);
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
const Table = source(
  'components/contest/scoreboard/ContestScoreboardTable.tsx',
).default;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  delete dom.window.HTMLElement.prototype.animate;
  delete dom.window.HTMLTableRowElement.prototype.getBoundingClientRect;
  document.body.innerHTML = '';
});
after(() => dom.window.close());
function row(id, rank) {
  return {
    team_id: id,
    team_name: id,
    rank,
    solved: 1,
    penalty: 60,
    submission_count: 2,
    problem_scores: [],
  };
}
async function mount(rows, release) {
  const element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () =>
    root.render(React.createElement(Table, { rows, release })),
  );
  return element;
}
for (const reduced of [false, true])
  test(`rank changes retain row identity and ${reduced ? 'respect reduced motion' : 'animate to the new position'}`, async () => {
    window.matchMedia = () => ({ matches: reduced });
    const animations = [];
    dom.window.HTMLElement.prototype.animate = function (frames, options) {
      animations.push({ id: this.dataset.scoreboardRow, frames, options });
      return { cancel() {} };
    };
    dom.window.HTMLTableRowElement.prototype.getBoundingClientRect =
      function () {
        return { top: [...this.parentElement.children].indexOf(this) * 50 };
      };
    const element = await mount([row('alpha', 1), row('beta', 2)]);
    const beta = element.querySelector('[data-scoreboard-row="beta"]');
    assert.equal(animations.length, 0);
    await act(async () =>
      root.render(
        React.createElement(Table, { rows: [row('beta', 1), row('alpha', 2)] }),
      ),
    );
    assert.equal(element.querySelector('[data-scoreboard-row="beta"]'), beta);
    assert.deepEqual(
      [...element.querySelectorAll('tbody tr')].map(
        (el) => el.dataset.scoreboardRow,
      ),
      ['beta', 'alpha'],
    );
    if (reduced) assert.equal(animations.length, 0);
    else {
      assert.equal(animations.length, 2);
      assert.deepEqual(animations.find((item) => item.id === 'beta').frames, [
        { transform: 'translateY(50px)' },
        { transform: 'translateY(0)' },
      ]);
    }
  });
test('unrevealed submissions are visibly pending until a published result arrives', async () => {
  window.matchMedia = () => ({ matches: true });
  const waiting = {
    ...row('team', 1),
    solved: 0,
    problem_scores: [
      {
        problem_code: 'A',
        solved: false,
        attempts: 1,
        wrong_attempts: 1,
        pending_attempts: 2,
        best_status: null,
      },
    ],
  };
  const element = await mount([waiting]);
  assert.match(element.textContent, /\?2/);
  assert.match(element.querySelector('[title]').title, /미공개 제출 2건/);
  assert.equal(element.querySelector('svg[aria-label="정답"]'), null);
  await act(async () =>
    root.render(
      React.createElement(Table, {
        rows: [
          {
            ...waiting,
            solved: 1,
            problem_scores: [
              {
                ...waiting.problem_scores[0],
                solved: true,
                pending_attempts: 0,
                wrong_attempts: 0,
                best_status: 'accepted',
              },
            ],
          },
        ],
      }),
    ),
  );
  assert.doesNotMatch(element.textContent, /\?2/);
  assert.ok(element.querySelector('svg[aria-label="정답"]'));
});

function medalsIn(element) {
  return [...element.querySelectorAll('td.zoj-score-team svg[role="img"]')].map(
    (medal) => ({
      team: medal.closest('tr').dataset.scoreboardRow,
      label: medal.getAttribute('aria-label'),
    }),
  );
}

test('podium medals stay hidden before release, including finalized resolver teams', async () => {
  const rows = [1, 2, 3].map((rank) => ({
    ...row(`team-${rank}`, rank),
    is_revealed: true,
    is_finalized: true,
  }));
  const element = await mount(rows);
  assert.deepEqual(medalsIn(element), []);
  for (const strategy of ['manual', 'immediate', 'resolver']) {
    await act(async () =>
      root.render(
        React.createElement(Table, {
          rows,
          release: { strategy, mode: 'not_started' },
        }),
      ),
    );
    assert.deepEqual(medalsIn(element), []);
  }
  await act(async () =>
    root.render(
      React.createElement(Table, {
        rows,
        release: { strategy: 'resolver', mode: 'partial' },
      }),
    ),
  );
  assert.deepEqual(medalsIn(element), []);
});

test('manual partial ranks wait until all public scores settle before awarding medals', async () => {
  const rows = [1, 2, 3, 4].map((rank) => ({
    ...row(`team-${rank}`, rank),
    is_revealed: rank >= 3,
  }));
  const element = await mount(rows, { strategy: 'manual', mode: 'partial' });
  assert.deepEqual(medalsIn(element), []);
  rows[1].is_revealed = true;
  // Older release responses omit strategy; their release mode is manual.
  await act(async () =>
    root.render(
      React.createElement(Table, { rows, release: { mode: 'partial' } }),
    ),
  );
  assert.deepEqual(medalsIn(element), []);
});

test('fully released ranks award gold, silver and bronze and preserve tied ranks', async () => {
  const rows = [
    row('gold', 1),
    row('silver', 2),
    row('bronze', 3),
    row('fourth', 4),
  ];
  // Immediate release rows do not have an is_revealed flag.
  const element = await mount(rows, { strategy: 'immediate', mode: 'all' });
  assert.deepEqual(medalsIn(element), [
    { team: 'gold', label: '1위 금메달' },
    { team: 'silver', label: '2위 은메달' },
    { team: 'bronze', label: '3위 동메달' },
  ]);
  await act(async () =>
    root.render(
      React.createElement(Table, {
        rows: [
          row('gold', 1),
          row('silver-a', 2),
          row('silver-b', 2),
          row('fourth', 4),
        ],
        release: { strategy: 'manual', mode: 'all' },
      }),
    ),
  );
  assert.deepEqual(medalsIn(element), [
    { team: 'gold', label: '1위 금메달' },
    { team: 'silver-a', label: '2위 은메달' },
    { team: 'silver-b', label: '2위 은메달' },
  ]);
});
