/* global Response, setImmediate */
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('', { url: 'https://judge.test/contests/contest' });
Object.assign(global, {
  window: dom.window,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
});
const originalFetch = global.fetch;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.startsWith('@/') ? source(id.slice(2) + '.ts') : native(id);
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
        },
      },
    ).outputText,
    filename,
  );
  return loaded.exports;
}
let api, storage, requests, options;
const profile = (accessToken = 'general-valid') => ({
  access_token: accessToken,
  refresh_token: 'general-refresh',
  account: { email: 'waiting@example.invalid', display_name: 'Waiting' },
  participant_contests: [],
  operator_contests: [],
  operator_session: null,
});
const child = (accessToken = 'child-expired', division = 'division') => ({
  accessToken,
  contestId: 'contest',
  team: { participant_team_id: 'team', team_name: 'Waiting team' },
  member: { name: 'Waiting', email: profile().account.email },
  division: { division_id: division, name: '일반부' },
});
const json = (status, value) =>
  new Response(
    JSON.stringify(status < 400 ? { data: value } : { error: value }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );

beforeEach(() => {
  cache.clear();
  storage = source('domains/identityAccess/sessionStorage.ts');
  window.localStorage.clear();
  window.sessionStorage.clear();
  storage.saveGeneralSession(storage.mapGeneralSession(profile()));
  storage.saveParticipantSession(child());
  // Reload the actual API module with only persisted credentials, like a hard refresh.
  api = source('shared/api/client.ts');
  requests = [];
  options = {
    childExpired: true,
    parentExpired: false,
    missing: false,
    division: 'division',
  };
  global.fetch = async (url, init) => {
    const token = init.headers.authorization?.replace('Bearer ', '');
    requests.push({ url, token, method: init.method ?? 'GET' });
    if (url === '/api/auth/general/refresh')
      return json(200, profile('general-refreshed'));
    if (url === '/api/auth/general/contests/contest/participant-session') {
      if (token?.startsWith('child-'))
        return json(403, { code: 'scope_denied' });
      if (options.parentExpired && token !== 'general-refreshed')
        return json(401, { code: 'invalid_token' });
      const next = child('child-renewed', options.division);
      return json(200, {
        access_token: next.accessToken,
        team: next.team,
        member: next.member,
        division: next.division,
      });
    }
    if (url === '/api/contests/contest/participant-session/me') {
      if (options.checkUnavailable) throw new Error('Offline');
      if (options.checkStatus)
        return json(options.checkStatus, { code: 'temporarily_unavailable' });
      return options.childExpired && token === 'child-expired'
        ? json(401, {
            code: 'invalid_token',
            message: 'Participant session expired',
          })
        : json(200, child(token));
    }
    if (options.forbidden) return json(403, { code: 'scope_denied' });
    if (
      options.enforceDivision &&
      token !== 'child-expired' &&
      url.includes('/divisions/division/')
    )
      return json(403, { code: 'scope_denied' });
    if ((options.childExpired && token === 'child-expired') || options.missing)
      return json(404, { code: 'not_found', message: 'Not found' });
    if (url.endsWith('/archive'))
      return new Response(new Uint8Array([80, 75, 3, 4]));
    return json(200, [
      { problem_id: 'problem', title: 'Started contest problem' },
    ]);
  };
});

after(() => {
  global.fetch = originalFetch;
  dom.window.close();
});

for (const [label, method, resource] of [
  ['JSON', 'apiRequest', 'problems'],
  ['page', 'apiPageRequest', 'submissions'],
  ['binary', 'apiBlobRequest', 'archive'],
]) {
  test(`${label} recovers a persisted prestart session that expired behind a contest 404`, async () => {
    const url = `/contests/contest/divisions/division/${resource}`;
    const result = await api[method](url, 'child-expired');
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `/api${url}`,
        '/api/contests/contest/participant-session/me',
        '/api/auth/general/contests/contest/participant-session',
        `/api${url}`,
      ],
    );
    assert.equal(requests[2].token, 'general-valid');
    assert.equal(requests[3].token, 'child-renewed');
    assert.equal(
      storage.loadStoredParticipantSession().accessToken,
      'child-renewed',
    );
    assert.equal(
      storage.loadStoredGeneralSession().accessToken,
      'general-valid',
    );
    if (method === 'apiBlobRequest')
      assert.deepEqual(
        [...new Uint8Array(await result.arrayBuffer())],
        [80, 75, 3, 4],
      );
    else
      assert.equal(
        (method === 'apiPageRequest' ? result.data : result)[0].problem_id,
        'problem',
      );
  });
}

test('concurrent start-time problem, board and score requests share one session check and renewal', async () => {
  await Promise.all([
    api.apiRequest(
      '/contests/contest/divisions/division/problems',
      'child-expired',
    ),
    api.apiRequest(
      '/contests/contest/divisions/division/scoreboard',
      'child-expired',
    ),
    api.apiPageRequest('/contests/contest/boards', 'child-expired'),
    api.apiBlobRequest('/contests/contest/archive', 'child-expired'),
  ]);
  assert.equal(
    requests.filter(({ url }) => url.endsWith('/participant-session/me'))
      .length,
    1,
  );
  assert.equal(
    requests.filter(({ url }) => url.startsWith('/api/auth/general/')).length,
    1,
  );
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-renewed',
  );
});

