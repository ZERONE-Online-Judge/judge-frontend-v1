const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
  pretendToBeVisual: true,
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
const { useNavigate } = require('react-router-dom');
const HomeHero = source('pages/main/HomeHero.tsx').default;
const PublicEasterEggs = source(
  'components/public/easterEggs/PublicEasterEggs.tsx',
).default;
const CafeReceipts = source(
  'components/public/easterEggs/CafeReceipts.tsx',
).default;
const { createCafeQuestion, countDrink, CAFE_MENU } = source(
  'components/public/easterEggs/receiptData.ts',
);
const { TYPING_SOURCE, typingSpeed } = source(
  'components/public/easterEggs/typing.ts',
);
let root, navigate, pointerFine, mediaListeners;
function Navigation() {
  navigate = useNavigate();
  return null;
}
function tree() {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      PublicEasterEggs,
      null,
      React.createElement(Navigation),
      React.createElement(HomeHero),
      React.createElement(CafeReceipts),
    ),
  );
}
beforeEach(async () => {
  document.body.innerHTML = '<main></main>';
  pointerFine = true;
  mediaListeners = new Set();
  window.matchMedia = () => ({
    matches: pointerFine,
    addEventListener: (_, fn) => mediaListeners.add(fn),
    removeEventListener: (_, fn) => mediaListeners.delete(fn),
  });
  root = createRoot(document.querySelector('main'));
  await act(() => root.render(tree()));
});
afterEach(async () => {
  await act(() => root.unmount());
});
after(() => dom.window.close());
function label(text) {
  return document.querySelector(`[aria-label="${text}"]`);
}
async function click(element) {
  assert.ok(element);
  await act(() =>
    element.dispatchEvent(
      new window.MouseEvent('click', {
        bubbles: true,
        clientX: 120,
        clientY: 240,
      }),
    ),
  );
}
async function taps(n) {
  for (let i = 0; i < n; i++) await click(label('별'));
}
async function enter(input, value) {
  const proto =
    input.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  await act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(
      input,
      String(value),
    );
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function submit(input) {
  await act(() =>
    input.form.dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
}
function receiptAnswer() {
  const menu = document.querySelector('.cafe-answer label strong').textContent;
  return [...document.querySelectorAll('.cafe-receipt li')].reduce(
    (sum, row) =>
      sum +
      (row.firstElementChild.textContent === menu
        ? Number.parseInt(row.lastElementChild.textContent)
        : 0),
    0,
  );
}

test('one code click expands typing, while old games and hidden keyboard shortcuts are gone', async () => {
  assert.match(document.body.textContent, /당신의 다음 프로그래밍 플랫폼/);
  assert.equal(document.querySelector('.home-monogram button'), null);
  assert.equal(document.querySelector('.home-star.is-first').tagName, 'SPAN');
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
    await act(() =>
      document.body.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true }),
      ),
    );
  }
  assert.equal(document.querySelector('dialog'), null);
  label('예제 코드').focus();
  await click(label('예제 코드'));
  assert.ok(document.querySelector('dialog').open);
  assert.equal(document.activeElement, label('코드 따라 입력'));
  assert.equal(label('타수').textContent, '0타/분');
  assert.doesNotMatch(
    document.querySelector('dialog').textContent,
    /AC|WA|미니게임|소리 없이|브라우저에서만/,
  );
  await click(label('타이핑 닫기'));
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.activeElement, label('예제 코드'));
});

