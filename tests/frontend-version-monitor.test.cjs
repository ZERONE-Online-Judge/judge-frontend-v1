const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const { Response } = global;
const dom = new JSDOM('<body></body>', { url: 'https://judge.test/contests' });
global.window = dom.window;
global.document = dom.window.document;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const file = ['.ts', '.tsx'].map((ext) => base + ext).find(fs.existsSync);
      if (file)
        return source(path.relative(path.resolve(__dirname, '../src'), file));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(
      fs
        .readFileSync(filename, 'utf8')
        .replaceAll('import.meta.env.VITE_API_BASE_URL', 'undefined'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    filename,
  );
  return loaded.exports;
}
const {
  parseFrontendVersion,
  claimFrontendReload,
  isPresentationUpdateDeferred,
} = source('shared/lib/frontendVersion.ts');
const { startFrontendVersionMonitor } = source(
  'shared/lib/frontendVersionMonitor.ts',
);
const {
  acquireFrontendUpdateBlocker,
  getFrontendUpdateSafety,
  protectFrontendWrite,
} = source('shared/lib/frontendUpdateSafety.ts');
const { apiRequest, apiFetchRaw, withPasskeyCeremony } = source(
  'shared/api/client.ts',
);
const { currentChangeNotice, finishChangeNotice } = source(
  'shared/api/changeNotice.ts',
);
const originalFetch = global.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
const version = (id = 'new') => ({
  schemaVersion: 1,
  version: id,
  revision: null,
  builtAt: '2026-11-17T00:00:00Z',
  entry: '/assets/index-release.js',
});
const response = (body, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });
let monitor, visible, online, blocked, calls, versions, reloaded, notices;
const settle = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
async function tick(context, milliseconds) {
  while (milliseconds > 0) {
    const step = Math.min(500, milliseconds);
    context.mock.timers.tick(step);
    await settle();
    milliseconds -= step;
  }
}
function start() {
  monitor = startFrontendVersionMonitor({
    currentVersion: 'current',
    isBlocked: () =>
      blocked ||
      getFrontendUpdateSafety().drafts > 0 ||
      getFrontendUpdateSafety().operations > 0,
    onVersion: (item) => notices.push(item?.version ?? null),
    onAutoReload: (item) => reloaded.push(item.version),
  });
}
beforeEach((context) => {
  context.mock.timers.enable({
    apis: ['setTimeout', 'setInterval', 'Date'],
    now: 1_800_000_000_000,
  });
  visible = true;
  online = true;
  blocked = false;
  calls = [];
  versions = [version()];
  reloaded = [];
  notices = [];
  window.sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  });
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      get onLine() {
        return online;
      },
    },
  });
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const item = versions.length > 1 ? versions.shift() : versions[0];
    if (item instanceof Error) throw item;
    return response(item);
  };
});
afterEach(() => {
  monitor?.stop();
  monitor = null;
  global.fetch = originalFetch;
  Object.defineProperty(global, 'navigator', originalNavigator);
  delete document.visibilityState;
  assert.deepEqual(
    {
      drafts: getFrontendUpdateSafety().drafts,
      operations: getFrontendUpdateSafety().operations,
    },
    { drafts: 0, operations: 0 },
  );
});
after(() => dom.window.close());

test('manifest rejects HTML, unsupported schemas, unsafe identifiers and entry URLs', () => {
  assert.deepEqual(parseFrontendVersion(version()), version());
  for (const item of [
    null,
    '<html>',
    {},
    { ...version(), schemaVersion: 2 },
    { ...version(), version: 'bad value' },
    { ...version(), builtAt: 'bad' },
    { ...version(), entry: 'https://other.test/entry.js' },
  ])
    assert.equal(parseFrontendVersion(item), null);
});

test('a new deployment requires two independent fresh reads and quiet time before one reload', async (context) => {
  start();
  await tick(context, 1000);
  assert.deepEqual(reloaded, []);
  await tick(context, 3000);
  assert.equal(calls.length, 2);
  await tick(context, 2500);
  assert.deepEqual(reloaded, ['new']);
  await tick(context, 2000);
  assert.deepEqual(reloaded, ['new']);
  assert.notEqual(calls[0].url, calls[1].url);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.credentials, 'omit');
});

test('dirty work defers reload, then refreshes the candidate again after a long edit', async (context) => {
  const release = acquireFrontendUpdateBlocker('draft');
  start();
  await tick(context, 1000);
  await tick(context, 3000);
  await tick(context, 20000);
  assert.deepEqual(reloaded, []);
  release();
  await tick(context, 500);
  assert.equal(calls.length, 3);
  await tick(context, 2500);
  assert.deepEqual(reloaded, ['new']);
});

test('hidden and offline tabs do not fetch or navigate; returning online checks again', async (context) => {
  visible = false;
  start();
  await tick(context, 61000);
  assert.equal(calls.length, 0);
  visible = true;
  online = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  await settle();
  assert.equal(calls.length, 0);
  online = true;
  window.dispatchEvent(new window.Event('online'));
  await settle();
  assert.equal(calls.length, 1);
});

