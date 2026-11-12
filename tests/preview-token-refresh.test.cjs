const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Blob } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
let general, participant, calls, expire;
const originalFetch = global.fetch;
const storage = {
  loadStoredGeneralSession: () => general,
  loadStoredParticipantSession: () => participant,
  saveGeneralSession: (next) => {
    general = next;
  },
  saveParticipantSession: (next) => {
    participant = next;
  },
  emitSessionSync: () => {},
  mapGeneralSession: (next) => next,
};
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id === '@/domains/identityAccess/sessionStorage'
      ? storage
      : id.startsWith('@/')
        ? source(id.slice(2) + '.ts')
        : native(id);
  cache.set(filename, loaded);
  const code = fs
    .readFileSync(filename, 'utf8')
    .replace('import.meta.env.VITE_API_BASE_URL', 'undefined');
  loaded._compile(
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { apiRequest, apiPageRequest, apiBlobRequest } = source(
  'shared/api/client.ts',
);
const { PARTICIPANT_ACCESS_BLOCKED_EVENT } = source(
  'shared/api/participantAccess.ts',
);
const { formatUserApiError, isSessionAuthError } = source(
  'shared/api/errors.ts',
);
beforeEach(() => {
  general = {
    accessToken: 'general-current',
    refreshToken: 'general-refresh',
    account: { email: 'preview@example.test' },
    operatorSession: {
      accessToken: 'general-current',
      refreshToken: 'general-refresh',
      staff: {},
    },
  };
  participant = {
    accessToken: 'general-expired',
    contestId: 'contest',
    isPreview: true,
    member: { email: 'preview@example.test' },
  };
  calls = [];
  expire = false;
  global.fetch = async (url, init) => {
    calls.push({ url, token: init.headers.authorization, method: init.method });
    if (url === '/api/auth/general/refresh') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            ...general,
            accessToken: 'general-refreshed',
            operatorSession: {
              ...general.operatorSession,
              accessToken: 'general-refreshed',
            },
          },
        }),
      };
    }
    if (expire && init.headers.authorization === 'Bearer general-current')
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'authentication_required' } }),
      };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [], page: { limit: 20, total_count: 0 } }),
    };
  };
});
after(() => {
  global.fetch = originalFetch;
});

test('preview requests always prefer the latest general token over an older stored preview token', async () => {
  await apiRequest('/contests/contest/problems', 'general-current');
  await apiPageRequest('/contests/contest/submissions', 'general-expired');
  await apiRequest('/contests/contest/boards');
  assert.deepEqual(
    calls.map((call) => call.token),
    Array(3).fill('Bearer general-current'),
  );
});

test('preview expiry uses general refresh only and persists the refreshed token into the preview session', async () => {
  expire = true;
  participant.accessToken = general.accessToken;
  await apiRequest('/contests/contest/problems', 'general-current');
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      '/api/contests/contest/problems',
      '/api/auth/general/refresh',
      '/api/contests/contest/problems',
    ],
  );
  assert.equal(calls.at(-1).token, 'Bearer general-refreshed');
  assert.equal(general.accessToken, 'general-refreshed');
  assert.equal(participant.accessToken, 'general-refreshed');
  assert.equal(participant.isPreview, true);
});

test('preview session creation refreshes a general token before any staff or real participant session attempt', async () => {
  expire = true;
  participant = null;
  await apiRequest(
    '/auth/general/contests/contest/participant-preview-session',
    'general-current',
    { method: 'POST', body: '{}' },
  );
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      '/api/auth/general/contests/contest/participant-preview-session',
      '/api/auth/general/refresh',
      '/api/auth/general/contests/contest/participant-preview-session',
    ],
  );
});

test('ordinary participant sessions keep their participant token', async () => {
  participant.isPreview = false;
  participant.accessToken = 'real-participant';
  await apiRequest('/contests/contest/problems', 'general-current');
  assert.equal(calls[0].token, 'Bearer real-participant');
});

