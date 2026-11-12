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
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.startsWith('@/')) {
      const target = ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
      assert.ok(target, `Cannot resolve ${id}`);
      return source(target);
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const preferences = source(
  'domains/submissionScoreboard/presentationDisplayPreferences.ts',
);
const Settings = source(
  'components/operator/PresentationDisplaySettings.tsx',
).default;
let host, root, state, callbacks;
const storageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'localStorage',
);
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'sessionStorage',
);
const divisions = [
  { division_id: 'general', name: '일반부' },
  { division_id: 'freshman', name: '새내기부' },
  { division_id: 'open', name: '오픈부' },
];
function button(label) {
  return [...host.querySelectorAll('button')].find(
    (item) =>
      item.getAttribute('aria-label') === label ||
      item.textContent.trim() === label,
  );
}
async function click(item) {
  assert.ok(item);
  await act(async () => {
    item.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function mount(overrides = {}) {
  function Harness() {
    state = preferences.usePresentationDisplayPreferences();
    const [selected, setSelected] = React.useState([]);
    const [soundEnabled, setSoundEnabled] = React.useState(false);
    return h(Settings, {
      ...state,
      onThemeChange: state.setTheme,
      onFontScaleChange: state.setFontScale,
      availableDivisions: divisions,
      selectedDivisionIds: selected,
      onDivisionIdsChange: (ids) => {
        callbacks.push(ids);
        setSelected(ids);
      },
      soundEnabled,
      onSoundEnabledChange: setSoundEnabled,
      onTestSound: () => callbacks.push('test-sound'),
      ...overrides,
    });
  }
  await act(() => root.render(h(Harness)));
}
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor);
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.body.innerHTML = '<main></main><button id="outside">외부</button>';
  host = document.querySelector('main');
  root = createRoot(host);
  callbacks = [];
  delete document.documentElement.requestFullscreen;
});
afterEach(async () => {
  await act(() => root.unmount());
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor);
  delete document.documentElement.requestFullscreen;
  delete document.fullscreenElement;
  delete document.exitFullscreen;
});
after(() => dom.window.close());

test('display preferences reject corrupt storage, normalize bounds and preserve only display fields', async () => {
  const normalize = preferences.normalizePresentationDisplayPreferences;
  assert.deepEqual(
    normalize({ theme: 'light', fontScale: 4, token: 'must-not-be-saved' }),
    { theme: 'light', fontScale: 1.5 },
  );
  assert.deepEqual(normalize({ theme: 'contrast', fontScale: 0.21 }), {
    theme: 'contrast',
    fontScale: 0.8,
  });
  assert.deepEqual(normalize({ theme: 'bad', fontScale: '1.5' }), {
    theme: 'dark',
    fontScale: 1,
  });
  assert.deepEqual(normalize({ theme: 'dark', fontScale: NaN }), {
    theme: 'dark',
    fontScale: 1,
  });
  window.localStorage.setItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
    '{broken',
  );
  await mount();
  assert.equal(state.theme, 'dark');
  assert.equal(state.fontScale, 1);
});

test('theme and size survive reloads while other presentation windows keep independent settings', async () => {
  await mount();
  await act(() => state.setTheme('light'));
  await act(() => state.setFontScale(1.42));
  assert.deepEqual(
    JSON.parse(
      window.localStorage.getItem(
        preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
      ),
    ),
    { theme: 'light', fontScale: 1.4 },
  );
  await act(() => root.unmount());
  root = createRoot(host);
  await mount();
  assert.equal(state.theme, 'light');
  assert.equal(state.fontScale, 1.4);
  window.localStorage.setItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
    JSON.stringify({ theme: 'contrast', fontScale: 0.9 }),
  );
  await act(() =>
    window.dispatchEvent(
      new window.StorageEvent('storage', {
        key: preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
      }),
    ),
  );
  assert.equal(state.theme, 'light');
  assert.equal(state.fontScale, 1.4);
  assert.deepEqual(preferences.readPresentationDisplayPreferences(), {
    theme: 'light',
    fontScale: 1.4,
  });
  const currentTab = window.sessionStorage.getItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
  );
  window.sessionStorage.clear();
  assert.deepEqual(preferences.readPresentationDisplayPreferences(), {
    theme: 'contrast',
    fontScale: 0.9,
  });
  window.sessionStorage.setItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
    currentTab,
  );
  await act(() => state.resetFontScale());
  assert.equal(state.fontScale, 1);
});