test('focus bursts share one pending request and stop aborts it', async (context) => {
  global.fetch = (url, init) => {
    calls.push({ url, init });
    return new Promise((resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  };
  start();
  await tick(context, 1000);
  for (let i = 0; i < 5; i++) window.dispatchEvent(new window.Event('focus'));
  assert.equal(calls.length, 1);
  monitor.stop();
  assert.equal(calls[0].init.signal.aborted, true);
  await settle();
  assert.deepEqual(notices, []);
});

test('failures, fallback HTML, bad manifests and timed-out checks never reload', async (context) => {
  start();
  versions = [new Error('offline'), {}, version('current')];
  await tick(context, 1000);
  await monitor.check();
  await monitor.check();
  global.fetch = async () => response(version(), 200, 'text/html');
  await monitor.check();
  global.fetch = (url, init) =>
    new Promise((resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('timeout'))),
    );
  const waiting = monitor.check();
  await tick(context, 8000);
  await waiting;
  await tick(context, 3000);
  assert.deepEqual(reloaded, []);
});

test('rapid releases replace the candidate, including a rollback to an older identifier', async (context) => {
  versions = [version('future'), version('older'), version('older')];
  start();
  await tick(context, 1000);
  await tick(context, 3000);
  await tick(context, 3000);
  await tick(context, 2500);
  assert.deepEqual(reloaded, ['older']);
  assert.deepEqual(notices, ['future', 'older', 'older']);
});

test('returning to the current version cancels pending reload', async (context) => {
  versions = [version('future'), version('current')];
  start();
  await tick(context, 1000);
  await tick(context, 3000);
  await tick(context, 5000);
  assert.deepEqual(reloaded, []);
  assert.deepEqual(notices, ['future', null]);
});

test('an operation beginning during quiet time cancels navigation', async (context) => {
  start();
  await tick(context, 1000);
  await tick(context, 3000);
  await tick(context, 1500);
  const release = acquireFrontendUpdateBlocker('operation');
  await tick(context, 2000);
  assert.deepEqual(reloaded, []);
  release();
  await tick(context, 2500);
  assert.deepEqual(reloaded, ['new']);
});

test('reload attempts are per source/target pair and storage failure disables automatic reload', () => {
  assert.equal(claimFrontendReload('one', 'two'), true);
  assert.equal(claimFrontendReload('one', 'two'), false);
  assert.equal(claimFrontendReload('two', 'one'), true);
  const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  assert.equal(claimFrontendReload('one', 'three'), false);
  Object.defineProperty(window, 'sessionStorage', descriptor);
});

test('presentation routes are deferred in both account and operator views', () => {
  for (const route of [
    '/presentation/login',
    '/presentation/contests/c',
    '/operator/contests/c/scoreboard/presentation',
  ])
    assert.equal(isPresentationUpdateDeferred(route), true);
  assert.equal(
    isPresentationUpdateDeferred('/operator/contests/c/scoreboard'),
    false,
  );
});

test('nested operation blockers release independently, including rejected writes', async () => {
  let finish;
  global.fetch = () =>
    new Promise((resolve) => {
      finish = () => resolve(response({ data: true }));
    });
  const release = acquireFrontendUpdateBlocker('operation');
  const waiting = apiFetchRaw('/write', undefined, { method: 'POST' });
  assert.equal(getFrontendUpdateSafety().operations, 2);
  finish();
  await waiting;
  assert.equal(getFrontendUpdateSafety().operations, 1);
  release();
  release();
  global.fetch = async () => {
    throw new Error('network');
  };
  await assert.rejects(
    apiRequest('/write', undefined, { method: 'POST' }),
    /network/,
  );
  assert.equal(getFrontendUpdateSafety().operations, 0);
  const read = protectFrontendWrite({ method: 'GET' });
  assert.equal(getFrontendUpdateSafety().operations, 0);
  read();
});

test('logical write stays protected while waiting for change notice approval', async () => {
  let index = 0;
  global.fetch = async () =>
    ++index === 1
      ? response(
          {
            error: {
              code: 'change_notice_required',
              message: 'notice',
              details: {
                title: 'title',
                body: 'body',
                fingerprint: 'fingerprint',
              },
            },
          },
          409,
        )
      : response({ data: 'saved' });
  const waiting = apiRequest('/operator/contests/c/settings', undefined, {
    method: 'POST',
    body: '{}',
  });
  await settle();
  assert.ok(currentChangeNotice());
  assert.equal(getFrontendUpdateSafety().operations, 1);
  const notice = currentChangeNotice();
  finishChangeNotice(notice.id, { ...notice.draft, reason: 'approved' });
  assert.equal(await waiting, 'saved');
  assert.equal(getFrontendUpdateSafety().operations, 0);
});

test('system passkey prompts retain operation protection between HTTP requests', async () => {
  let finish;
  const waiting = withPasskeyCeremony(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  assert.equal(getFrontendUpdateSafety().operations, 1);
  finish('credential');
  assert.equal(await waiting, 'credential');
  assert.equal(getFrontendUpdateSafety().operations, 0);
});
