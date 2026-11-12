const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const loaded = new Module(filename, module);
  loaded.require = (id) => mocks[id] || require(id);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const errors = load('shared/api/errors.ts');

test('team withdrawal and restoration use the dedicated endpoint without changing manual access fields', async () => {
  const calls = [];
  const { updateParticipantTeamWithdrawal } = load(
    'domains/teamParticipation/api.ts',
    {
      '@/domains/identityAccess/sessionStorage': {},
      '@/shared/api/errors': errors,
      '@/shared/api/client': {
        apiRequest: async (url, token, init) => {
          const body = JSON.parse(init.body);
          calls.push({ url, token, method: init.method, body });
          return {
            participant_team_id: 't',
            withdrawn: body.withdrawn,
            access_blocked: true,
          };
        },
      },
    },
  );
  const team = await updateParticipantTeamWithdrawal(
    'c',
    't',
    'operator-token',
    {
      withdrawn: true,
      reason: '현장 기권',
    },
  );
  assert.equal(team.withdrawn, true);
  assert.equal(team.access_blocked, true);
  const restored = await updateParticipantTeamWithdrawal(
    'c',
    't',
    'operator-token',
    {
      withdrawn: false,
    },
  );
  assert.equal(restored.withdrawn, false);
  assert.equal(restored.access_blocked, true);
  assert.deepEqual(calls, [
    {
      url: '/operator/contests/c/participants/t/withdrawal',
      token: 'operator-token',
      method: 'PATCH',
      body: { withdrawn: true, reason: '현장 기권' },
    },
    {
      url: '/operator/contests/c/participants/t/withdrawal',
      token: 'operator-token',
      method: 'PATCH',
      body: { withdrawn: false },
    },
  ]);
});

test('withdrawal errors explain the actual access restriction while manual blocks retain their existing wording', () => {
  const withdrawn = new errors.ApiClientError(
    403,
    'participant_access_blocked',
    'blocked',
    undefined,
    {
      scope: 'team',
      withdrawn: true,
      reason: '현장 기권',
    },
  );
  assert.match(
    errors.formatApiError(withdrawn, '대회 열기 실패'),
    /소속 팀의 기권으로 이 대회 접근이 차단/,
  );
  assert.match(
    errors.formatApiError(withdrawn, '대회 열기 실패'),
    /기권 사유: 현장 기권/,
  );
  assert.equal(errors.isSessionAuthError(withdrawn), false);
  const blocked = new errors.ApiClientError(
    403,
    'participant_access_blocked',
    'blocked',
    undefined,
    { scope: 'team' },
  );
  assert.match(
    errors.formatApiError(blocked, '대회 열기 실패'),
    /운영진이 소속 팀의 대회 접근을 차단/,
  );
  assert.doesNotMatch(errors.formatApiError(blocked, '대회 열기 실패'), /기권/);
});