test('display preferences still work when browser storage is disabled', async () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked');
    },
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked');
    },
  });
  await mount();
  await act(() => state.setTheme('contrast'));
  await act(() => state.setFontScale(1.5));
  assert.equal(state.theme, 'contrast');
  assert.equal(state.fontScale, 1.5);
});

test('settings are closed by default and Escape restores trigger focus', async () => {
  await mount();
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(button('화면 설정').getAttribute('aria-expanded'), 'false');
  await click(button('화면 설정'));
  assert.equal(document.activeElement.getAttribute('role'), 'dialog');
  await act(() =>
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, button('화면 설정'));
});

test('only chosen divisions remain visible and the last selection cannot be removed', async () => {
  await mount();
  await click(button('화면 설정'));
  let checkboxes = [...host.querySelectorAll('input[type="checkbox"]')];
  assert.equal(checkboxes.filter((input) => input.checked).length, 3);
  await click(checkboxes[0]);
  assert.deepEqual(callbacks.at(-1), ['freshman', 'open']);
  checkboxes = [...host.querySelectorAll('input[type="checkbox"]')];
  await click(checkboxes[1]);
  assert.deepEqual(callbacks.at(-1), ['open']);
  checkboxes = [...host.querySelectorAll('input[type="checkbox"]')];
  assert.equal(checkboxes[2].disabled, true);
  await click(checkboxes[2]);
  assert.deepEqual(callbacks.at(-1), ['open']);
  await click(button('전체 유형'));
  assert.deepEqual(callbacks.at(-1), []);
  assert.equal(
    host.querySelectorAll('input[type="checkbox"]:checked').length,
    3,
  );
});

test('theme, sound and test actions change display state without contest APIs', async () => {
  await mount();
  await click(button('화면 설정'));
  await click(button('Aa라이트'));
  assert.equal(state.theme, 'light');
  const slider = host.querySelector('input[type="range"]');
  await act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(slider, '150');
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(state.fontScale, 1.5);
  await click(button('기본 크기'));
  assert.equal(state.fontScale, 1);
  await click(button('효과음'));
  assert.equal(button('효과음').getAttribute('aria-checked'), 'true');
  await click(button('소리 테스트'));
  assert.equal(callbacks.at(-1), 'test-sound');
  assert.equal(button('전체화면').disabled, true);
});

test('fullscreen uses the display container in a user gesture and reports browser rejection', async () => {
  let target;
  document.documentElement.requestFullscreen = async function () {
    target = this;
  };
  host.className = 'presentation-display';
  host.requestFullscreen = document.documentElement.requestFullscreen;
  await mount();
  await click(button('전체화면'));
  assert.equal(target, host);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: host,
  });
  await act(() => document.dispatchEvent(new window.Event('fullscreenchange')));
  assert.ok(button('전체화면 해제'));
  let exits = 0;
  document.exitFullscreen = async () => {
    exits++;
  };
  await click(button('전체화면 해제'));
  assert.equal(exits, 1);
  delete document.fullscreenElement;
  await act(() => document.dispatchEvent(new window.Event('fullscreenchange')));
  host.requestFullscreen = async () => {
    throw new Error('rejected');
  };
  await click(button('전체화면'));
  assert.match(
    host.querySelector('[role="status"]').textContent,
    /전체화면으로 전환하지 못했습니다/,
  );
});

test('outside clicks and keyboard focus dismiss the non-modal settings', async () => {
  await mount();
  await click(button('화면 설정'));
  await act(() =>
    document
      .getElementById('outside')
      .dispatchEvent(new window.Event('pointerdown', { bubbles: true })),
  );
  assert.equal(host.querySelector('[role="dialog"]'), null);
  await click(button('화면 설정'));
  await act(() => document.getElementById('outside').focus());
  assert.equal(host.querySelector('[role="dialog"]'), null);
});
