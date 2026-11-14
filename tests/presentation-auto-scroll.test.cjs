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
global.KeyboardEvent = window.KeyboardEvent;
global.Element = window.Element;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const filename = path.resolve(
  __dirname,
  '../src/components/presentation/usePresentationAutoScroll.ts',
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
const useAutoScroll = loaded.exports.default;
let root, host, options, frames, clock, hidden;
const nativeNow = global.performance.now;
const nativeRaf = window.requestAnimationFrame;
const nativeCancel = window.cancelAnimationFrame;
function Harness(props) {
  const ref = React.useRef(null);
  useAutoScroll(ref, props);
  return h(
    'section',
    { ref },
    h(
      'div',
      { className: 'presentation-stage-board' },
      h('div', { className: 'presentation-stage-board__scroll', id: 'one' }),
      h(
        'div',
        { 'data-presentation-scroll-control': true },
        h('input', { id: 'pan', type: 'range' }),
      ),
    ),
    h('div', { className: 'presentation-stage-board__scroll', id: 'two' }),
    h('div', { className: 'settings' }),
  );
}
async function render(next = {}) {
  options = { ...options, ...next };
  await act(() => root.render(h(React.StrictMode, null, h(Harness, options))));
}
function measure(id, x = 200, y = 300) {
  const node = host.querySelector(`#${id}`);
  for (const [key, value] of Object.entries({
    clientWidth: 100,
    scrollWidth: 100 + x,
    clientHeight: 100,
    scrollHeight: 100 + y,
  }))
    Object.defineProperty(node, key, { configurable: true, value });
  return node;
}
function advance(ms) {
  const until = clock + ms;
  while (clock < until) {
    clock = Math.min(until, clock + 16);
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(clock));
  }
}
beforeEach(() => {
  clock = 0;
  hidden = false;
  frames = new Map();
  let frameId = 0;
  Object.defineProperty(global.performance, 'now', {
    configurable: true,
    value: () => clock,
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  window.requestAnimationFrame = (callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  options = {
    verticalEnabled: true,
    horizontalEnabled: true,
    paused: false,
    scopeKey: 'contest',
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  assert.equal(frames.size, 0, 'unmount cancels animation frames');
  host.remove();
  Object.defineProperty(global.performance, 'now', {
    configurable: true,
    value: nativeNow,
  });
  window.requestAnimationFrame = nativeRaf;
  window.cancelAnimationFrame = nativeCancel;
});
after(() => dom.window.close());

test('only overflowing axes move inside each division; the frame and settings stay fixed', async () => {
  await render();
  const one = measure('one', 200, 0);
  const two = measure('two', 0, 300);
  advance(1_700);
  assert.equal(one.scrollLeft, 0, 'read the initial view before moving');
  advance(1_200);
  assert.ok(one.scrollLeft > 20);
  assert.equal(one.scrollTop, 0);
  assert.equal(two.scrollLeft, 0);
  assert.ok(two.scrollTop > 20);
  assert.equal(host.firstChild.scrollTop, 0);
  assert.equal(host.querySelector('.settings').scrollTop, 0);
});

test('edges pause before reversing, without wrapping or skipping hidden content', async () => {
  await render({ verticalEnabled: false });
  const one = measure('one', 28, 0);
  advance(2_900);
  assert.equal(one.scrollLeft, 28);
  advance(1_500);
  assert.equal(one.scrollLeft, 28, 'hold at the far end');
  advance(650);
  assert.ok(one.scrollLeft < 28 && one.scrollLeft > 0);
  advance(1_000);
  assert.equal(one.scrollLeft, 0);
  advance(1_200);
  assert.equal(one.scrollLeft, 0, 'hold at the start too');
  advance(1_000);
  assert.ok(one.scrollLeft > 0);
});

test('manual scrolling yields only the touched division for five seconds', async () => {
  await render();
  const one = measure('one', 500, 500);
  const two = measure('two', 500, 500);
  advance(2_500);
  one.dispatchEvent(new window.Event('wheel', { bubbles: true }));
  one.scrollLeft = 90;
  one.scrollTop = 80;
  const otherTop = two.scrollTop;
  advance(4_900);
  assert.equal(one.scrollLeft, 90);
  assert.equal(one.scrollTop, 80);
  assert.ok(two.scrollTop > otherTop);
  advance(250);
  assert.ok(one.scrollLeft > 90 && one.scrollLeft < 100);
  assert.ok(one.scrollTop > 80 && one.scrollTop < 90);
});

test('keyboard and touch scrolling also yield without stealing their events', async () => {
  await render();
  const one = measure('one');
  advance(2_500);
  const key = new window.KeyboardEvent('keydown', {
    key: 'PageDown',
    bubbles: true,
    cancelable: true,
  });
  one.dispatchEvent(key);
  const position = one.scrollTop;
  advance(4_900);
  assert.equal(one.scrollTop, position);
  assert.equal(key.defaultPrevented, false);
  one.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  advance(4_900);
  assert.equal(one.scrollTop, position);
});

test('settings or reveal pause cancels scrolling and resumes from the focused table position', async () => {
  await render();
  const one = measure('one', 500, 500);
  advance(2_500);
  await render({ paused: true });
  assert.equal(frames.size, 0);
  one.scrollTop = 200;
  one.scrollLeft = 180;
  advance(8_000);
  assert.equal(one.scrollTop, 200);
  await render({ paused: false });
  advance(1_700);
  assert.equal(one.scrollTop, 200, 'hold after returning from the result');
  advance(500);
  assert.ok(one.scrollTop > 200 && one.scrollTop < 215);
  assert.ok(one.scrollLeft > 180 && one.scrollLeft < 195);
});

test('a long scrollbar drag keeps control until release, even outside the card', async () => {
  await render();
  const one = measure('one', 500, 500);
  advance(2_500);
  one.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  const top = one.scrollTop;
  advance(8_000);
  assert.equal(one.scrollTop, top);
  document.dispatchEvent(new window.Event('pointerup'));
  advance(4_900);
  assert.equal(one.scrollTop, top);
  advance(250);
  assert.ok(one.scrollTop > top);
});

test('hidden tabs stop and return gently without making up elapsed distance', async () => {
  await render();
  const one = measure('one', 1_000, 1_000);
  advance(2_500);
  hidden = true;
  document.dispatchEvent(new window.Event('visibilitychange'));
  const top = one.scrollTop;
  advance(30_000);
  assert.equal(one.scrollTop, top);
  hidden = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  advance(1_700);
  assert.equal(one.scrollTop, top);
  advance(500);
  assert.ok(one.scrollTop > top && one.scrollTop - top < 15);
});

test('disabled preferences leave manual positions and do not schedule animation', async () => {
  await render({ verticalEnabled: false, horizontalEnabled: false });
  const one = measure('one');
  one.scrollTop = 50;
  one.scrollLeft = 30;
  advance(10_000);
  assert.equal(frames.size, 0);
  assert.equal(one.scrollTop, 50);
  assert.equal(one.scrollLeft, 30);
});

test('without animation-frame support the tables remain usable by hand', async () => {
  window.requestAnimationFrame = undefined;
  await render();
  const one = measure('one');
  one.scrollLeft = 30;
  one.scrollTop = 50;
  assert.equal(frames.size, 0);
  assert.equal(one.scrollLeft, 30);
  assert.equal(one.scrollTop, 50);
});

test('changing the contest or division filter restarts reading time without jumping to the beginning', async () => {
  await render();
  const one = measure('one', 500, 500);
  advance(2_500);
  const top = one.scrollTop;
  await render({ scopeKey: 'other-division' });
  advance(1_700);
  assert.equal(one.scrollTop, top);
  advance(500);
  assert.ok(one.scrollTop > top && one.scrollTop - top < 15);
});

test('the visible horizontal range yields only its own table until five seconds after release', async () => {
  await render();
  const one = measure('one');
  const two = measure('two');
  advance(3000);
  const pan = host.querySelector('#pan');
  pan.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  const held = one.scrollLeft;
  advance(6000);
  assert.equal(
    one.scrollLeft,
    held,
    'The auto-scroller must not fight a held range',
  );
  assert.ok(two.scrollTop > one.scrollTop, 'Other divisions continue');
  document.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  advance(4900);
  assert.equal(one.scrollLeft, held);
  advance(300);
  assert.ok(one.scrollLeft > held);
});

test('Enter on a horizontal control gives the same five-second manual hold', async () => {
  await render();
  const one = measure('one', 500, 0);
  measure('two');
  advance(3000);
  host
    .querySelector('#pan')
    .dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  one.scrollLeft = 100;
  advance(4900);
  assert.equal(one.scrollLeft, 100);
  advance(300);
  assert.ok(one.scrollLeft > 100);
});