test('protected ZIP download refreshes the account token and preserves binary bytes', async () => {
  participant = null;
  expire = true;
  const previous = global.fetch;
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 13, 10]);
  global.fetch = async (url, init) => {
    const result = await previous(url, init);
    if (url === '/api/auth/general/me')
      return { ...result, json: async () => ({ data: general }) };
    if (url.endsWith('/archive') && result.ok)
      return {
        ...result,
        blob: async () => new Blob([bytes], { type: 'application/zip' }),
      };
    return result;
  };
  const result = await apiBlobRequest(
    '/operator/contests/contest/problems/problem/archive',
    'general-current',
  );
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(calls.at(-1).token, 'Bearer general-refreshed');
  assert.equal(calls.filter((call) => call.url.endsWith('/archive')).length, 2);
});

test('ZIP download surfaces access denial without creating a downloadable blob', async () => {
  participant = null;
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: { code: 'scope_denied', message: 'Forbidden' },
    }),
  });
  await assert.rejects(
    apiBlobRequest(
      '/operator/contests/contest/problems/problem/archive',
      'general-current',
    ),
    (error) => error.status === 403,
  );
});

for (const [label, request] of [
  ['JSON', apiRequest],
  ['page', apiPageRequest],
  ['binary', apiBlobRequest],
]) {
  test(`${label} contest access block reports the contest while preserving all login tokens`, async () => {
    const previousWindow = global.window;
    const previousCustomEvent = global.CustomEvent;
    global.window = new global.EventTarget();
    global.CustomEvent = class extends Event {
      constructor(type, init) {
        super(type);
        this.detail = init.detail;
      }
    };
    try {
      participant.isPreview = false;
      participant.accessToken = 'real-participant';
      const originalParticipant = participant;
      const originalGeneral = general;
      const reports = [];
      window.addEventListener(PARTICIPANT_ACCESS_BLOCKED_EVENT, (event) =>
        reports.push(event.detail),
      );
      global.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'participant_access_blocked',
            message: 'blocked',
            details: { scope: 'team', reason: '운영진 확인 중' },
          },
        }),
      });
      await assert.rejects(
        request('/contests/contest/problems', 'real-participant'),
        (error) => {
          assert.equal(error.code, 'participant_access_blocked');
          assert.equal(isSessionAuthError(error), false);
          assert.match(
            formatUserApiError(error, '요청 실패'),
            /소속 팀의 대회 접근.*운영진 확인 중/,
          );
          return true;
        },
      );
      assert.equal(reports.length, 1);
      assert.equal(reports[0].contestId, 'contest');
      assert.equal(participant, originalParticipant);
      assert.equal(general, originalGeneral);
    } finally {
      global.window = previousWindow;
      global.CustomEvent = previousCustomEvent;
    }
  });
}

test('an expired participant token followed by a blocked session issuance is not an account logout', async () => {
  participant.isPreview = false;
  participant.accessToken = 'real-participant';
  const originalParticipant = participant;
  const originalGeneral = general;
  storage.expireStoredAccountSession = () =>
    assert.fail('A contest block is not an account revocation');
  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: false,
      status: url.endsWith('/participant-session') ? 403 : 401,
      json: async () => ({
        error: {
          code: url.endsWith('/participant-session')
            ? 'participant_access_blocked'
            : 'invalid_token',
          message: 'blocked',
          details: { scope: 'member', reason: '확인' },
        },
      }),
    };
  };
  await assert.rejects(
    apiRequest('/contests/contest/problems', 'real-participant'),
    { code: 'participant_access_blocked' },
  );
  assert.deepEqual(calls, [
    '/api/contests/contest/problems',
    '/api/auth/general/contests/contest/participant-session',
  ]);
  assert.equal(participant, originalParticipant);
  assert.equal(general, originalGeneral);
});
