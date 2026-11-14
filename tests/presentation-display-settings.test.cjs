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
    const [soundVolume, setSoundVolume] = React.useState(0.75);
    return h(Settings, {
      ...state,
      onThemeChange: state.setTheme,
      onFontScaleChange: state.setFontScale,
      onAutoScrollVerticalChange: state.setAutoScrollVertical,
      onAutoScrollHorizontalChange: state.setAutoScrollHorizontal,
      availableDivisions: divisions,
      selectedDivisionIds: selected,
      onDivisionIdsChange: (ids) => {
        callbacks.push(ids);
        setSelected(ids);
      },
      soundEnabled,
      onSoundEnabledChange: setSoundEnabled,
      soundVolume,
      onSoundVolumeChange: (volume) => {
        callbacks.push({ volume });
        setSoundVolume(volume);
      },
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
    {
      theme: 'light',
      fontScale: 3,
      autoScrollVertical: true,
      autoScrollHorizontal: true,
    },
  );
  assert.deepEqual(normalize({ theme: 'contrast', fontScale: 0.21 }), {
    theme: 'contrast',
    fontScale: 0.8,
    autoScrollVertical: true,
    autoScrollHorizontal: true,
  });
  assert.deepEqual(normalize({ theme: 'bad', fontScale: '1.5' }), {
    theme: 'dark',
    fontScale: 1,
    autoScrollVertical: true,
    autoScrollHorizontal: true,
  });
  assert.deepEqual(normalize({ theme: 'dark', fontScale: NaN }), {
    theme: 'dark',
    fontScale: 1,
    autoScrollVertical: true,
    autoScrollHorizontal: true,
  });
  assert.deepEqual(
    normalize({
      theme: 'light',
      fontScale: 1.5,
      autoScrollVertical: true,
      autoScrollHorizontal: true,
    }),
    {
      theme: 'light',
      fontScale: 1.5,
      autoScrollVertical: true,
      autoScrollHorizontal: true,
    },
  );
  assert.deepEqual(
    normalize({ autoScrollVertical: 'true', autoScrollHorizontal: 1 }),
    {
      theme: 'dark',
      fontScale: 1,
      autoScrollVertical: true,
      autoScrollHorizontal: true,
    },
  );
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
    {
      theme: 'light',
      fontScale: 1.4,
      autoScrollVertical: true,
      autoScrollHorizontal: true,
    },
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
    autoScrollVertical: true,
    autoScrollHorizontal: true,
  });
  const currentTab = window.sessionStorage.getItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
  );
  window.sessionStorage.clear();
  assert.deepEqual(preferences.readPresentationDisplayPreferences(), {
    theme: 'contrast',
    fontScale: 0.9,
    autoScrollVertical: true,
    autoScrollHorizontal: true,
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
  await act(() => state.setAutoScrollVertical(true));
  await act(() => state.setAutoScrollHorizontal(true));
  assert.equal(state.theme, 'contrast');
  assert.equal(state.fontScale, 1.5);
  assert.equal(state.autoScrollVertical, true);
  assert.equal(state.autoScrollHorizontal, true);
});

test('table scroll switches default on and explicit off preferences persist independently', async () => {
  window.localStorage.setItem(
    preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
    JSON.stringify({ theme: 'contrast', fontScale: 1.5 }),
  );
  await mount();
  assert.equal(
    state.autoScrollVertical,
    true,
    'Legacy preferences receive the current default',
  );
  assert.equal(state.autoScrollHorizontal, true);
  await click(button('화면 설정'));
  const vertical = button('세로 자동 스크롤');
  const horizontal = button('가로 자동 스크롤');
  assert.equal(vertical.getAttribute('role'), 'switch');
  assert.equal(horizontal.getAttribute('role'), 'switch');
  assert.equal(vertical.getAttribute('aria-checked'), 'true');
  assert.equal(horizontal.getAttribute('aria-checked'), 'true');
  assert.match(
    document.getElementById(vertical.getAttribute('aria-describedby'))
      .textContent,
    /각 유형의 표에서 넘치는 내용/,
  );
  await click(vertical);
  assert.equal(state.autoScrollVertical, false);
  assert.equal(state.autoScrollHorizontal, true);
  await click(horizontal);
  assert.equal(state.autoScrollHorizontal, false);
  assert.equal(state.theme, 'contrast');
  assert.equal(state.fontScale, 1.5);
  assert.equal(
    host.querySelectorAll('input[type="checkbox"]').length,
    divisions.length,
    'Table scroll switches do not become division checkboxes',
  );
  const expected = {
    theme: 'contrast',
    fontScale: 1.5,
    autoScrollVertical: false,
    autoScrollHorizontal: false,
  };
  for (const storage of ['sessionStorage', 'localStorage'])
    assert.deepEqual(
      JSON.parse(
        window[storage].getItem(
          preferences.PRESENTATION_DISPLAY_PREFERENCES_KEY,
        ),
      ),
      expected,
    );
  await act(() => root.unmount());
  root = createRoot(host);
  await mount();
  assert.equal(state.autoScrollVertical, false);
  assert.equal(state.autoScrollHorizontal, false);
  await act(() => state.resetFontScale());
  assert.equal(state.autoScrollVertical, false);
  assert.equal(state.autoScrollHorizontal, false);
  await act(() => state.setAutoScrollVertical(true));
  assert.equal(state.autoScrollVertical, true);
  assert.equal(state.autoScrollHorizontal, false);
});