test('expired parent access is refreshed without logging out or losing the participant session', async () => {
  options.parentExpired = true;
  await api.apiRequest('/public/contests/contest', 'child-expired');
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      '/api/public/contests/contest',
      '/api/contests/contest/participant-session/me',
      '/api/auth/general/contests/contest/participant-session',
      '/api/auth/general/refresh',
      '/api/auth/general/contests/contest/participant-session',
      '/api/public/contests/contest',
    ],
  );
  assert.equal(
    storage.loadStoredGeneralSession().accessToken,
    'general-refreshed',
  );
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-renewed',
  );
});

test('explicit account credential issuance is never replaced with the saved child token', async () => {
  const { createParticipantSessionFromGeneralToken } = source(
    'domains/teamParticipation/api.ts',
  );
  await createParticipantSessionFromGeneralToken('contest', 'general-valid');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].token, 'general-valid');
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-renewed',
  );
});

test('a valid session preserves a real 404 and does not renew or sign out', async () => {
  options.childExpired = false;
  options.missing = true;
  await assert.rejects(
    api.apiRequest('/contests/contest/problems/missing', 'child-expired'),
    { status: 404 },
  );
  assert.equal(requests.length, 2);
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-expired',
  );
  assert.equal(storage.loadStoredGeneralSession().accessToken, 'general-valid');
});

test('a forbidden request does not probe, renew or bypass its permission denial', async () => {
  options.forbidden = true;
  await assert.rejects(
    api.apiRequest('/contests/contest/problems/private', 'child-expired'),
    { status: 403 },
  );
  assert.equal(requests.length, 1);
  assert.equal(storage.loadStoredGeneralSession().accessToken, 'general-valid');
});

test('a failed session probe preserves credentials and the original resource error', async () => {
  options.checkUnavailable = true;
  await assert.rejects(
    api.apiRequest('/contests/contest/problems', 'child-expired'),
    { status: 404 },
  );
  assert.equal(requests.length, 2);
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-expired',
  );
  assert.equal(storage.loadStoredGeneralSession().accessToken, 'general-valid');
});

test('a temporary session-check failure preserves the original 404 and both credentials', async () => {
  options.checkStatus = 503;
  await assert.rejects(
    api.apiRequest('/contests/contest/problems', 'child-expired'),
    { status: 404 },
  );
  assert.equal(requests.length, 2);
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-expired',
  );
  assert.equal(storage.loadStoredGeneralSession().accessToken, 'general-valid');
});

test('a newer child stored while checking expiry is used without overwriting it', async () => {
  const fetch = global.fetch;
  let finishCheck;
  global.fetch = async (url, init) =>
    url.endsWith('/participant-session/me')
      ? new Promise((resolve) => {
          finishCheck = resolve;
        })
      : fetch(url, init);
  const pending = api.apiRequest('/contests/contest/problems', 'child-expired');
  for (let turn = 0; turn < 10 && !finishCheck; turn++)
    await new Promise(setImmediate);
  assert.ok(finishCheck);
  storage.saveParticipantSession(child('child-newer', 'current-division'));
  finishCheck(json(401, { code: 'invalid_token' }));
  await pending;
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-newer',
  );
  assert.equal(
    storage.loadStoredParticipantSession().division.division_id,
    'current-division',
  );
  assert.equal(requests.at(-1).token, 'child-newer');
  assert.equal(
    requests.some(({ url }) => url.includes('/auth/general/')),
    false,
  );
});

test('an expired participant-only login reaches normal login expiry instead of staying stuck on 404', async () => {
  storage.saveGeneralSession(null);
  await assert.rejects(
    api.apiRequest('/contests/contest/problems', 'child-expired'),
    { status: 401 },
  );
  assert.equal(requests.length, 2);
  assert.equal(storage.loadStoredParticipantSession(), null);
  assert.equal(storage.loadStoredGeneralSession(), null);
});

test('a genuinely missing resource after renewal stops after one retry', async () => {
  options.missing = true;
  await assert.rejects(
    api.apiRequest('/contests/contest/problems/missing', 'child-expired'),
    { status: 404 },
  );
  assert.equal(requests.length, 4);
  assert.equal(
    storage.loadStoredParticipantSession().accessToken,
    'child-renewed',
  );
  assert.equal(storage.loadStoredGeneralSession().accessToken, 'general-valid');
});

test('renewal replaces division metadata so the following query uses the current team scope', async () => {
  options.division = 'current-division';
  options.enforceDivision = true;
  await assert.rejects(
    api.apiRequest(
      '/contests/contest/divisions/division/problems',
      'child-expired',
    ),
    { status: 403 },
  );
  const renewed = storage.loadStoredParticipantSession();
  assert.equal(renewed.division.division_id, 'current-division');
  await api.apiRequest(
    `/contests/contest/divisions/${renewed.division.division_id}/problems`,
    renewed.accessToken,
  );
  assert.equal(
    requests.at(-1).url,
    '/api/contests/contest/divisions/current-division/problems',
  );
  assert.equal(requests.at(-1).token, 'child-renewed');
});

for (const [label, childSession, route] of [
  ['preview', { ...child(), isPreview: true }, '/contests/contest/problems'],
  ['other contest', child(), '/contests/other/problems'],
  ['operator', child(), '/operator/contests/contest/problems'],
]) {
  test(`${label} 404 does not use the participant expiry recovery path`, async () => {
    options.missing = true;
    storage.saveParticipantSession(childSession);
    await assert.rejects(api.apiRequest(route, 'child-expired'), {
      status: 404,
    });
    assert.equal(requests.length, 1);
  });
}
