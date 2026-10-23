const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { Blob } = require('node:buffer');
const { setImmediate } = require('node:timers');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body><main></main></body>', {
  url: 'https://zoj.kr/',
  pretendToBeVisual: true,
});
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
let registrationPrompt;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === '@simplewebauthn/browser')
      return { startRegistration: () => registrationPrompt.promise };
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const base = id.startsWith('@/')
      ? path.resolve(__dirname, '../src', id.slice(2))
      : path.resolve(path.dirname(filename), id);
    const file = ['.ts', '.tsx'].map((ext) => base + ext).find(fs.existsSync);
    return file
      ? source(path.relative(path.resolve(__dirname, '../src'), file))
      : native(id);
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
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    filename,
  );
  return loaded.exports;
}
const storage = source('domains/identityAccess/sessionStorage.ts');
const { useSessionStore } = source('domains/identityAccess/sessionStore.ts');
const { useSharedLogin } = source('domains/identityAccess/useSharedLogin.ts');
const {
  apiRequest,
  apiPageRequest,
  apiBlobRequest,
  refreshActiveAccessTokens,
  isPasskeyCeremonyActive,
} = source('shared/api/client.ts');
const { registerPasskey } = source('domains/identityAccess/passkeys.ts');
const originalFetch = global.fetch;
const general = {
  accessToken: 'old',
  refreshToken: 'refresh',
  account: { email: 'user@example.test', display_name: 'User' },
  participantContests: [],
  operatorContests: [],
  operatorSession: null,
};
const profile = (token) => ({
  access_token: token,
  refresh_token: 'refresh',
  account: general.account,
});
const response = (status, data) => ({
  ok: status < 400,
  status,
  json: async () =>
    status < 400 ? { data } : { error: { code: 'authentication_required' } },
  blob: async () => new Blob(['data']),
});
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let root, client, expired;
function View() {
  useSharedLogin();
  return null;
}
async function mount() {
  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(View),
      ),
    ),
  );
}
async function flush() {
  await act(async () => {
    await new Promise(setImmediate);
  });
}
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  storage.saveGeneralSession(general);
  useSessionStore.getState().syncSessionsFromStorage();
  expired = 0;
  window.addEventListener(storage.SESSION_EXPIRED_EVENT, onExpired);
  root = createRoot(document.querySelector('main'));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
function onExpired() {
  expired++;
}
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  window.removeEventListener(storage.SESSION_EXPIRED_EVENT, onExpired);
});
after(() => {
  global.fetch = originalFetch;
  dom.window.close();
});

test('arrival SSO and an expired API request share one token rotation', async () => {
  const refresh = deferred();
  let rotations = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith('/refresh') || url.endsWith('/sso')) {
      rotations++;
      return refresh.promise;
    }
    return init.headers.authorization === 'Bearer renewed'
      ? response(200, profile('renewed'))
      : response(401);
  };
  const request = apiRequest('/auth/general/me', 'old').catch((e) => e);
  await flush();
  await mount();
  await act(async () => {
    refresh.resolve(response(200, profile('renewed')));
    await request;
  });
  assert.equal(rotations, 1);
  assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'renewed');
  assert.equal(expired, 0);
});

test('overlapping arrival and refresh responses cannot falsely expire a valid common login', async () => {
  const first = deferred();
  const second = deferred();
  let rotations = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith('/refresh') || url.endsWith('/sso')) {
      return ++rotations === 1 ? first.promise : second.promise;
    }
    // The server keeps only the access token from its latest rotation.
    const valid = rotations > 1 ? 'renewed' : 'arrival';
    return init.headers.authorization === `Bearer ${valid}`
      ? response(200, profile(valid))
      : response(401);
  };
  await mount();
  const request = apiRequest('/auth/general/me', 'old').catch((e) => e);
  await flush();
  // SSO arrives while an older request is still waiting for its refresh.
  await act(async () => {
    first.resolve(response(200, profile('arrival')));
  });
  const nextRequest = apiRequest(
    '/auth/general/me',
    storage.loadStoredGeneralSession()?.accessToken,
  ).catch((e) => e);
  await flush();
  await act(async () => {
    second.resolve(response(200, profile('renewed')));
    await request;
    await nextRequest;
  });
  assert.equal(expired, 0);
  assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'arrival');
  assert.equal(rotations, 1);
});

for (const [kind, send] of [
  ['JSON', () => apiRequest('/auth/general/me', 'old')],
  ['page', () => apiPageRequest('/auth/general/items', 'old')],
  ['blob', () => apiBlobRequest('/auth/general/export', 'old')],
]) {
  test(`${kind} preserves a refreshable login when refresh returns 503`, async () => {
    global.fetch = async (url) =>
      response(url.endsWith('/refresh') ? 503 : 401);
    await assert.rejects(send(), (e) => e.status === 503);
    assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'old');
    assert.equal(expired, 0);
  });
}

