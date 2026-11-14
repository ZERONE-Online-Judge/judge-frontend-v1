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
const React = require('react');
const { act, createElement: h, useLayoutEffect, useRef } = React;
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
    if (id.startsWith('@/')) return source(`${id.slice(2)}.ts`);
    return native(id);
  };
  modules.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const useRankScroll = source(
  'components/presentation/usePresentationRankScroll.ts',
).default;
let root;
let clock;
let frames;
let sequence;
let moves;
let refs;

function resetEnvironment() {
  clock = 0;
  frames = new Map();
  sequence = 0;
  moves = [];
  refs = {};
  window.matchMedia = () => ({ matches: false });
  window.performance.now = () => clock;
  window.requestAnimationFrame = (callback) => {
    frames.set(++sequence, callback);
    return sequence;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.scrollTo = () => {
    throw new Error('Rank movement must not scroll the presentation frame');
  };
}

const oldRows = [
  { team_id: 'neighbor', rank: 1 },
  { team_id: 'announced', rank: 6 },
];
const newRows = [
  { team_id: 'announced', rank: 1 },
  { team_id: 'neighbor', rank: 2 },
];

function Card({ id, rows, teamIds, rankMoving, scopeKey = id, top = 100 }) {
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const table = scroll.querySelector('table');
    refs[id] = scroll;
    if (!scroll.scrollTo) {
      scroll.scrollTop = 700;
      scroll.scrollLeft = 40;
      scroll.scrollTo = (options) => {
        moves.push({ id, ...options });
        if (options.top !== undefined) scroll.scrollTop = options.top;
        if (options.left !== undefined) scroll.scrollLeft = options.left;
        scroll.dispatchEvent(new window.Event('scroll'));
      };
    }
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 2000 },
    });
    Object.defineProperties(table, {
      offsetTop: { configurable: true, value: 0 },
      offsetParent: { configurable: true, value: scroll },
    });
    scroll.querySelector('thead').getBoundingClientRect = () => ({
      height: 40,
    });
    for (const row of bodyRef.current.children) {
      Object.defineProperties(row, {
        offsetTop: { configurable: true, value: rankMoving ? top : 900 },
        offsetHeight: { configurable: true, value: 60 },
        offsetParent: { configurable: true, value: table },
      });
      // FLIP still displays the old position. Use layout, not this transform.
      row.getBoundingClientRect = () => ({ top: 900, bottom: 960 });
      row.scrollIntoView = window.scrollTo;
    }
  });
  useRankScroll({ bodyRef, scrollRef, rows, teamIds, rankMoving, scopeKey });
  return h(
    'div',
    { ref: scrollRef },
    h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', null, 'Rank'))),
      h(
        'tbody',
        { ref: bodyRef },
        ...rows.map((row) =>
          h(
            'tr',
            { key: row.team_id, 'data-scoreboard-row': row.team_id },
            h('td', null, row.rank),
          ),
        ),
      ),
    ),
  );
}

async function render({
  rows = oldRows,
  teamIds = new Set(['announced']),
  rankMoving = false,
  scopeKey = 'first',
  top = 100,
} = {}) {
  if (!root) {
    resetEnvironment();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root.render(
      h(
        React.Fragment,
        null,
        h(Card, { id: 'first', rows, teamIds, rankMoving, scopeKey, top }),
        h(Card, {
          id: 'other',
          rows: oldRows,
          teamIds: new Set(),
          rankMoving,
        }),
      ),
    ),
  );
}

function frameAt(time) {
  clock = time;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}

async function beginMove(options = {}) {
  await render();
  await render({ rankMoving: true }); // Highlight old rows first.
  assert.equal(frames.size, 0);
  assert.equal(refs.first.scrollTop, 700);
  await render({ ...options, rows: newRows, rankMoving: true });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.body.innerHTML = '';
});
after(() => dom.window.close());

test('only the announced division follows its actual rank change with the 600ms FLIP', async () => {
  await beginMove();
  assert.equal(frames.size, 1);
  frameAt(0);
  frameAt(300);
  assert.ok(refs.first.scrollTop > 0 && refs.first.scrollTop < 350);
  assert.equal(refs.other.scrollTop, 700);
  assert.equal(refs.first.scrollLeft, 40);
  frameAt(600);
  assert.equal(refs.first.scrollTop, 0);
  assert.equal(frames.size, 0);
  assert.ok(moves.length >= 3);
  assert.ok(
    moves.every((move) => move.id === 'first' && move.left === undefined),
  );
});

test('equivalent target sets on presentation clock renders do not cancel movement', async () => {
  await beginMove();
  frameAt(250);
  const intermediate = refs.first.scrollTop;
  await render({
    rows: newRows,
    rankMoving: true,
    teamIds: new Set(['announced']),
  });
  assert.equal(frames.size, 1);
  frameAt(500);
  assert.ok(refs.first.scrollTop < intermediate);
  frameAt(600);
  assert.equal(refs.first.scrollTop, 0);
});

test('unchanged ranks, unrelated teams and already visible destinations do not scroll', async () => {
  await render();
  await render({ rows: [...oldRows].reverse(), rankMoving: true });
  assert.equal(frames.size, 0);
  await render({
    rows: newRows,
    rankMoving: true,
    teamIds: new Set(['absent']),
  });
  assert.equal(frames.size, 0);
  assert.equal(moves.length, 0);
});

test('a destination already inside the sticky-header viewport is left alone', async () => {
  await beginMove({ top: 850 });
  assert.equal(frames.size, 0);
  assert.equal(moves.length, 0);
});

for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
  test(`manual ${event} cancels the card correction`, async () => {
    await beginMove();
    frameAt(100);
    const position = refs.first.scrollTop;
    refs.first.dispatchEvent(
      event === 'keydown'
        ? new window.KeyboardEvent('keydown', { key: 'PageDown' })
        : new window.Event(event),
    );
    assert.equal(frames.size, 0);
    frameAt(600);
    assert.equal(refs.first.scrollTop, position);
  });
}

test('native scrollbar changes cancel while our own scroll events do not', async () => {
  await beginMove();
  frameAt(100);
  assert.equal(frames.size, 1);
  refs.first.scrollTop += 30;
  refs.first.dispatchEvent(new window.Event('scroll'));
  assert.equal(frames.size, 0);
});

test('reduced motion adjusts only the card instantly', async () => {
  await render();
  window.matchMedia = () => ({ matches: true });
  await render({ rows: newRows, rankMoving: true });
  assert.equal(frames.size, 0);
  assert.equal(refs.first.scrollTop, 0);
  assert.equal(refs.other.scrollTop, 700);
  assert.deepEqual(moves, [{ id: 'first', top: 0, behavior: 'instant' }]);
});

test('a division scope change cancels work and never replays another scope rank delta', async () => {
  await beginMove();
  frameAt(100);
  const position = refs.first.scrollTop;
  await render({ rows: oldRows, rankMoving: true, scopeKey: 'another' });
  assert.equal(frames.size, 0);
  frameAt(600);
  assert.equal(refs.first.scrollTop, position);
});

test('unmount removes pending animation work', async () => {
  await beginMove();
  frameAt(100);
  const count = moves.length;
  await act(async () => root.unmount());
  root = null;
  assert.equal(frames.size, 0);
  frameAt(600);
  assert.equal(moves.length, count);
});
