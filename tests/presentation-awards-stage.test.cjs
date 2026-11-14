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
window.matchMedia = () => ({ matches: false });
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
        .map((ext) => base + ext)
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
const Awards = source(
  'components/presentation/PresentationAwardsStage.tsx',
).default;
const row = (id, rank, extra = {}) => ({
  team_id: id,
  team_name: id,
  rank,
  solved: 5,
  penalty: 120,
  submission_count: 7,
  division: null,
  problem_scores: [],
  ...extra,
});
const section = (rows, extra = {}) => ({
  division: { division_id: 'division', name: '일반부' },
  release: {
    mode: 'all',
    ranks: [],
    total_count: rows.length,
    revealed_count: rows.length,
  },
  frozen: false,
  problems: [],
  rows,
  ...extra,
});
let root, timers, sequence, completed, frames, frameSequence, clock;
async function render(value, extra = {}) {
  if (!root) {
    timers = new Map();
    sequence = 0;
    completed = 0;
    clock = 0;
    frames = new Map();
    frameSequence = 0;
    window.performance.now = () => clock;
    window.requestAnimationFrame = (callback) => {
      frames.set(++frameSequence, callback);
      return frameSequence;
    };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    window.setTimeout = (callback, delay) => {
      timers.set(++sequence, { callback, delay });
      return sequence;
    };
    window.clearTimeout = (id) => timers.delete(id);
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root.render(
      h(
        React.StrictMode,
        null,
        h(Awards, {
          section: value,
          contestTitle: '2026 ZOAC',
          onComplete: () => completed++,
          ...extra,
        }),
      ),
    ),
  );
  return document.body;
}
async function completeTimer() {
  const callbacks = [...timers.values()];
  timers.clear();
  await act(async () => callbacks.forEach(({ callback }) => callback()));
}
function frameAt(time) {
  clock = time;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}
async function overflowList() {
  const list = document.querySelector('.presentation-awards-teams');
  list.style.overflowY = 'auto';
  Object.defineProperties(list, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 500 },
  });
  await act(async () => window.dispatchEvent(new window.Event('resize')));
  return list;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.body.innerHTML = '';
});
after(() => dom.window.close());

test('official ranks keep every tied winner without inventing second place or exposing hidden teams', async () => {
  const body = await render(
    section([
      row('Gold A', 1),
      row('Gold B', 1),
      row('Bronze', 3),
      row('Fourth', 4),
      row('Private', 1, { is_revealed: false }),
      row(undefined, 2, { team_name: 'Unidentified' }),
    ]),
  );
  assert.deepEqual(
    [...body.querySelectorAll('[data-place]')].map((e) => e.dataset.place),
    ['1', '3'],
  );
  assert.equal(
    body.querySelector('[data-place="1"]').getAttribute('aria-label'),
    '공동 1위',
  );
  assert.equal(
    body.querySelectorAll('[data-place="1"] .presentation-awards-team').length,
    2,
  );
  assert.doesNotMatch(body.textContent, /Fourth|Private|Unidentified/);
  assert.equal(body.querySelector('[data-place="2"]'), null);
});

test('a fully public snapshot uses its official rank despite a retained frozen-rank flag', async () => {
  const body = await render(
    section([row('Official', 1, { rank_is_final: false })]),
  );
  assert.equal(body.querySelector('h3').textContent, 'Official');
  await render(section([row('Waiting', 1)], { release: { mode: 'partial' } }));
  assert.equal(body.querySelector('.presentation-awards-place'), null);
  assert.doesNotMatch(body.textContent, /Waiting/);
});

test('the full podium uses a 2, 1, 3 layout and each medal owns its SVG gradient IDs', async () => {
  const body = await render(
    section([row('One', 1), row('Two', 2), row('Three', 3)]),
  );
  assert.deepEqual(
    [...body.querySelectorAll('[data-place]')].map((e) => e.dataset.place),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    [...body.querySelectorAll('svg[role="img"]')].map((e) =>
      e.getAttribute('aria-label'),
    ),
    ['2위 은메달', '1위 금메달', '3위 동메달'],
  );
  const ids = [...body.querySelectorAll('defs [id]')].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const element of body.querySelectorAll('[fill^="url("]')) {
    const id = element.getAttribute('fill').slice(5, -1);
    assert.ok(document.getElementById(id));
  }
  assert.equal(body.querySelectorAll('button').length, 1);
});

test('IOI decimal points use the actual maximum and zero scores stay visible', async () => {
  const body = await render(
    section(
      [
        row('Fraction', 1, { total_score: 249.75, max_score: 250 }),
        row('Zero', 2, { total_score: 0, max_score: 250 }),
      ],
      { scoring_mode: 'ioi' },
    ),
  );
  assert.equal(
    body.querySelector('[data-place="1"] .presentation-awards-result')
      .textContent,
    '249.75점',
  );
  assert.equal(
    body.querySelector('[data-place="1"] .presentation-awards-detail')
      .textContent,
    '/ 250점',
  );
  assert.equal(
    body.querySelector('[data-place="2"] .presentation-awards-result')
      .textContent,
    '0점',
  );
  assert.doesNotMatch(body.textContent, /100점|문제|페널티/);
});

test('ICPC shows solved problems and penalty, and long tied names remain complete', async () => {
  const name = '공백없는VeryLongTeamName'.repeat(8);
  const body = await render(
    section([row('A', 1, { team_name: name }), row('B', 1)]),
    { reducedMotion: true },
  );
  assert.equal(body.querySelector('h3').textContent, name);
  assert.equal(
    body.querySelector('.presentation-awards-result').textContent,
    '5문제',
  );
  assert.equal(
    body.querySelector('.presentation-awards-detail').textContent,
    '페널티 120',
  );
  assert.equal(body.querySelector('.presentation-awards-teams').tabIndex, 0);
});