test('periodic refresh also joins an arrival SSO request', async () => {
  const pending = deferred();
  let rotations = 0;
  global.fetch = async () => {
    rotations++;
    return pending.promise;
  };
  await mount();
  const refresh = refreshActiveAccessTokens();
  await act(async () => {
    pending.resolve(response(200, profile('renewed')));
    await refresh;
  });
  assert.equal(rotations, 1);
  assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'renewed');
  assert.equal(expired, 0);
});

test('a shared response that switches accounts still clears the previous account cache', async () => {
  const pending = deferred();
  global.fetch = async (url, init) => {
    if (url.endsWith('/refresh') || url.endsWith('/sso'))
      return pending.promise;
    return init.headers.authorization === 'Bearer new-account'
      ? response(200, {})
      : response(401);
  };
  client.setQueryData(['private-data'], { owner: general.account.email });
  storage.saveParticipantSession({
    accessToken: 'participant',
    member: { email: general.account.email },
  });
  const request = apiRequest('/auth/general/me', 'old').catch((e) => e);
  await flush();
  await mount();
  await act(async () => {
    pending.resolve(
      response(200, {
        ...profile('new-account'),
        account: { email: 'other@example.test', display_name: 'Other' },
      }),
    );
    await request;
  });
  assert.equal(
    storage.loadStoredGeneralSession()?.account.email,
    'other@example.test',
  );
  assert.equal(storage.loadStoredParticipantSession(), null);
  assert.equal(client.getQueryData(['private-data']), undefined);
  assert.equal(expired, 0);
});

test('cookie-backed sessions without a stored refresh token share restoration requests', async () => {
  storage.saveGeneralSession({ ...general, refreshToken: '' });
  useSessionStore.getState().syncSessionsFromStorage();
  const pending = deferred();
  let rotations = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith('/refresh') || url.endsWith('/sso')) {
      rotations++;
      return pending.promise;
    }
    return init.headers.authorization === 'Bearer renewed'
      ? response(200, {})
      : response(401);
  };
  await mount();
  const request = apiRequest('/auth/general/me', 'old');
  await flush();
  await act(async () => {
    pending.resolve(response(200, profile('renewed')));
    await request;
  });
  assert.equal(rotations, 1);
  assert.equal(expired, 0);
  assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'renewed');
});

test('a failed restore cannot clear a newer login while cache cancellation is pending', async () => {
  const cancelled = deferred();
  client.cancelQueries = () => cancelled.promise;
  global.fetch = async () => response(401);
  await mount();
  await act(async () => {
    useSessionStore
      .getState()
      .setGeneralSession({ ...general, accessToken: 'new-login' });
    cancelled.resolve();
    await new Promise(setImmediate);
  });
  assert.equal(storage.loadStoredGeneralSession()?.accessToken, 'new-login');
});

test('returning from passkey registration skips focus and timer rotations until verification finishes', async () => {
  registrationPrompt = deferred();
  const verification = deferred();
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, token: init.headers.authorization });
    if (url.endsWith('/sso') || url.endsWith('/refresh'))
      return response(200, profile('old'));
    if (url.endsWith('/register/options'))
      return response(200, { challenge_id: 'challenge', options: {} });
    if (url.endsWith('/register/verify')) return verification.promise;
    throw new Error('Unexpected request ' + url);
  };
  await mount();
  calls.length = 0;
  const pending = registerPasskey('old', 'Device');
  await flush();
  assert.equal(isPasskeyCeremonyActive(), true);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(await refreshActiveAccessTokens(), false);
  });
  registrationPrompt.resolve({ id: 'signed-registration' });
  await flush();
  assert.equal(isPasskeyCeremonyActive(), true);
  await act(async () => window.dispatchEvent(new Event('focus')));
  assert.equal(
    calls.filter((x) => x.url.endsWith('/sso') || x.url.endsWith('/refresh'))
      .length,
    0,
  );
  verification.resolve(response(200, { registered: true }));
  await pending;
  assert.equal(isPasskeyCeremonyActive(), false);
  assert.equal(
    calls.filter((x) => x.url.endsWith('/register/verify')).length,
    1,
  );
  assert.equal(calls.at(-1).token, 'Bearer old');
  await act(async () => window.dispatchEvent(new Event('focus')));
  await flush();
  assert.equal(calls.filter((x) => x.url.endsWith('/sso')).length, 1);
});

test('cancelling the device prompt releases the refresh guard without submitting registration', async () => {
  registrationPrompt = deferred();
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith('/sso')) return response(200, profile('old'));
    if (url.endsWith('/register/options'))
      return response(200, { challenge_id: 'challenge', options: {} });
    throw new Error('Unexpected request ' + url);
  };
  await mount();
  const pending = registerPasskey('old', 'Device');
  const rejected = assert.rejects(pending, { name: 'NotAllowedError' });
  await flush();
  assert.equal(isPasskeyCeremonyActive(), true);
  registrationPrompt.resolve(
    Promise.reject(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }),
    ),
  );
  await rejected;
  assert.equal(isPasskeyCeremonyActive(), false);
  assert.equal(
    calls.some((x) => x.endsWith('/register/verify')),
    false,
  );
  await act(async () => window.dispatchEvent(new Event('focus')));
  await flush();
  assert.equal(calls.filter((x) => x.endsWith('/sso')).length, 2);
});
