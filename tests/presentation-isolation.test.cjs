const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://zoj.kr/' });
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, useNavigate } = require('react-router-dom');
const { QueryClient, useQueryClient } = require('@tanstack/react-query');
const h = React.createElement;
const cache = new Map();
let queryClient, tracked, stoppedTracking;
const mocks = {
  '@/shared/query/queryClient': {
    get queryClient() {
      return queryClient;
    },
  },
  '@/domains/usageAnalytics/tracker': {
    usagePath: (pathname) => pathname,
    startUsageTracking: (options) => {
      tracked.push(options);
      return () => stoppedTracking++;
    },
  },
};
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const base = id.startsWith('@/')
      ? path.resolve(__dirname, '../src', id.slice(2))
      : path.resolve(path.dirname(filename), id);
    const resolved = ['', '.ts', '.tsx']
      .map((extension) => base + extension)
      .find((candidate) => fs.existsSync(candidate));
    return source(path.relative(path.resolve(__dirname, '../src'), resolved));
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(
      fs
        .readFileSync(filename, 'utf8')
        .replace('import.meta.env.VITE_API_BASE_URL', 'undefined'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    filename,
  );
  return loaded.exports;
}
const Providers = source('app/providers/AppProviders.tsx').default;
const Expiry = source('app/providers/SessionExpiryRedirector.tsx').default;
const useUsageTracking = source(
  'domains/usageAnalytics/useUsageTracking.ts',
).default;
const { isDedicatedPresentationPath } = source(
  'domains/presentationAccess/paths.ts',
);
const storage = source('domains/identityAccess/sessionStorage.ts');
const { useSessionStore } = source('domains/identityAccess/sessionStore.ts');
const general = {
  accessToken: 'existing-operator',
  refreshToken: 'existing-refresh',
  account: { email: 'operator@example.invalid', display_name: 'Operator' },
  participantContests: [],
  operatorContests: [],
  operatorSession: null,
};
let root, requests, intervals, navigate, availableClient;
const originalFetch = global.fetch;
const originalSetInterval = window.setInterval;
const originalClearInterval = window.clearInterval;
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  window.localStorage.clear();
  window.sessionStorage.clear();
  storage.saveGeneralSession(general);
  useSessionStore.getState().syncSessionsFromStorage();
  requests = [];
  intervals = new Map();
  tracked = [];
  stoppedTracking = 0;
  availableClient = null;
  let intervalId = 0;
  window.setInterval = (callback) => {
    intervals.set(++intervalId, callback);
    return intervalId;
  };
  window.clearInterval = (id) => intervals.delete(id);
  global.fetch = (url, init) =>
    new Promise((resolve) => requests.push({ url, init, resolve }));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  root = createRoot(document.querySelector('main'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  assert.equal(intervals.size, 0);
});
after(() => {
  global.fetch = originalFetch;
  window.setInterval = originalSetInterval;
  window.clearInterval = originalClearInterval;
  dom.window.close();
});
function Probe() {
  navigate = useNavigate();
  availableClient = useQueryClient();
  useUsageTracking();
  return h(Expiry);
}
async function mount(entry) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(Providers, null, h(Probe)),
      ),
    ),
  );
}
async function visit(pathname) {
  await act(async () => navigate(pathname));
}
async function expire() {
  await act(async () =>
    window.dispatchEvent(
      new window.CustomEvent(storage.SESSION_EXPIRED_EVENT, {
        detail: { currentPath: '/operator/contests/contest/scoreboard' },
      }),
    ),
  );
}

test('presentation-only paths are exact and leave operator controls authenticated', () => {
  for (const pathname of [
    '/presentation/login',
    '/presentation/login/',
    '/Presentation/LOGIN///',
    '/presentation/contests/contest',
    '/presentation/contests/contest/',
    '/Presentation/Contests/contest///',
  ])
    assert.equal(isDedicatedPresentationPath(pathname), true, pathname);
  for (const pathname of [
    '/login',
    '/presentation',
    '/presentation/login/other',
    '/presentation/contests/',
    '/presentation/contests/contest/settings',
    '/operator/contests/contest/scoreboard/presentation',
  ])
    assert.equal(isDedicatedPresentationPath(pathname), false, pathname);
});

for (const route of ['/presentation/login', '/presentation/contests/contest']) {
  test(`${route} preserves ordinary credentials without auth, analytics, or expiry interception`, async () => {
    await mount(route);
    assert.equal(availableClient, queryClient);
    queryClient.setQueryData(['display'], { visible: true });
    await expire();
    await act(async () =>
      window.dispatchEvent(
        new window.StorageEvent('storage', {
          key: storage.SESSION_EXPIRED_STORAGE_KEY,
          newValue: JSON.stringify({ email: general.account.email }),
        }),
      ),
    );
    assert.deepEqual(requests, []);
    assert.deepEqual(tracked, []);
    assert.equal(intervals.size, 0);
    assert.deepEqual(queryClient.getQueryData(['display']), { visible: true });
    assert.deepEqual(storage.loadStoredGeneralSession(), general);
    assert.deepEqual(useSessionStore.getState().generalSession, general);
    assert.equal(document.querySelector('dialog'), null);
  });
}

test('SPA entry aborts the ordinary stream and ignores its late rejection; returning resumes ordinary auth', async () => {
  await mount('/operator/contests/contest/scoreboard');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/auth/session-events');
  assert.equal(intervals.size, 1);
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].getToken(), general.accessToken);
  const pending = requests[0];
  await visit('/presentation/login');
  assert.equal(pending.init.signal.aborted, true);
  assert.equal(intervals.size, 0);
  assert.equal(stoppedTracking, 1);
  await act(async () => pending.resolve({ ok: false, status: 401 }));
  await expire();
  assert.equal(requests.length, 1);
  assert.equal(document.querySelector('dialog'), null);
  assert.deepEqual(storage.loadStoredGeneralSession(), general);
  await visit('/presentation/contests/contest');
  assert.equal(requests.length, 1);
  assert.equal(tracked.length, 1);
  await visit('/operator/contests/contest/scoreboard');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/api/auth/session-events');
  assert.equal(intervals.size, 1);
  assert.equal(tracked.length, 2);
});

test('operator presentation retains the ordinary account protections', async () => {
  await mount('/operator/contests/contest/scoreboard/presentation');
  assert.equal(requests.length, 1);
  assert.equal(intervals.size, 1);
  assert.equal(tracked.length, 1);
  queryClient.setQueryData(['operator-data'], 'cached');
  await expire();
  assert.equal(queryClient.getQueryData(['operator-data']), undefined);
  assert.equal(document.querySelector('dialog')?.open, true);
});

test('an ordinary expiry dialog cannot cover the dedicated display after SPA navigation', async () => {
  await mount('/operator/contests/contest/scoreboard');
  await expire();
  assert.equal(document.querySelector('dialog')?.open, true);
  await visit('/presentation/contests/contest');
  assert.equal(document.querySelector('dialog'), null);
  await expire();
  assert.equal(document.querySelector('dialog'), null);
});
