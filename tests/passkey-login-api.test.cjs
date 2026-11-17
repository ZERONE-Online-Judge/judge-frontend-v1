const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

test('session transfer uses the verified proof without starting a second WebAuthn ceremony', async () => {
  const calls = [];
  const saved = [];
  let activeCeremonies = 0;
  const conflict = Object.assign(new Error('session_conflict'), {
    status: 409,
    details: { transfer_token: 'verified-proof' },
  });
  const mocks = {
    '@simplewebauthn/browser': {
      startAuthentication: async () => {
        assert.equal(activeCeremonies, 1);
        calls.push('ceremony');
        return { id: 'signed-credential' };
      },
    },
    '@/shared/api/client': {
      withPasskeyCeremony: async (action) => {
        activeCeremonies++;
        try {
          return await action();
        } finally {
          activeCeremonies--;
        }
      },
      apiRequest: async (url, token, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, body });
        assert.equal(token, undefined);
        assert.equal(activeCeremonies, url.endsWith('/transfer') ? 0 : 1);
        if (url.endsWith('/options'))
          return { challenge_id: 'challenge', options: {} };
        if (url.endsWith('/verify')) throw conflict;
        return { access_token: 'new-session' };
      },
    },
    './sessionStorage': {
      mapGeneralSession: (result) => ({ accessToken: result.access_token }),
      saveGeneralSession: (session) => saved.push(session),
    },
  };
  const filename = path.resolve(
    __dirname,
    '../src/domains/identityAccess/passkeys.ts',
  );
  const loaded = new Module(filename, module);
  loaded.require = (id) => mocks[id] || require(id);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    filename,
  );
  const { loginPasskey, confirmPasskeyLoginTransfer } = loaded.exports;
  await assert.rejects(
    loginPasskey('user@example.com'),
    (error) => error === conflict,
  );
  assert.equal(activeCeremonies, 0);
  assert.deepEqual(saved, []);
  const result = await confirmPasskeyLoginTransfer(
    'user@example.com',
    conflict.details.transfer_token,
  );
  assert.deepEqual(result, { accessToken: 'new-session' });
  assert.deepEqual(saved, [result]);
  assert.deepEqual(calls, [
    {
      url: '/auth/general/passkeys/login/options',
      body: { email: 'user@example.com' },
    },
    'ceremony',
    {
      url: '/auth/general/passkeys/login/verify',
      body: {
        challenge_id: 'challenge',
        credential: { id: 'signed-credential' },
      },
    },
    {
      url: '/auth/general/passkeys/login/transfer',
      body: { email: 'user@example.com', proof_token: 'verified-proof' },
    },
  ]);
});
