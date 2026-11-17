const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://zoj.test/operator/contests/synthetic/settings?tab=general#top',
  pretendToBeVisual: true,
});
let reloads = [];
const location = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === 'replace') return (url) => reloads.push(url);
      return Reflect.get(dom.window.location, property, dom.window.location);
    },
  },
);
// Keep the real DOM/window APIs; replace only navigation's browser boundary.
global.window = new Proxy(dom.window, {
  get(target, property) {
    if (property === 'location') return location;
    return Reflect.get(target, property, target);
  },
});
global.document = dom.window.document;
global.Element = dom.window.Element;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, useLocation, useNavigate } = require('react-router-dom');
const { QueryClientProvider } = require('@tanstack/react-query');
const nextVersion = {
  schemaVersion: 1,
  version: 'next-release',
  revision: 'b'.repeat(40),
  builtAt: '2026-11-17T00:00:00.000Z',
  entry: '/assets/index-next.js',
};
const cache = new Map();
let checks = [];
let monitorOptions;
let monitorStopped;
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === '@/shared/lib/frontendVersionMonitor') {
      return {
        startFrontendVersionMonitor(options) {
          monitorOptions = options;
          monitorStopped = false;
          void Promise.resolve().then(() => {
            if (!monitorStopped) options.onVersion(nextVersion);
          });
          return {
            check() {
              const request = deferred();
              checks.push(request);
              return request.promise;
            },
            stop() {
              monitorStopped = true;
            },
          };
        },
      };
    }
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((extension) => base + extension)
        .find(fs.existsSync);
      assert.ok(target, `Cannot resolve ${id} from ${relative}`);
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  const contents = fs
    .readFileSync(filename, 'utf8')
    .replaceAll('import.meta.env.VITE_FRONTEND_VERSION', '"current-release"')
    .replaceAll('import.meta.env.PROD', 'true');
  loaded._compile(
    ts.transpileModule(contents, {
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

const Notice = source('app/providers/FrontendUpdateNotice.tsx').default;
const { queryClient } = source('shared/query/queryClient.ts');
const { acquireFrontendUpdateBlocker, getFrontendUpdateSafety } = source(
  'shared/lib/frontendUpdateSafety.ts',
);
let root, navigate;
let releases = [];
const initialPath = '/operator/contests/synthetic/settings?tab=general#top';

function Workspace() {
  navigate = useNavigate();
  const route = useLocation();
  React.useEffect(() => {
    dom.window.history.replaceState(
      null,
      '',
      route.pathname + route.search + route.hash,
    );
  }, [route]);
  return h(
    React.Fragment,
    null,
    h('input', { 'aria-label': '작업 내용', defaultValue: '' }),
    h(Notice),
  );
}

beforeEach(async () => {
  document.body.innerHTML = '<main></main>';
  dom.window.history.replaceState(null, '', initialPath);
  window.sessionStorage.clear();
  checks = [];
  reloads = [];
  releases = [];
  monitorOptions = undefined;
  monitorStopped = undefined;
  root = createRoot(document.querySelector('main'));
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(MemoryRouter, { initialEntries: [initialPath] }, h(Workspace)),
      ),
    ),
  );
  assert.ok(document.querySelector('aside[aria-label="서비스 업데이트"]'));
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    for (const release of releases) release();
    for (const request of checks) request.resolve(null);
  });
  queryClient.clear();
  assert.equal(monitorStopped, true);
  assert.equal(getFrontendUpdateSafety().drafts, 0);
  assert.equal(getFrontendUpdateSafety().operations, 0);
});
after(() => dom.window.close());

const noticeButton = () =>
  document.querySelector('aside[aria-label="서비스 업데이트"] button');