test('typing counts correct characters, blocks paste, freezes on completion and resets cleanly', async (t) => {
  let now = 1000;
  const timers = new Map();
  let serial = 0;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(window, 'setInterval', (fn) => {
    timers.set(++serial, fn);
    return serial;
  });
  t.mock.method(window, 'clearInterval', (id) => timers.delete(id));
  await click(label('예제 코드'));
  const input = label('코드 따라 입력');
  const paste = new window.Event('paste', { bubbles: true, cancelable: true });
  await act(() => input.dispatchEvent(paste));
  assert.equal(paste.defaultPrevented, true);
  assert.equal(input.value, '');
  await enter(input, '#inclxde');
  assert.equal(timers.size, 1);
  now += 60000;
  await act(() => [...timers.values()][0]());
  assert.equal(label('타수').textContent, '7타/분');
  await enter(input, TYPING_SOURCE);
  assert.equal(timers.size, 0);
  assert.equal(input.readOnly, true);
  assert.match(document.querySelector('dialog').textContent, /완료/);
  assert.equal(label('타수').textContent, `${TYPING_SOURCE.length}타/분`);
  await click(label('다시 시작'));
  assert.equal(input.value, '');
  assert.equal(input.readOnly, false);
  assert.equal(label('타수').textContent, '0타/분');
  await enter(input, '#');
  await click(label('타이핑 닫기'));
  assert.equal(timers.size, 0);
});

test('typing speed cannot count wrong or out-of-range characters', () => {
  assert.equal(typingSpeed('abc', 'axc', 60000), 2);
  assert.equal(typingSpeed('abc', 'abcd', 60000), 3);
  assert.equal(typingSpeed('abc', 'abc', 0), 0);
  assert.equal(typingSpeed('abc', 'abc', 1), 180);
  assert.ok(TYPING_SOURCE.includes("'\\n'"));
});

test('three star clicks enable a mouse-following spotlight across public routes until refresh', async (t) => {
  const frames = new Map();
  let serial = 0;
  t.mock.method(window, 'requestAnimationFrame', (fn) => {
    frames.set(++serial, fn);
    return serial;
  });
  t.mock.method(window, 'cancelAnimationFrame', (id) => frames.delete(id));
  await taps(2);
  assert.equal(document.querySelector('.egg-spotlight'), null);
  await taps(1);
  const veil = document.querySelector('.egg-spotlight');
  assert.equal(veil.style.getPropertyValue('--spot-x'), '120px');
  const move = new window.MouseEvent('pointermove', {
    clientX: 500,
    clientY: 300,
  });
  await act(() => window.dispatchEvent(move));
  assert.equal(frames.size, 1);
  await act(() => {
    const run = [...frames.values()][0];
    frames.clear();
    run();
  });
  assert.equal(veil.style.getPropertyValue('--spot-x'), '500px');
  assert.equal(veil.style.getPropertyValue('--spot-y'), '300px');
  await act(() => navigate('/notices'));
  assert.equal(document.querySelector('.egg-spotlight'), veil);
  await act(() => navigate('/about'));
  assert.equal(document.querySelector('.egg-spotlight'), veil);
  await act(() => navigate('/operator/contests/1'));
  assert.equal(document.querySelector('.egg-spotlight'), null);
  await act(() => navigate('/about'));
  assert.ok(document.querySelector('.egg-spotlight'));
  await act(() => root.render(null));
  assert.equal(frames.size, 0);
  assert.equal(mediaListeners.size, 0);
  await act(() => root.render(tree()));
  assert.equal(document.querySelector('.egg-spotlight'), null);
});

test('mobile cannot enable the spotlight; changing to a coarse pointer hides it', async () => {
  await act(() => {
    pointerFine = false;
    for (const listener of mediaListeners) listener();
  });
  await taps(3);
  assert.equal(document.querySelector('.egg-spotlight'), null);
  await act(() => {
    pointerFine = true;
    for (const listener of mediaListeners) listener();
  });
  await taps(2);
  assert.equal(document.querySelector('.egg-spotlight'), null);
  await taps(1);
  assert.ok(document.querySelector('.egg-spotlight'));
  await act(() => {
    pointerFine = false;
    for (const listener of mediaListeners) listener();
  });
  assert.equal(document.querySelector('.egg-spotlight'), null);
});

