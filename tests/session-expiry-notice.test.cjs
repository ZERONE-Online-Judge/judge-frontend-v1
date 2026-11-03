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
// jsdom has no top layer; browser QA verifies native focus containment and sizing.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (!id.startsWith('@/')) return nativeRequire(id);
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

const { MemoryRouter, useLocation } = require('react-router-dom');
const SessionExpiryRedirector = source(
  'app/providers/SessionExpiryRedirector.tsx',
).default;
const { SESSION_EXPIRED_EVENT } = source(
  'domains/identityAccess/sessionStorage.ts',
);
let root, host, location;
function LocationObserver() {
  location = useLocation();
  return null;
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
after(() => dom.window.close());
async function render(
  entry = '/operator/contests/demo/problems?tab=tests#source',
) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(SessionExpiryRedirector),
        h(LocationObserver),
      ),
    ),
  );
}
async function expire(currentPath) {
  await act(async () =>
    window.dispatchEvent(
      new dom.window.CustomEvent(SESSION_EXPIRED_EVENT, {
        detail: currentPath ? { currentPath } : undefined,
      }),
    ),
  );
}
function button(label) {
  return [...document.querySelectorAll('button')].find((node) =>
    node.textContent.includes(label),
  );
}

test('expiry displays one focused dialog without silently sending the user away', async () => {
  await render();
  await expire();
  await expire('/other');
  assert.equal(document.querySelectorAll('dialog').length, 1);
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.equal(document.activeElement, dialog);
  assert.match(dialog.textContent, /로그아웃되었습니다/);
  assert.equal(location.pathname, '/operator/contests/demo/problems');
  const cancel = new dom.window.Event('cancel', { cancelable: true });
  await act(async () => dialog.dispatchEvent(cancel));
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(dialog.open, true);
});

test('main action dismisses the notice and returns to the public homepage', async () => {
  await render();
  await expire();
  await act(async () => button('메인으로 돌아가기').click());
  assert.equal(location.pathname, '/');
  assert.equal(document.querySelector('dialog'), null);
  assert.notEqual(document.body.style.overflow, 'hidden');
});

test('login action retains the first interrupted route including its query and hash', async () => {
  await render();
  await expire();
  await expire('/login');
  await act(async () => button('다시 로그인').click());
  assert.equal(location.pathname, '/login');
  const params = new URLSearchParams(location.search);
  assert.equal(params.get('reason'), 'session');
  assert.equal(
    params.get('moveTo'),
    '/operator/contests/demo/problems?tab=tests#source',
  );
  assert.equal(document.querySelector('dialog'), null);
});

test('expiry still explains the problem when an access guard already moved to login', async () => {
  await render('/login?moveTo=%2Foperator');
  await expire('/operator');
  assert.ok(button('메인으로 돌아가기'));
  await act(async () => button('다시 로그인').click());
  assert.equal(new URLSearchParams(location.search).get('moveTo'), '/operator');
});

test('expiry does not accept an external URL as the login return destination', async () => {
  await render();
  await expire('//external.example');
  await act(async () => button('다시 로그인').click());
  assert.equal(new URLSearchParams(location.search).has('moveTo'), false);
});

test('Editor logout reauthentication keeps the nested return destination on the login page', async () => {
  const target =
    '/editor/return?next=%2Fproblems%2Fdemo%2Foverview%3Ftab%3Dtests%23A';
  await render('/login?' + new URLSearchParams({ moveTo: target }));
  await expire();
  await act(async () => button('다시 로그인').click());
  assert.equal(new URLSearchParams(location.search).get('moveTo'), target);
});

for (const target of ['//external.example', '/login?moveTo=/editor/return']) {
  test(
    'reauthentication rejects an unsafe nested login return: ' + target,
    async () => {
      await render('/login?' + new URLSearchParams({ moveTo: target }));
      await expire();
      await act(async () => button('다시 로그인').click());
      assert.equal(new URLSearchParams(location.search).has('moveTo'), false);
    },
  );
}
