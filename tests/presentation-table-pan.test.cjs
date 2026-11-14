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
  '../src/components/presentation/PresentationTableScrollControl.tsx',
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const nativeRequire = loaded.require.bind(loaded);
loaded.require = (id) => (id.endsWith('.css') ? {} : nativeRequire(id));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  filename,
);
const Control = loaded.exports.default;
let root, host, scroll, ref, observers, frames, width, contentWidth;
function measure() {
  for (const [key, get] of Object.entries({
    clientWidth: () => width,
    scrollWidth: () => contentWidth,
  })) {
    Object.defineProperty(scroll, key, { configurable: true, get });
  }
}
async function render(scale = 1) {
  await act(() =>
    root.render(
      h(
        React.StrictMode,
        null,
        h(Control, { scrollRef: ref, label: '대학생부', fontScale: scale }),
      ),
    ),
  );
}
async function flush() {
  await act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(1));
  });
}
beforeEach(() => {
  width = 400;
  contentWidth = 1200;
  frames = new Map();
  observers = [];
  let index = 0;
  window.requestAnimationFrame = (callback) => {
    frames.set(++index, callback);
    return index;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.nodes = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(node) {
      this.nodes.push(node);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  host = document.createElement('main');
  scroll = document.createElement('div');
  scroll.innerHTML = '<table><tbody><tr><td>점수표</td></tr></tbody></table>';
  document.body.append(host, scroll);
  measure();
  ref = { current: scroll };
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  assert.ok(observers.every((value) => value.disconnected));
  assert.equal(frames.size, 0);
  host.remove();
  scroll.remove();
  delete global.ResizeObserver;
});
after(() => dom.window.close());

test('overflow exposes a keyboard reachable horizontal control and mouse buttons', async () => {
  await render();
  const range = host.querySelector('input');
  assert.equal(range.getAttribute('aria-label'), '대학생부 점수표 가로 이동');
  assert.equal(range.max, '800');
  const [left, right] = host.querySelectorAll('button');
  assert.equal(left.disabled, true);
  await act(() => right.click());
  assert.equal(scroll.scrollLeft, 280);
  await act(() => right.click());
  await act(() => right.click());
  assert.equal(scroll.scrollLeft, 800);
  assert.equal(right.disabled, true);
  assert.equal(
    range.getAttribute('aria-valuetext'),
    '100% · 좌우로 이동하여 모든 문제 확인',
  );
  await act(() => left.click());
  assert.equal(scroll.scrollLeft, 520);
  assert.equal(
    host.scrollLeft,
    0,
    'Never pan the document or surrounding card',
  );
});
test('a fitting table hides controls and resize exposes the new range without remount', async () => {
  contentWidth = 400;
  await render();
  assert.equal(host.children.length, 0);
  const active = observers.find((value) => !value.disconnected);
  assert.equal(
    active.nodes.length,
    2,
    'Observe both viewport and table reflow',
  );
  contentWidth = 1600;
  active.callback();
  await flush();
  assert.equal(host.querySelector('input').max, '1200');
  contentWidth = 350;
  active.callback();
  await flush();
  assert.equal(host.children.length, 0);
});
test('font enlargement recalculates bounds and brings the table start back into reach', async () => {
  await render();
  scroll.scrollLeft = 700;
  contentWidth = 2400;
  await render(3);
  assert.equal(scroll.scrollLeft, 0);
  assert.equal(host.querySelector('input').max, '2000');
  assert.equal(host.querySelector('input').value, '0');
});
test('native or automatic scrolling keeps the custom position synchronized', async () => {
  await render();
  scroll.scrollLeft = 600;
  scroll.dispatchEvent(new window.Event('scroll'));
  await flush();
  assert.equal(host.querySelector('input').value, '600');
  assert.match(
    host.querySelector('input').getAttribute('aria-valuetext'),
    /^75%/,
  );
});
test('window resize remains a fallback when ResizeObserver is unavailable', async () => {
  delete global.ResizeObserver;
  await render();
  width = 1000;
  window.dispatchEvent(new window.Event('resize'));
  await flush();
  assert.equal(host.querySelector('input').max, '200');
});
