const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
let state, handler, calls, clears;
const query = { cancelQueries: async () => {}, clear: () => clears++ };
const hook = (select) => select(state);
hook.getState = () => state;
const mocks = {
  '@tanstack/react-query': { useQueryClient: () => query },
  '@/shared/api/client': {
    isPasskeyCeremonyActive: () => false,
    apiRequest: async (...args) => {
      calls.push(args);
      return handler(...args);
    },
  },
  '@/shared/api/errors': { isSessionAuthError: (e) => e.status === 401 },
  './sessionStorage': { mapGeneralSession: (v) => v },
  './sessionStore': { useSessionStore: hook },
};
const file = path.resolve(
  __dirname,
  '../src/domains/identityAccess/useSharedLogin.ts',
);
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
const native = loaded.require.bind(loaded);
loaded.require = (id) => mocks[id] || native(id);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);
function View() {
  loaded.exports.useSharedLogin();
  return null;
}
const session = (email, token) => ({
  account: { email },
  accessToken: token,
  refreshToken: 'refresh-' + token,
});
function reset(current) {
  calls = [];
  clears = 0;
  state = {
    generalSession: current,
    setGeneralSession: (v) => {
      state.generalSession = v;
    },
    clearSessions: () => {
      state.generalSession = null;
    },
  };
}
async function mount() {
  const div = document.createElement('div');
  document.body.append(div);
  const root = createRoot(div);
  await act(async () => root.render(React.createElement(View)));
  return async () => {
    await act(async () => root.unmount());
    div.remove();
  };
}
test('Restore the common login and clear another account cache', async () => {
  reset(session('old@example.com', 'old'));
  handler = async () => session('new@example.com', 'new');
  const close = await mount();
  assert.equal(state.generalSession.account.email, 'new@example.com');
  assert.equal(clears, 1);
  assert.equal(calls[0][0], '/auth/general/sso');
  assert.equal(JSON.parse(calls[0][2].body).refresh_token, 'refresh-old');
  await close();
});
test('A revoked common session clears local credentials, an outage preserves them', async () => {
  for (const status of [401, 503]) {
    reset(session('user@example.com', 'old'));
    handler = async () => {
      throw { status };
    };
    const close = await mount();
    assert.equal(state.generalSession === null, status === 401);
    assert.equal(clears, status === 401 ? 1 : 0);
    await close();
  }
});
test('A late restore cannot overwrite a manually changed login', async () => {
  reset(null);
  let resolve;
  handler = () =>
    new Promise((r) => {
      resolve = r;
    });
  const close = await mount();
  state.generalSession = session('manual@example.com', 'manual');
  await act(async () => resolve(session('old@example.com', 'old')));
  assert.equal(state.generalSession.accessToken, 'manual');
  assert.equal(clears, 0);
  await close();
});
after(() => dom.window.close());