test('settings are closed by default and Escape restores trigger focus', async () => {
  const openChanges = [];
  await mount({ onOpenChange: (open) => openChanges.push(open) });
  assert.deepEqual(openChanges, [false]);
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(button('화면 설정').getAttribute('aria-expanded'), 'false');
  await click(button('화면 설정'));
  assert.deepEqual(openChanges, [false, true]);
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
  assert.deepEqual(openChanges, [false, true, false]);
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
    ).set.call(slider, '300');
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(slider.max, '300');
  assert.equal(state.fontScale, 3);
  await click(button('기본 크기'));
  assert.equal(state.fontScale, 1);
  await click(button('효과음'));
  assert.equal(button('효과음').getAttribute('aria-checked'), 'true');
  await click(button('소리 테스트'));
  assert.equal(callbacks.at(-1), 'test-sound');
  assert.equal(button('전체화면').disabled, true);
});

test('sound volume exposes its percentage and mute value independently from sound and font controls', async () => {
  await mount();
  await click(button('화면 설정'));
  const label = [...host.querySelectorAll('label')].find(
    (node) => node.textContent.trim() === '효과음 음량',
  );
  assert.ok(label, 'The volume slider has a visible associated label');
  const slider = document.getElementById(label.htmlFor);
  assert.ok(slider);
  assert.equal(slider.type, 'range');
  assert.equal(slider.min, '0');
  assert.equal(slider.max, '100');
  assert.equal(slider.step, '5');
  assert.equal(slider.value, '75');
  const output = [...host.querySelectorAll('output')].find((node) =>
    node.htmlFor.contains(slider.id),
  );
  assert.ok(output, 'Volume output is associated with its slider');
  assert.match(output.textContent, /75%/);
  for (const [percentage, volume] of [
    [25, 0.25],
    [0, 0],
    [100, 1],
  ]) {
    await act(() => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set.call(slider, String(percentage));
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.deepEqual(callbacks.at(-1), { volume });
    assert.equal(slider.value, String(percentage));
    if (percentage === 0) {
      assert.match(output.textContent, /무음/);
      assert.match(slider.getAttribute('aria-valuetext'), /무음/);
    } else {
      assert.match(output.textContent, new RegExp(`${percentage}%`));
      assert.match(
        slider.getAttribute('aria-valuetext'),
        new RegExp(`${percentage}%`),
      );
    }
    assert.equal(state.fontScale, 1, 'Audio volume cannot change font size');
    assert.equal(button('효과음').getAttribute('aria-checked'), 'false');
  }
  await click(button('효과음'));
  assert.equal(button('효과음').getAttribute('aria-checked'), 'true');
  assert.equal(slider.value, '100', 'Toggling sound preserves selected volume');
  await click(button('소리 테스트'));
  assert.equal(callbacks.at(-1), 'test-sound');
  await click(button('효과음'));
  assert.equal(button('효과음').getAttribute('aria-checked'), 'false');
  assert.equal(slider.value, '100');
  await click(button('소리 테스트'));
  assert.equal(callbacks.at(-1), 'test-sound');
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
  assert.equal(host.querySelector('.presentation-display-settings'), null);
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(host.querySelectorAll('button').length, 0);
  assert.match(host.querySelector('[role="status"]').textContent, /Esc/);
  delete document.fullscreenElement;
  await act(() => document.dispatchEvent(new window.Event('fullscreenchange')));
  assert.ok(button('전체화면'));
  assert.equal(host.querySelector('[role="status"]'), null);
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
  const openChanges = [];
  await mount({ onOpenChange: (open) => openChanges.push(open) });
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
  assert.deepEqual(openChanges, [false, true, false, true, false]);
});

test('close, trigger toggle, fullscreen and unmount report that the settings are no longer open', async () => {
  const openChanges = [];
  await mount({ onOpenChange: (open) => openChanges.push(open) });
  await click(button('화면 설정'));
  await click(button('화면 설정 닫기'));
  await click(button('화면 설정'));
  await click(button('화면 설정'));
  assert.deepEqual(openChanges, [false, true, false, true, false]);
  await click(button('화면 설정'));
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: host,
  });
  await act(() => document.dispatchEvent(new window.Event('fullscreenchange')));
  assert.equal(openChanges.at(-1), false);
  delete document.fullscreenElement;
  await act(() => document.dispatchEvent(new window.Event('fullscreenchange')));
  await click(button('화면 설정'));
  assert.equal(openChanges.at(-1), true);
  await act(() => root.unmount());
  assert.equal(openChanges.at(-1), false);
  root = createRoot(host);
});

test('fullscreen escape notice disappears after three seconds without leaving any controls', async () => {
  let clear, timer;
  const nativeSet = window.setTimeout;
  const nativeClear = window.clearTimeout;
  window.setTimeout = (callback, delay) => {
    assert.equal(delay, 3000);
    timer = callback;
    return 12;
  };
  window.clearTimeout = (id) => {
    clear = id;
  };
  try {
    await mount();
    await click(button('화면 설정'));
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: host,
    });
    await act(() =>
      document.dispatchEvent(new window.Event('fullscreenchange')),
    );
    assert.ok(host.querySelector('.presentation-fullscreen-hint'));
    assert.equal(
      host.querySelectorAll('button, input, [role="dialog"]').length,
      0,
    );
    await act(() => timer());
    assert.equal(host.textContent, '');
    assert.equal(clear, 12);
    delete document.fullscreenElement;
    await act(() =>
      document.dispatchEvent(new window.Event('fullscreenchange')),
    );
    assert.ok(button('전체화면'));
    assert.equal(host.querySelector('[role="dialog"]'), null);
  } finally {
    window.setTimeout = nativeSet;
    window.clearTimeout = nativeClear;
  }
});