test('one team and an empty podium never fabricate additional award recipients', async () => {
  const body = await render(section([row('Only', 1)]));
  assert.equal(
    body.querySelector('.presentation-awards-podium').dataset.count,
    '1',
  );
  assert.equal(body.querySelectorAll('.presentation-awards-place').length, 1);
  await render(section([row('Not public', 1, { is_revealed: false })]));
  assert.equal(body.querySelectorAll('.presentation-awards-place').length, 0);
  assert.match(body.textContent, /함께해 주셔서 감사합니다/);
  assert.doesNotMatch(body.textContent, /Not public/);
});

test('one 7.6 second timer survives callback rerenders and StrictMode, then finishes once', async () => {
  const value = section([row('A', 1)]);
  await render(value);
  assert.equal(timers.size, 1);
  assert.ok(
    [...timers.values()][0].delay > 7500 &&
      [...timers.values()][0].delay <= 7600,
  );
  const original = [...timers.keys()][0];
  let latest = 0;
  await render(value, { onComplete: () => latest++ });
  assert.equal([...timers.keys()][0], original);
  await completeTimer();
  assert.equal(completed, 0);
  assert.equal(latest, 1);
  await act(async () => document.querySelector('button').click());
  assert.equal(latest, 1);
});

test('Escape or the return button finishes once and no later timer duplicates it', async () => {
  await render(section([row('A', 1)]));
  const event = new window.KeyboardEvent('keydown', {
    key: 'Escape',
    cancelable: true,
    bubbles: true,
  });
  await act(async () => document.dispatchEvent(event));
  assert.equal(event.defaultPrevented, true);
  await act(async () => document.querySelector('button').click());
  await completeTimer();
  assert.equal(completed, 1);
});

test('reduced motion has no particles, displays its awards immediately and completes sooner', async () => {
  const body = await render(section([row('A', 1)]), { reducedMotion: true });
  assert.equal(
    body.querySelector('.presentation-awards-stage').dataset.reducedMotion,
    'true',
  );
  assert.equal(body.querySelector('.presentation-awards-particles'), null);
  assert.ok(
    [...timers.values()][0].delay > 3400 &&
      [...timers.values()][0].delay <= 3500,
  );
  assert.equal(body.querySelectorAll('.presentation-awards-place').length, 1);
  await completeTimer();
  assert.equal(completed, 1);
});

test('scope changes replace the old timeout and unmount clears pending work', async () => {
  await render(section([row('A', 1)]));
  const original = [...timers.keys()][0];
  await render(
    section([row('B', 1)], {
      division: { division_id: 'second', name: '새내기부' },
    }),
  );
  assert.equal(timers.has(original), false);
  assert.equal(timers.size, 1);
  await act(async () => root.unmount());
  root = null;
  assert.equal(timers.size, 0);
  document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal(completed, 0);
});

test('overflow extends reading time and scrolls only the award list to its last name before completion', async () => {
  await render(section([row('A', 1), row('B', 1)]));
  const list = await overflowList();
  const duration = Number(
    document.querySelector('.presentation-awards-stage').dataset.awardsDuration,
  );
  assert.ok(duration > 7600 && duration <= 16000);
  assert.equal(timers.size, 1);
  frameAt(2900);
  assert.equal(list.scrollTop, 0);
  frameAt(7000);
  assert.ok(list.scrollTop > 0 && list.scrollTop < 400);
  frameAt(duration - 1400 + 1);
  assert.equal(list.scrollTop, 400);
  assert.equal(frames.size, 0);
  assert.equal(completed, 0);
  assert.equal(window.scrollY, 0);
  await completeTimer();
  assert.equal(completed, 1);
});

test('manual list scrolling cancels the automatic reading motion and unmount clears its frame', async () => {
  await render(section([row('A', 1), row('B', 1)]));
  const list = await overflowList();
  frameAt(6000);
  const position = list.scrollTop;
  list.dispatchEvent(new window.Event('wheel', { bubbles: true }));
  assert.equal(frames.size, 0);
  frameAt(10000);
  assert.equal(list.scrollTop, position);
  await act(async () => root.unmount());
  root = null;
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
});

test('reduced motion preserves manual overflow without automatic scrolling or an extended timer', async () => {
  await render(section([row('A', 1), row('B', 1)]), { reducedMotion: true });
  await overflowList();
  assert.equal(frames.size, 0);
  assert.equal(
    document.querySelector('.presentation-awards-stage').dataset.awardsDuration,
    '3500',
  );
  await completeTimer();
  assert.equal(completed, 1);
});

test('an extreme tied list keeps its entire content scrollable without exceeding a 16 second ceremony', async () => {
  await render(
    section(Array.from({ length: 16 }, (_, i) => row(`Team ${i}`, 1))),
  );
  const list = await overflowList();
  Object.defineProperty(list, 'scrollHeight', {
    configurable: true,
    value: 10000,
  });
  await act(async () => window.dispatchEvent(new window.Event('resize')));
  assert.equal(
    document.querySelector('.presentation-awards-stage').dataset.awardsDuration,
    '16000',
  );
  assert.equal(
    document.querySelectorAll('.presentation-awards-team').length,
    16,
  );
  frameAt(14600);
  assert.equal(list.scrollTop, 9900);
  await completeTimer();
  assert.equal(completed, 1);
});