test('random receipts contain three varied orders and a countable target', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    let state = seed;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const question = createCafeQuestion(random);
    layouts.add(JSON.stringify(question));
    assert.equal(question.receipts.length, 3);
    for (const items of question.receipts) {
      assert.ok(items.length >= 3 && items.length <= 5);
      assert.equal(new Set(items.map((item) => item.menu)).size, items.length);
      assert.ok(
        items.every(
          (item) =>
            CAFE_MENU.includes(item.menu) &&
            item.quantity >= 1 &&
            item.quantity <= 3,
        ),
      );
    }
    const expected = question.receipts
      .flat()
      .filter((item) => item.menu === question.target)
      .reduce((sum, item) => sum + item.quantity, 0);
    assert.ok(expected > 0);
    assert.equal(countDrink(question), expected);
  }
  assert.equal(layouts.size, 100);
  assert.ok(CAFE_MENU.includes('라떼'));
  assert.ok(!CAFE_MENU.includes('라테'));
});

test('receipt answers stay inline, preserve the question, cry on mistakes and celebrate once on success', async (t) => {
  const timers = new Map();
  let id = 0;
  t.mock.method(window, 'setTimeout', (fn) => {
    timers.set(++id, fn);
    return id;
  });
  t.mock.method(window, 'clearTimeout', (key) => timers.delete(key));
  const input = document.querySelector('.cafe-answer input');
  const receipts = document.querySelector('.cafe-receipts').textContent;
  assert.equal(document.querySelectorAll('.cafe-receipt').length, 3);
  await enter(input, receiptAnswer() + 1);
  await submit(input);
  assert.ok(label('다시 세어보세요'));
  assert.equal(document.querySelector('.egg-confetti'), null);
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.querySelector('.cafe-receipts').textContent, receipts);
  await enter(input, receiptAnswer());
  assert.equal(label('다시 세어보세요'), null);
  await submit(input);
  assert.equal(document.querySelectorAll('.egg-confetti i').length, 76);
  assert.match(
    document.querySelector('.cafe-answer-feedback').textContent,
    /맞았어요/,
  );
  assert.equal(input.readOnly, true);
  assert.equal(input.form.querySelector('button').disabled, true);
  assert.equal(timers.size, 1);
  const effect = document.querySelector('.egg-confetti');
  await submit(input);
  assert.equal(document.querySelector('.egg-confetti'), effect);
  await act(() => [...timers.values()][0]());
  assert.equal(document.querySelector('.egg-confetti'), null);
  assert.equal(timers.size, 0);
});

test('code indentation preserves focus navigation and cancels pending cursor work on close', async (t) => {
  const frames = new Map();
  let id = 0;
  t.mock.method(window, 'requestAnimationFrame', (fn) => {
    frames.set(++id, fn);
    return id;
  });
  t.mock.method(window, 'cancelAnimationFrame', (key) => frames.delete(key));
  await click(label('예제 코드'));
  const input = label('코드 따라 입력');
  const tab = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, true);
  assert.equal(input.value, '    ');
  assert.equal(frames.size, 1);
  const back = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(back));
  assert.equal(back.defaultPrevented, false);
  await click(label('다시 시작'));
  assert.equal(frames.size, 0);
  await enter(input, TYPING_SOURCE);
  const doneTab = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(doneTab));
  assert.equal(doneTab.defaultPrevented, false);
  assert.equal(input.value, TYPING_SOURCE);
  await click(label('다시 시작'));
  await act(() =>
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(frames.size, 1);
  await act(() =>
    document
      .querySelector('dialog')
      .dispatchEvent(new window.Event('cancel', { cancelable: true })),
  );
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(frames.size, 0);
});

test('private management pages cannot activate public effects', async () => {
  await act(() => navigate('/admin'));
  await click(label('예제 코드'));
  await taps(3);
  const input = document.querySelector('.cafe-answer input');
  await enter(input, receiptAnswer());
  await submit(input);
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.querySelector('.egg-spotlight'), null);
  assert.equal(document.querySelector('.egg-confetti'), null);
});
