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
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let resized, reducedMotion;
window.matchMedia = (query) => ({
  matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
  addEventListener: (_type, fn) => {
    resized = fn;
  },
  removeEventListener: (_type, fn) => {
    if (resized === fn) resized = null;
  },
});
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, useLocation, useNavigate } = require('react-router-dom');
const h = React.createElement;
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
    if (id.endsWith('.png')) return { __esModule: true, default: '/logo.png' };
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
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
const HeaderShell = source('components/layout/HeaderShell.tsx').default;
const navItems = [
  { key: 'notices', label: '공지사항', to: '/notices' },
  { key: 'contests', label: '대회 목록', to: '/contests', end: true },
];
let root, navigate, currentPath;
function Observer() {
  currentPath = useLocation().pathname;
  navigate = useNavigate();
  return null;
}
beforeEach(async () => {
  reducedMotion = false;
  document.body.innerHTML = '<main></main>';
  root = createRoot(document.querySelector('main'));
  await act(() =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: ['/notices'] },
        h(Observer),
        h(HeaderShell, {
          ariaLabel: 'Main navigation',
          navItems,
          actions: h('button', null, '내 정보'),
        }),
      ),
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
});
after(() => dom.window.close());
async function click(el) {
  assert.ok(el);
  await act(() => el.click());
}
function menuButton() {
  return document.querySelector('[aria-label="메뉴 열기"]');
}

test('folded menu preserves destinations, selected page and account controls', async () => {
  assert.equal(document.querySelector('dialog'), null);
  menuButton().focus();
  await click(menuButton());
  assert.equal(menuButton().getAttribute('aria-expanded'), 'true');
  const nav = document.querySelector('.site-mobile-nav');
  assert.equal(
    nav.querySelector('[aria-current="page"]').textContent,
    '공지사항',
  );
  assert.equal(
    nav.querySelector('a[href="/contests"]').textContent,
    '대회 목록',
  );
  assert.equal(
    document.querySelector('.site-header-actions').textContent,
    '내 정보',
  );
  await click(document.querySelector('[aria-label="메뉴 닫기"]'));
  assert.equal(
    document.querySelector('.site-menu-drawer').dataset.state,
    'closing',
  );
  assert.equal(document.body.style.overflow, 'hidden');
  await finishClosing();
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, menuButton());
});

test('choosing a mobile destination closes the menu and back does not reopen it', async () => {
  await click(menuButton());
  await click(document.querySelector('.site-mobile-nav a[href="/contests"]'));
  assert.equal(currentPath, '/contests');
  assert.equal(document.querySelector('dialog'), null);
  await act(() => navigate(-1));
  assert.equal(currentPath, '/notices');
  assert.equal(document.querySelector('dialog'), null);
});

test('Escape animates dismissal before restoring page scrolling', async () => {
  await click(menuButton());
  assert.equal(document.body.style.overflow, 'hidden');
  await act(() =>
    document
      .querySelector('dialog')
      .dispatchEvent(new dom.window.Event('cancel', { cancelable: true })),
  );
  assert.equal(
    document.querySelector('.site-menu-drawer').dataset.state,
    'closing',
  );
  await finishClosing();
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, '');
});

test('returning to a desktop width closes the menu and removes resize listeners on unmount', async () => {
  await click(menuButton());
  await act(() => resized({ matches: true }));
  assert.equal(document.querySelector('dialog'), null);
  await act(() => root.render(null));
  assert.equal(resized, null);
});

async function finishClosing() {
  const event = new dom.window.Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', {
    value: 'site-menu-slide-out',
  });
  await act(() =>
    document.querySelector('.site-menu-drawer').dispatchEvent(event),
  );
}

test('backdrop dismissal uses the exit animation and restores trigger focus', async () => {
  menuButton().focus();
  await click(menuButton());
  const backdrop = document.querySelector('.zoj-modal-backdrop');
  await act(() => {
    backdrop.dispatchEvent(
      new dom.window.Event('pointerdown', { bubbles: true }),
    );
    backdrop.click();
  });
  assert.equal(
    document.querySelector('.site-menu-drawer').dataset.state,
    'closing',
  );
  assert.equal(menuButton().getAttribute('aria-expanded'), 'false');
  await finishClosing();
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, menuButton());
});

test('reduced motion dismisses immediately without waiting for animation', async () => {
  reducedMotion = true;
  await click(menuButton());
  await click(document.querySelector('[aria-label="메뉴 닫기"]'));
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, '');
});

test('interrupted animation still releases the modal and its scroll lock', async () => {
  await click(menuButton());
  await click(document.querySelector('[aria-label="메뉴 닫기"]'));
  assert.equal(
    document.querySelector('.site-menu-drawer').dataset.state,
    'closing',
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, '');
});
