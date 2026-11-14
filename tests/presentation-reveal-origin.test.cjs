const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const filename = path.resolve(
  __dirname,
  '../src/components/presentation/usePresentationRevealOrigin.ts',
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
const useOrigin = loaded.exports.default;
const nativeBounds = window.HTMLElement.prototype.getBoundingClientRect;
let root, host, props, geometry, reads;
function reveal(key = 'event', kind = 'resolver', divisionId = 'division') {
  return { key, kind, divisionId };
}
function bounds(left, top, right, bottom) {
  return new window.DOMRect(left, top, right - left, bottom - top);
}
function Harness({ event, stage, boards }) {
  const ref = React.useRef(null);
  useOrigin(ref, event, stage);
  return h(
    'section',
    { ref, 'data-origin-root': true },
    boards.map(({ id, rows = [] }) =>
      h(
        'div',
        { key: id, 'data-presentation-division': id },
        h('header', {
          className: 'presentation-stage-board__header',
          'data-geometry': `header:${id}`,
        }),
        rows.map(({ id: rowId, active = true, cell = true }) =>
          h(
            'div',
            {
              key: rowId,
              'data-active-team': active || undefined,
              'data-geometry': `row:${rowId}`,
            },
            cell
              ? h('span', {
                  className: 'is-active-problem',
                  'data-geometry': `cell:${rowId}`,
                })
              : null,
          ),
        ),
      ),
    ),
  );
}
async function render(next = {}) {
  props = { ...props, ...next };
  await act(() => root.render(h(React.StrictMode, null, h(Harness, props))));
}
function source() {
  const style = host.firstChild.style;
  return Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].map((side) => [
      side,
      style.getPropertyValue(`--reveal-source-${side}`),
    ]),
  );
}
const empty = { top: '', right: '', bottom: '', left: '' };
beforeEach(() => {
  geometry = new Map([
    ['header:division', bounds(50, 70, 950, 130)],
    ['row:team', bounds(50, 200, 950, 250)],
    ['cell:team', bounds(760, 200, 880, 240)],
  ]);
  reads = [];
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    reads.push(this.dataset.geometry);
    return geometry.get(this.dataset.geometry) ?? bounds(0, 0, 0, 0);
  };
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 768,
  });
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  props = {
    event: reveal(),
    stage: 'focusing',
    boards: [{ id: 'division', rows: [{ id: 'team' }] }],
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  window.HTMLElement.prototype.getBoundingClientRect = nativeBounds;
});
after(() => dom.window.close());

test('resolver opens from the exact focused public problem cell using viewport-relative insets', async () => {
  await render();
  assert.deepEqual(source(), {
    top: '200px',
    right: '144px',
    bottom: '528px',
    left: '760px',
  });
  assert.deepEqual(reads, ['cell:team']);
});

test('partially offscreen sources are clipped to the viewport without negative insets', async () => {
  geometry.set('cell:team', bounds(-20, -10, 100, 50));
  await render();
  assert.deepEqual(source(), {
    top: '0px',
    right: '924px',
    bottom: '718px',
    left: '0px',
  });
});

test('a resolver without a problem cell uses its focused row rather than another team', async () => {
  await render({
    boards: [
      {
        id: 'division',
        rows: [
          { id: 'other', active: false },
          { id: 'team', cell: false },
        ],
      },
    ],
  });
  assert.deepEqual(source(), {
    top: '200px',
    right: '74px',
    bottom: '518px',
    left: '50px',
  });
  assert.deepEqual(reads, ['row:team']);
});

test('offscreen, zero-size and tiny problem cells fall back to the visible division header', async () => {
  for (const rect of [
    bounds(1200, 200, 1300, 250),
    bounds(100, 800, 300, 850),
    bounds(0, 0, 0, 0),
    bounds(10, 10, 17, 100),
  ]) {
    geometry.set('cell:team', rect);
    await render({ event: reveal(JSON.stringify(rect)) });
    assert.deepEqual(source(), {
      top: '70px',
      right: '74px',
      bottom: '638px',
      left: '50px',
    });
  }
});

test('a selected single rank originates at its row while a tied group and batch use their shared header', async () => {
  await render({ event: reveal('rank-one', 'rank') });
  assert.equal(source().top, '200px');
  await render({
    event: reveal('rank-tied', 'rank'),
    boards: [{ id: 'division', rows: [{ id: 'team' }, { id: 'tied' }] }],
  });
  assert.equal(source().top, '70px');
  await render({ event: reveal('all-results', 'all') });
  assert.equal(source().top, '70px');
});

test('result and return phases retain one measurement despite layout changes; the next reveal measures again', async () => {
  await render();
  const original = source();
  geometry.set('cell:team', bounds(100, 300, 200, 350));
  await render({ event: reveal(), stage: 'focusing' });
  await render({ stage: 'result' });
  await render({ stage: 'returning' });
  assert.deepEqual(source(), original);
  assert.deepEqual(reads, ['cell:team']);
  await render({ event: reveal('next-event'), stage: 'focusing' });
  assert.equal(source().top, '300px');
  assert.equal(source().left, '100px');
});

test('board reset and cancelled entry clear the old origin so repeated actions can measure a fresh source', async () => {
  await render();
  await render({ stage: 'board' });
  assert.deepEqual(source(), empty);
  geometry.set('cell:team', bounds(100, 300, 200, 350));
  await render({ stage: 'focusing' });
  assert.equal(source().top, '300px');
  await render({ event: null });
  assert.deepEqual(source(), empty);
});

test('a missing target and hidden header clear previous geometry and preserve CSS fallback positioning', async () => {
  await render();
  geometry.set('header:division', bounds(0, 0, 0, 0));
  await render({
    event: reveal('nothing-visible'),
    boards: [{ id: 'division', rows: [] }],
  });
  assert.deepEqual(source(), empty);
});

test('division lookup handles selector punctuation and does not measure another division', async () => {
  const id = 'A" division ] > #B';
  geometry.set(`header:${id}`, bounds(80, 100, 900, 180));
  await render({
    event: reveal('escaped-division', 'all', id),
    boards: [
      { id: 'division', rows: [{ id: 'team' }] },
      { id, rows: [] },
    ],
  });
  assert.equal(source().top, '100px');
  assert.deepEqual(reads, [`header:${id}`]);
});

test('a temporarily missing division cannot reuse the previous event source', async () => {
  await render();
  await render({ event: reveal('missing-division', 'rank', 'missing') });
  assert.deepEqual(source(), empty);
});
