const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
});
for (const name of ['window', 'document', 'Element', 'HTMLElement'])
  global[name] =
    name === 'window'
      ? dom.window
      : name === 'document'
        ? dom.window.document
        : dom.window[name];
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/components/common/InterfaceIcon')
      return {
        __esModule: true,
        default: () => React.createElement('svg', { 'aria-hidden': true }),
      };
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const candidate = id.startsWith('@/')
      ? id.slice(2)
      : path.relative(
          path.resolve(__dirname, '../src'),
          path.resolve(path.dirname(filename), id),
        );
    return source(
      ['.ts', '.tsx']
        .map((ext) => candidate + ext)
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
const HomeHero = source('pages/main/HomeHero.tsx').default;
let root;
beforeEach(async () => {
  document.body.innerHTML = '<main></main>';
  root = createRoot(document.querySelector('main'));
  await act(() =>
    root.render(
      React.createElement(MemoryRouter, null, React.createElement(HomeHero)),
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
});
after(() => dom.window.close());
async function click(element) {
  assert.ok(element);
  await act(() =>
    element.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }),
    ),
  );
}
function byLabel(label) {
  return document.querySelector(`[aria-label="${label}"]`);
}
async function taps(label, count) {
  for (let i = 0; i < count; i++) await click(byLabel(label));
}
async function keys(target = document.body, options = {}) {
  for (const key of [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ]) {
    const event = new dom.window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    await act(() => target.dispatchEvent(event));
    assert.equal(
      event.defaultPrevented,
      false,
      'normal keyboard navigation remains available',
    );
  }
}

test('ordinary home interaction stays unchanged and seven taps open a closable local game', async () => {
  assert.equal(document.querySelector('dialog'), null);
  assert.match(document.body.textContent, /코딩 대회를 열고/);
  await taps('ZOJ 마침표', 6);
  assert.equal(document.querySelector('dialog'), null);
  byLabel('ZOJ 마침표').focus();
  await taps('ZOJ 마침표', 1);
  assert.equal(
    document.querySelector('#home-secret-title').textContent,
    '숫자 찾기',
  );
  await act(() =>
    document
      .querySelector('dialog')
      .dispatchEvent(new dom.window.Event('cancel', { cancelable: true })),
  );
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, byLabel('ZOJ 마침표'));
  assert.equal(document.body.style.overflow, '');
});

test('tap sequences expire instead of accumulating across ordinary visits', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  await taps('ZOJ 마침표', 6);
  now += 4001;
  await taps('ZOJ 마침표', 1);
  assert.equal(document.querySelector('dialog'), null);
  await taps('ZOJ 마침표', 6);
  assert.equal(
    document.querySelector('#home-secret-title').textContent,
    '숫자 찾기',
  );
});

test('secret keys ignore text entry, modifier shortcuts and other open dialogs', async () => {
  const input = document.createElement('input');
  document.body.append(input);
  await keys(input);
  assert.equal(document.querySelector('dialog'), null);
  await keys(document.body, { ctrlKey: true });
  assert.equal(document.querySelector('dialog'), null);
  const other = document.createElement('section');
  other.setAttribute('aria-modal', 'true');
  document.body.append(other);
  await keys();
  assert.equal(document.querySelector('dialog'), null);
  other.remove();
  await keys();
  assert.equal(
    document.querySelector('#home-secret-title').textContent,
    '불 끄기',
  );
});

test('keyboard listener is removed on leaving the home page', async () => {
  await act(() => root.render(React.createElement('p', null, '다른 페이지')));
  await keys();
  assert.equal(document.querySelector('dialog'), null);
});

test('binary search game tracks bounds and accepts the correct answer', async (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  await taps('ZOJ 마침표', 7);
  const input = document.querySelector('#home-secret-number');
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  ).set;
  async function guess(value) {
    await act(() => {
      setter.call(input, String(value));
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(() =>
      input.form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
  }
  await guess(511);
  assert.match(document.body.textContent, /511보다 큽니다/);
  assert.match(document.body.textContent, /512–1023/);
  await guess(512);
  assert.match(document.body.textContent, /AC · 2번 만에 찾았습니다/);
  assert.equal(input.disabled, true);
});

test('lights puzzle works with touch targets and reaches a solved board', async () => {
  await taps('별', 9);
  const cells = [...document.querySelectorAll('.home-secret-lights button')];
  assert.equal(cells.length, 9);
  for (const index of [0, 2, 4, 7]) await click(cells[index]);
  assert.match(document.body.textContent, /AC · 4번 만에 완료/);
  assert.ok(
    cells.every(
      (cell) => cell.getAttribute('aria-pressed') === 'false' && cell.disabled,
    ),
  );
});

test('reaction game rejects early clicks, measures time and clears pending timers on close', async (t) => {
  const timers = new Map();
  let id = 0;
  let now = 1000;
  t.mock.method(window, 'setTimeout', (fn) => {
    timers.set(++id, fn);
    return id;
  });
  t.mock.method(window, 'clearTimeout', (key) => timers.delete(key));
  t.mock.method(performance, 'now', () => now);
  await taps('예제 코드', 5);
  const button = document.querySelector('.home-secret-reaction');
  await click(button);
  assert.equal(timers.size, 1);
  await click(button);
  assert.match(button.textContent, /WA/);
  assert.equal(timers.size, 0);
  await click(button);
  await act(() => [...timers.values()][0]());
  assert.match(button.textContent, /지금/);
  now += 237;
  await click(button);
  assert.match(button.textContent, /AC · 237 ms/);
  await click(button);
  assert.equal(timers.size, 1);
  await click(byLabel('미니게임 닫기'));
  assert.equal(timers.size, 0);
});
