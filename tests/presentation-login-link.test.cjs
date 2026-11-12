const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setTimeout } = require('node:timers');
const { URL, URLSearchParams } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://zoj.kr/presentation/login',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.sessionStorage = window.sessionStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} = require('react-router-dom');
const cache = new Map();
let requests, responder, routeLocation;
const nativeFetch = global.fetch;
const general = {
  accessToken: 'existing-operator-token',
  refreshToken: 'existing-operator-refresh',
  account: { account_id: 'operator-one', email: 'staff@example.invalid' },
  operatorContests: [{ contest_id: 'operator-contest' }],
};
const generalKey = 'zoj.generalSession';
const presentationKey = 'zoj.presentationSession';

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/components/common/PageLayout')
      return {
        __esModule: true,
        default: ({ children, title, description }) =>
          h(
            'main',
            null,
            h('h1', null, title),
            h('p', null, description),
            children,
          ),
      };
    if (id === '@/utils/Icons') return { SvgIcon: () => null };
    if (id === '@/shared/api/client')
      return {
        apiRequest: () => {
          throw new Error(
            'Presentation links must not use general-session APIs',
          );
        },
        apiFetchRaw: async (url, token, options) => {
          const request = {
            url,
            token,
            method: options?.method,
            body: options?.body ? JSON.parse(options.body) : undefined,
            location: window.location.href,
          };
          requests.push(request);
          return responder(request);
        },
      };
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

const links = source('domains/presentationAccess/loginLink.ts');
const { usePresentationSession } = source(
  'domains/presentationAccess/session.ts',
);
const { useSessionStore } = source('domains/identityAccess/sessionStore.ts');
const Page = source('pages/presentation/PresentationLoginPage.tsx').default;
function session(contestId = 'contest-one', suffix = 'one') {
  return {
    access_token: `synthetic-display-token-${suffix}`,
    contest_id: contestId,
    expires_at: '2099-11-12T12:00:00Z',
  };
}
function response(data, status = 200) {
  return {
    response: { ok: status >= 200 && status < 300, status },
    payload: status === 200 ? { data } : { error: data },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let root, host;
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(generalKey, JSON.stringify(general));
  useSessionStore.setState({
    generalSession: general,
    participantSession: null,
  });
  usePresentationSession.getState().setSession(null);
  window.history.replaceState({}, '', '/presentation/login');
  document.body.innerHTML = '<main id="test-host"></main>';
  host = document.getElementById('test-host');
  root = createRoot(host);
  requests = [];
  routeLocation = null;
  responder = () => response(session());
  global.fetch = () => {
    throw new Error('Unexpected real network request');
  };
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  assert.equal(
    window.localStorage.getItem(generalKey),
    JSON.stringify(general),
  );
  assert.deepEqual(useSessionStore.getState().generalSession, general);
  assert.equal(useSessionStore.getState().participantSession, null);
  global.fetch = nativeFetch;
});
after(() => dom.window.close());