const dialog = () => document.querySelector('dialog[open]');
function dialogButton(text) {
  return [...dialog().querySelectorAll('button')].find(
    (button) => button.textContent === text,
  );
}
async function click(button) {
  assert.ok(button);
  await act(() => button.click());
}
async function enter(value) {
  await act(() => {
    const input = document.querySelector('[aria-label="작업 내용"]');
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function settle(request = checks.at(-1), value = nextVersion) {
  assert.ok(request);
  await act(async () => request.resolve(value));
}
async function confirmedRequest() {
  await enter('저장하지 않은 초안');
  await click(noticeButton());
  assert.ok(dialog());
  assert.equal(checks.length, 0, 'approval precedes the version request');
  await click(dialogButton('업데이트'));
  assert.equal(checks.length, 1);
  assert.equal(noticeButton().disabled, true);
  return checks[0];
}

test('an idle manual update rechecks the release and preserves route, query and fragment', async () => {
  assert.equal(monitorOptions.currentVersion, 'current-release');
  await click(noticeButton());
  assert.equal(dialog(), null);
  assert.equal(checks.length, 1);
  assert.deepEqual(reloads, []);
  await settle();
  assert.equal(reloads.length, 1);
  const url = new window.URL(reloads[0]);
  assert.equal(url.pathname, '/operator/contests/synthetic/settings');
  assert.equal(url.searchParams.get('tab'), 'general');
  assert.equal(url.searchParams.get('__zojFrontendVersion'), 'next-release');
  assert.equal(url.hash, '#top');
});

test('an edited draft stays protected after blur and permits only an explicit confirmed update', async () => {
  const request = await confirmedRequest();
  assert.ok(document.body.textContent.includes('작성 중인 내용을 저장한 뒤'));
  assert.ok(
    dialog().textContent.includes('저장하지 않은 내용은 사라질 수 있습니다'),
  );
  assert.deepEqual(reloads, []);
  await settle(request);
  assert.equal(reloads.length, 1);
});

for (const dismissal of ['ESC', '닫기', '나중에']) {
  test(`dismissing a pending confirmation with ${dismissal} revokes it before more editing`, async () => {
    const request = await confirmedRequest();
    if (dismissal === 'ESC') {
      await act(() =>
        dialog().dispatchEvent(
          new window.Event('cancel', { cancelable: true }),
        ),
      );
    } else {
      await click(
        dismissal === '닫기'
          ? dialog().querySelector('[aria-label="닫기"]')
          : dialogButton('나중에'),
      );
    }
    assert.equal(dialog(), null);
    await enter('취소 후 새로 작성한 내용');
    await settle(request);
    assert.deepEqual(reloads, []);
    assert.equal(
      document.querySelector('input').value,
      '취소 후 새로 작성한 내용',
    );
  });
}

test('cancelling without any further edit still revokes an outstanding approval', async () => {
  const request = await confirmedRequest();
  const snapshot = getFrontendUpdateSafety();
  await click(dialogButton('나중에'));
  assert.equal(getFrontendUpdateSafety(), snapshot);
  await settle(request);
  assert.deepEqual(reloads, []);
});

for (const target of [
  '/operator/contests/synthetic/participants',
  '/operator/contests/synthetic/settings?tab=advanced#limits',
]) {
  test(`navigation to ${target} invalidates a previous confirmation`, async () => {
    const request = await confirmedRequest();
    await act(() => navigate(target));
    assert.equal(dialog(), null);
    await settle(request);
    assert.deepEqual(reloads, []);
    assert.equal(
      window.location.pathname + window.location.search + window.location.hash,
      target,
    );
  });
}

test('leaving and returning to the original URL does not restore an older approval', async () => {
  const request = await confirmedRequest();
  await act(() => navigate('/operator/contests/synthetic/participants'));
  await act(() => navigate(initialPath));
  assert.equal(
    window.location.pathname + window.location.search + window.location.hash,
    initialPath,
  );
  await settle(request);
  assert.deepEqual(reloads, []);
});

test('an operation disables the manual button and a completed operation restores it', async () => {
  let release;
  await act(() => {
    release = acquireFrontendUpdateBlocker('operation');
    releases.push(release);
  });
  assert.equal(noticeButton().disabled, true);
  assert.ok(document.body.textContent.includes('진행 중인 작업이 끝나면'));
  await click(noticeButton());
  assert.equal(checks.length, 0);
  await act(() => release());
  assert.equal(noticeButton().disabled, false);
  await click(noticeButton());
  await settle();
  assert.equal(reloads.length, 1);
});

test('an actual React Query mutation disables manual update until it settles', async () => {
  const request = deferred();
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey: ['synthetic-update-test'],
    mutationFn: () => request.promise,
    gcTime: Infinity,
  });
  let running;
  await act(async () => {
    running = mutation.execute();
    await new Promise((done) => global.setTimeout(done, 0));
  });
  assert.equal(getFrontendUpdateSafety().operations, 0);
  assert.equal(queryClient.isMutating(), 1);
  assert.equal(noticeButton().disabled, true);
  await click(noticeButton());
  assert.equal(checks.length, 0);
  await act(async () => {
    request.resolve();
    await running;
    await new Promise((done) => global.setTimeout(done, 0));
  });
  assert.equal(queryClient.isMutating(), 0);
  assert.equal(noticeButton().disabled, false);
});

test('an operation starting during the version check prevents manual navigation', async () => {
  await click(noticeButton());
  await act(() => releases.push(acquireFrontendUpdateBlocker('operation')));
  await settle();
  assert.deepEqual(reloads, []);
  assert.equal(noticeButton().disabled, true);
});

test('a new programmatic draft invalidates approval even without a DOM input event', async () => {
  const request = await confirmedRequest();
  await act(() => releases.push(acquireFrontendUpdateBlocker('draft')));
  await settle(request);
  assert.deepEqual(reloads, []);
  assert.ok(
    document.body.textContent.includes('변경 내용을 확인한 뒤 다시 업데이트'),
  );
});

test('unmounting the notice invalidates an outstanding approved request', async () => {
  const request = await confirmedRequest();
  await act(() => root.render(null));
  await settle(request);
  assert.deepEqual(reloads, []);
});
