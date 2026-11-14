const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://zoj.kr/presentation' });
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');

function loadPrompt() {
  const filename = path.resolve(
    __dirname,
    '../src/components/presentation/PresentationSoundPrompt.tsx',
  );
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (id) => (id.endsWith('.css') ? {} : require(id));
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return mod.exports.default;
}

const storageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'sessionStorage',
);
const key = (contestId) => `zoj.presentation.sound-prompt.v1.${contestId}`;
let host, root, Prompt, props, enables, later, changes;
async function render(overrides = {}) {
  props = { ...props, ...overrides };
  await act(() => root.render(h(Prompt, props)));
}
function button(label) {
  return [...host.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  );
}
async function click(label) {
  const item = button(label);
  assert.ok(item, label);
  await act(async () => {
    item.click();
    await Promise.resolve();
  });
}
async function remount({ reload = false } = {}) {
  await act(() => root.unmount());
  if (reload) Prompt = loadPrompt();
  root = createRoot(host);
  await render();
}
beforeEach(() => {
  Object.defineProperty(window, 'sessionStorage', storageDescriptor);
  window.sessionStorage.clear();
  document.body.innerHTML = '<main></main><button id="outside">외부</button>';
  host = document.querySelector('main');
  root = createRoot(host);
  Prompt = loadPrompt();
  enables = 0;
  later = 0;
  changes = [];
  props = {
    contestId: 'contest',
    supported: true,
    onEnable: async () => {
      enables++;
      return true;
    },
    onLater: () => later++,
    onOpenChange: (open) => changes.push(open),
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  Object.defineProperty(window, 'sessionStorage', storageDescriptor);
});
after(() => dom.window.close());

test('the invitation is non-modal, never steals focus and waits for a user action', async () => {
  const outside = document.getElementById('outside');
  outside.focus();
  await render();
  const card = host.querySelector('[role="dialog"]');
  assert.equal(card.getAttribute('aria-modal'), 'false');
  assert.equal(card.getAttribute('aria-label'), '프레젠테이션 효과음');
  assert.ok(document.getElementById(card.getAttribute('aria-describedby')));
  assert.equal(document.activeElement, outside);
  assert.equal(enables, 0);
  assert.equal(later, 0);
  assert.equal(window.sessionStorage.getItem(key('contest')), null);
  assert.deepEqual(changes, [true]);
  for (const label of ['효과음 켜기', '나중에']) {
    assert.equal(button(label).type, 'button');
    assert.equal(button(label).tabIndex, 0);
  }
});

test('successful activation dismisses once and a same-tab reload remembers the choice', async () => {
  await render();
  await click('효과음 켜기');
  assert.equal(enables, 1);
  assert.equal(later, 0);
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(window.sessionStorage.getItem(key('contest')), 'done');
  assert.deepEqual(changes, [true, false]);
  await remount({ reload: true });
  assert.equal(host.querySelector('[role="dialog"]'), null);
  await render({ contestId: 'another' });
  assert.ok(host.querySelector('[role="dialog"]'));
});

test('later prevents document gesture-unlock, calls its callback and records completion', async () => {
  let gestures = 0;
  const unlock = () => gestures++;
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  try {
    await render();
    const laterButton = button('나중에');
    await act(() => {
      laterButton.dispatchEvent(
        new window.Event('pointerdown', { bubbles: true }),
      );
      laterButton.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    assert.equal(gestures, 0);
    await click('나중에');
    assert.equal(enables, 0);
    assert.equal(later, 1);
    assert.equal(window.sessionStorage.getItem(key('contest')), 'done');
    await remount({ reload: true });
    assert.equal(host.querySelector('[role="dialog"]'), null);
  } finally {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  }
});

test('a false result or exception keeps a concise error and permits a successful retry', async () => {
  const outcomes = [false, new Error('blocked'), true];
  await render({
    onEnable: async () => {
      enables++;
      const result = outcomes.shift();
      if (result instanceof Error) throw result;
      return result;
    },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await click('효과음 켜기');
    assert.match(host.querySelector('[role="alert"]').textContent, /다시 시도/);
    assert.equal(window.sessionStorage.getItem(key('contest')), null);
    assert.equal(button('효과음 켜기').disabled, false);
  }
  await click('효과음 켜기');
  assert.equal(enables, 3);
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(window.sessionStorage.getItem(key('contest')), 'done');
});

test('pending activation cannot be submitted twice or dismissed before it finishes', async () => {
  let resolve;
  await render({
    onEnable: () => {
      enables++;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const enable = button('효과음 켜기');
  await act(() => {
    enable.click();
    enable.click();
  });
  assert.equal(enables, 1);
  assert.equal(button('켜는 중…').getAttribute('aria-busy'), 'true');
  assert.equal(button('나중에').disabled, true);
  await act(() =>
    host
      .querySelector('[role="dialog"]')
      .dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
  );
  assert.equal(later, 0);
  await act(async () => resolve(false));
  assert.ok(button('효과음 켜기'));
  assert.ok(host.querySelector('[role="alert"]'));
});

test('unsupported audio hides the prompt and changes of support close any open invitation', async () => {
  await render({ supported: false });
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(enables, 0);
  await render({ supported: true });
  assert.deepEqual(changes, [true]);
  await render({ supported: false });
  assert.deepEqual(changes, [true, false]);
  assert.equal(window.sessionStorage.getItem(key('contest')), null);
});

test('Escape inside the card chooses later without an autofocus or a keyboard trap', async () => {
  await render();
  const enable = button('효과음 켜기');
  await act(() => enable.focus());
  assert.equal(document.activeElement, enable);
  const tab = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  });
  await act(() => enable.dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, false);
  const escape = new window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  await act(() => enable.dispatchEvent(escape));
  assert.equal(escape.defaultPrevented, true);
  assert.equal(later, 1);
  assert.equal(enables, 0);
  assert.equal(host.querySelector('[role="dialog"]'), null);
});

test('blocked storage retains a completed choice in memory without preventing other contests', async () => {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked');
    },
  });
  await render();
  await click('나중에');
  await remount();
  assert.equal(host.querySelector('[role="dialog"]'), null);
  await render({ contestId: 'another' });
  assert.ok(host.querySelector('[role="dialog"]'));
});

test('an old activation cannot dismiss a new contest or persist after its component unmounts', async () => {
  let resolve;
  await render({
    onEnable: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  await click('효과음 켜기');
  await render({ contestId: 'another', onEnable: async () => true });
  assert.ok(button('효과음 켜기'));
  await act(async () => resolve(true));
  assert.ok(host.querySelector('[role="dialog"]'));
  assert.equal(window.sessionStorage.getItem(key('contest')), null);
  assert.equal(window.sessionStorage.getItem(key('another')), null);
  await act(() => root.unmount());
  assert.equal(changes.at(-1), false);
  root = createRoot(host);
});