function Destination() {
  routeLocation = useLocation();
  return h('p', { 'data-destination': true }, routeLocation.pathname);
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
async function mount(url, strict = false) {
  window.history.replaceState({}, '', url);
  const app = h(
    BrowserRouter,
    null,
    h(
      Routes,
      null,
      h(Route, { path: '/presentation/login', element: h(Page) }),
      h(Route, { path: '*', element: h(Destination) }),
    ),
  );
  await act(() => root.render(strict ? h(React.StrictMode, null, app) : app));
  await settle();
}
async function navigate(url) {
  await act(() => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
  await settle();
}
async function retry() {
  const button = [...host.querySelectorAll('button')].find((item) =>
    /다시 연결/.test(item.textContent),
  );
  assert.ok(button, 'A failed request offers an explicit retry');
  await act(() => button.click());
  await settle();
}
function assertScrubbed() {
  assert.equal(window.location.hash, '');
  assert.doesNotMatch(window.location.href, /score\.zoj\.kr|account=/);
  assert.doesNotMatch(host.textContent, /@score\.zoj\.kr/);
}

test('presentation login links keep the account in a fragment and preserve selected divisions in the final path', () => {
  const url = new URL(
    links.presentationLoginUrl('contest-one', 'display-one@score.zoj.kr', [
      'general',
      'freshman',
      'general',
    ]),
  );
  assert.equal(url.origin, 'https://zoj.kr');
  assert.equal(url.pathname, '/presentation/login');
  assert.equal(url.searchParams.get('contestId'), 'contest-one');
  assert.equal(url.searchParams.has('account'), false);
  assert.equal(
    new URLSearchParams(url.hash.slice(1)).get('account'),
    'display-one@score.zoj.kr',
  );
  const parsed = links.parsePresentationLoginLink(url.search, url.hash);
  assert.deepEqual(parsed, {
    contestId: 'contest-one',
    email: 'display-one@score.zoj.kr',
    divisionIds: ['general', 'freshman'],
  });
  const target = new URL(
    links.targetPresentationPath(parsed),
    'https://zoj.kr',
  );
  assert.equal(target.pathname, '/presentation/contests/contest-one');
  assert.deepEqual(target.searchParams.getAll('divisionId'), [
    'general',
    'freshman',
  ]);
  assert.equal(target.hash, '');
  assert.doesNotMatch(target.href, /account|score\.zoj\.kr/);
});

test('missing or malformed link information cannot become an automatic login request', async () => {
  for (const [search, hash] of [
    ['', ''],
    ['?contestId=contest-one', ''],
    ['', '#account=display-one%40score.zoj.kr'],
    ['?contestId=', '#account=display-one%40score.zoj.kr'],
    ['?contestId=contest-one', '#account='],
    ['?contestId=contest-one', '#account=staff%40example.invalid'],
    [
      '?contestId=contest-one',
      '#account=one%40score.zoj.kr%0Atwo%40score.zoj.kr',
    ],
    [
      '?contestId=contest-one&contestId=contest-two',
      '#account=one%40score.zoj.kr',
    ],
    ['?contestId=contest%2Fone', '#account=one%40score.zoj.kr'],
    [
      '?contestId=contest-one',
      '#account=one%40score.zoj.kr&account=two%40score.zoj.kr',
    ],
    ['?contestId=contest-one', '#account=one%40score.zoj.kr&next=%2Fadmin'],
    [
      '?contestId=contest-one&divisionId=..%2Fother',
      '#account=one%40score.zoj.kr',
    ],
  ]) {
    assert.equal(links.parsePresentationLoginLink(search, hash), null);
  }
  await mount(
    '/presentation/login?contestId=contest-one#account=staff%40example.invalid',
  );
  assert.deepEqual(requests, []);
  assert.equal(usePresentationSession.getState().session, null);
  assertScrubbed();
  assert.ok(
    host.querySelector('a[href^="/login"]'),
    'Invalid links provide the normal login path',
  );
});

test('link normalization accepts only presentation accounts and carries no unrelated URL parameters into the destination', () => {
  const url = new URL(
    links.presentationLoginUrl('contest-one', ' Display.One@Score.Zoj.Kr ', [
      'general',
    ]),
  );
  const parsed = links.parsePresentationLoginLink(
    `${url.search}&next=https://untrusted.invalid&token=private`,
    url.hash,
  );
  assert.equal(parsed.email, 'display.one@score.zoj.kr');
  assert.equal(
    links.targetPresentationPath(parsed),
    '/presentation/contests/contest-one?divisionId=general',
  );
  for (const [contestId, email] of [
    ['', 'one@score.zoj.kr'],
    ['../contest', 'one@score.zoj.kr'],
    ['contest-one', 'staff@example.invalid'],
  ]) {
    assert.throws(
      () => links.presentationLoginUrl(contestId, email),
      TypeError,
    );
  }
});

test('StrictMode consumes the credential once, scrubs it before POST, and navigates without changing operator login', async () => {
  const initialLength = window.history.length;
  await mount(
    links.presentationLoginUrl('contest-one', 'strict-mode@score.zoj.kr', [
      'general',
      'freshman',
    ]),
    true,
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/auth/presentation/login');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].token, undefined);
  assert.deepEqual(requests[0].body, { email: 'strict-mode@score.zoj.kr' });
  assert.equal(
    new URL(requests[0].location).hash,
    '',
    'Credential is removed before the API starts',
  );
  assertScrubbed();
  assert.equal(window.location.pathname, '/presentation/contests/contest-one');
  assert.deepEqual(
    new URLSearchParams(window.location.search).getAll('divisionId'),
    ['general', 'freshman'],
  );
  assert.equal(
    window.history.length,
    initialLength,
    'Successful login replaces the credential-bearing history entry',
  );
  assert.deepEqual(usePresentationSession.getState().session, session());
  assert.deepEqual(
    JSON.parse(window.sessionStorage.getItem(presentationKey)),
    session(),
  );
  assert.equal(window.localStorage.getItem(presentationKey), null);
  assert.equal(routeLocation.hash, '');
  assert.doesNotMatch(
    JSON.stringify(routeLocation.state),
    /score\.zoj\.kr|account=/,
  );
});

test('expired and revoked accounts expose a safe error and never store a presentation session', async () => {
  for (const [code, status, account] of [
    ['presentation_account_expired', 401, 'expired-link'],
    ['presentation_account_revoked', 403, 'revoked-link'],
  ]) {
    responder = () =>
      response({ code, message: `sensitive-${account}@score.zoj.kr` }, status);
    await mount(
      links.presentationLoginUrl('contest-one', `${account}@score.zoj.kr`),
    );
    assert.equal(requests.length, 1);
    assertScrubbed();
    assert.equal(usePresentationSession.getState().session, null);
    assert.equal(window.sessionStorage.getItem(presentationKey), null);
    assert.match(host.textContent, /링크|로그인/);
    assert.doesNotMatch(host.textContent, /sensitive-|presentation_account_/);
    assert.ok(host.querySelector('a[href^="/login"]'));
    await act(() => root.unmount());
    root = createRoot(host);
    requests = [];
  }
});

test('network failure waits for an explicit retry and retries the consumed link without restoring its fragment', async () => {
  responder = () =>
    Promise.reject(new Error('Synthetic private network detail'));
  await mount(
    links.presentationLoginUrl('contest-one', 'network-retry@score.zoj.kr'),
  );
  assert.equal(requests.length, 1);
  assertScrubbed();
  assert.doesNotMatch(host.textContent, /Synthetic private network detail/);
  assert.equal(usePresentationSession.getState().session, null);
  await settle();
  assert.equal(requests.length, 1, 'A failed login cannot automatically retry');
  responder = () => response(session());
  await retry();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body, { email: 'network-retry@score.zoj.kr' });
  assert.equal(new URL(requests[1].location).hash, '');
  assertScrubbed();
  assert.equal(window.location.pathname, '/presentation/contests/contest-one');
  assert.deepEqual(usePresentationSession.getState().session, session());
});

test('a mismatched contest response cannot become the new display session and leaves operator login intact', async () => {
  const existing = session('existing-contest', 'existing');
  usePresentationSession.getState().setSession(existing);
  responder = () => response(session('different-contest', 'mismatch'));
  await mount(
    links.presentationLoginUrl('contest-one', 'mismatch@score.zoj.kr'),
  );
  assert.equal(requests.length, 1);
  assertScrubbed();
  assert.equal(usePresentationSession.getState().session, null);
  assert.equal(window.sessionStorage.getItem(presentationKey), null);
  assert.equal(window.location.pathname, '/presentation/login');
  assert.ok(host.querySelector('a[href^="/login"]'));
});

test('an expired successful response cannot be stored or navigate to the presentation', async () => {
  responder = () =>
    response({ ...session(), expires_at: '2000-01-01T00:00:00Z' });
  await mount(
    links.presentationLoginUrl('contest-one', 'expired-response@score.zoj.kr'),
  );
  assert.equal(requests.length, 1);
  assert.equal(usePresentationSession.getState().session, null);
  assert.equal(window.sessionStorage.getItem(presentationKey), null);
  assert.equal(window.location.pathname, '/presentation/login');
  assertScrubbed();
  assert.ok(host.querySelector('a[href^="/login"]'));
});

test('rate limiting disables retry until the server cooldown ends without automatically repeating login', async () => {
  const nativeNow = Date.now;
  const nativeInterval = window.setInterval;
  const nativeClear = window.clearInterval;
  let now = nativeNow(),
    tick,
    cleared = false;
  Date.now = () => now;
  window.setInterval = (callback, delay) => {
    assert.equal(delay, 1000);
    tick = callback;
    return 93;
  };
  window.clearInterval = (id) => {
    assert.equal(id, 93);
    cleared = true;
  };
  try {
    responder = () =>
      response(
        {
          code: 'rate_limit_exceeded',
          message: 'sensitive-account@score.zoj.kr',
          details: { retry_after_seconds: 2 },
        },
        429,
      );
    await mount(
      links.presentationLoginUrl('contest-one', 'cooldown@score.zoj.kr'),
    );
    assert.equal(requests.length, 1);
    assertScrubbed();
    let button = host.querySelector('button');
    assert.equal(button.disabled, true);
    assert.match(button.textContent, /2초 후 다시 연결/);
    await retry();
    assert.equal(
      requests.length,
      1,
      'Clicking disabled retry cannot send another login',
    );
    now += 2000;
    await act(() => tick());
    button = host.querySelector('button');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '다시 연결');
    assert.equal(
      requests.length,
      1,
      'Finishing cooldown does not log in automatically',
    );
    responder = () => response(session());
    await retry();
    assert.equal(requests.length, 2);
    assert.equal(
      window.location.pathname,
      '/presentation/contests/contest-one',
    );
    assert.equal(cleared, true);
  } finally {
    Date.now = nativeNow;
    window.setInterval = nativeInterval;
    window.clearInterval = nativeClear;
  }
});

test('a later link wins over an older pending request and both credentials are scrubbed before their APIs', async () => {
  const first = deferred();
  responder = (request) =>
    request.body.email === 'old-link@score.zoj.kr'
      ? first.promise
      : response(session('contest-two', 'newer'));
  await mount(
    links.presentationLoginUrl('contest-one', 'old-link@score.zoj.kr'),
  );
  assert.equal(requests.length, 1);
  await navigate(
    links.presentationLoginUrl('contest-two', 'new-link@score.zoj.kr', [
      'new-division',
    ]),
  );
  assert.equal(requests.length, 2);
  assert.equal(window.location.pathname, '/presentation/contests/contest-two');
  assert.deepEqual(
    usePresentationSession.getState().session,
    session('contest-two', 'newer'),
  );
  await act(() => first.resolve(response(session('contest-one', 'stale'))));
  await settle();
  assert.equal(window.location.pathname, '/presentation/contests/contest-two');
  assert.deepEqual(
    usePresentationSession.getState().session,
    session('contest-two', 'newer'),
  );
  assert.deepEqual(
    new URLSearchParams(window.location.search).getAll('divisionId'),
    ['new-division'],
  );
  assert.ok(requests.every((request) => new URL(request.location).hash === ''));
  assertScrubbed();
});

test('leaving the login route ignores a pending response and cannot redirect or store its token', async () => {
  const waiting = deferred();
  responder = () => waiting.promise;
  await mount(
    links.presentationLoginUrl('contest-one', 'navigate-away@score.zoj.kr'),
  );
  await navigate('/unrelated');
  await act(() => waiting.resolve(response(session())));
  await settle();
  assert.equal(window.location.pathname, '/unrelated');
  assert.equal(usePresentationSession.getState().session, null);
  assert.equal(window.sessionStorage.getItem(presentationKey), null);
  assertScrubbed();
});

test('unmounting the login route ignores a pending response without touching either session', async () => {
  const waiting = deferred();
  responder = () => waiting.promise;
  await mount(
    links.presentationLoginUrl('contest-one', 'unmounted@score.zoj.kr'),
  );
  await act(() => root.unmount());
  root = null;
  await act(() => waiting.resolve(response(session())));
  await settle();
  assert.equal(usePresentationSession.getState().session, null);
  assert.equal(window.sessionStorage.getItem(presentationKey), null);
  assertScrubbed();
});
