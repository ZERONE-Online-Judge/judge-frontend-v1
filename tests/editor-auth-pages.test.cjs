const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr/editor/account',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client');
let calls, moves, saved, cleared, failure, section;
const session = {
  accessToken: 'access-only-in-memory',
  account: { email: 'current@example.test' },
};
const mocks = {
  'react-router-dom': {
    useLocation: () => ({
      pathname: '/editor/account',
      search: '?section=' + section + '&next=%2Fproblems%2Fabc%2Ffiles',
    }),
    useSearchParams: () => [
      new URLSearchParams({ section, next: '/problems/abc/files' }),
    ],
    useNavigate: () => navigate,
  },
  '@/shared/api/client': {
    apiRequest: async (...args) => {
      calls.push(args);
      if (failure) throw { status: failure };
      return session;
    },
  },
  '@/shared/api/errors': { isSessionAuthError: (e) => e.status === 401 },
  '@/domains/identityAccess/sessionStorage': { mapGeneralSession: (s) => s },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: {
      getState: () => ({
        setGeneralSession: (s) => (saved = s),
        clearSessions: () => cleared++,
      }),
    },
  },
  '@/components/auth/PasskeyDialog': {
    default: (p) =>
      React.createElement(
        'button',
        { onClick: p.onClose },
        '패스키 관리 ' + p.email,
      ),
  },
  '@/components/auth/AccountPasswordDialog': {
    default: (p) =>
      React.createElement(
        'button',
        { onClick: () => p.onDone(p.email) },
        '비밀번호 관리 ' + p.email,
      ),
  },
};
function navigate(...args) {
  moves.push(args);
}
for (const mock of Object.values(mocks))
  if ('default' in mock) mock.__esModule = true;
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const native = m.require.bind(m);
  m.require = (id) =>
    mocks[id] || (id.startsWith('@/') ? load(id.slice(2) + '.ts') : native(id));
  cache.set(file, m);
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const { safeEditorPath, editorReturnUrl } = load(
  'shared/lib/editorAuthRedirect.ts',
);
const Page = load('pages/auth/EditorAccountPage.tsx').default;
after(() => dom.window.close());
test('Editor return allowlist keeps project context and rejects open redirects and login loops', () => {
  const route = '/problems/abc/files?file=main.cpp#source';
  assert.equal(safeEditorPath(route), route);
  assert.equal(editorReturnUrl(route), 'https://editor.zoj.kr' + route);
  for (const value of [
    null,
    '',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/%5cevil.test',
    '/problems/../../login',
    '/login',
    '/api/auth/redirect',
    '/problems/\nfile',
    '/bad%ZZ',
  ])
    assert.equal(safeEditorPath(value), '/problems', String(value));
});
async function mount() {
  calls = [];
  moves = [];
  saved = null;
  cleared = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Page)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Passkey management restores the cookie account before opening and returns to the project', async () => {
  section = 'passkeys';
  failure = null;
  const view = await mount();
  try {
    assert.equal(saved, session);
    assert.deepEqual(calls[0], [
      '/auth/general/sso',
      undefined,
      { method: 'POST', body: '{}' },
    ]);
    assert.match(view.host.textContent, /패스키 관리 current@example.test/);
    await act(async () => view.host.querySelector('button').click());
    const to = new URL(moves[0][0], 'https://zoj.kr');
    assert.equal(to.pathname, '/editor/return');
    assert.equal(to.searchParams.get('next'), '/problems/abc/files');
  } finally {
    await view.close();
  }
});
test('Expired sessions go through the existing login flow with the management destination intact', async () => {
  section = 'passkeys';
  failure = 401;
  const view = await mount();
  try {
    assert.equal(saved, null);
    assert.equal(view.host.querySelector('button'), null);
    assert.equal(
      new URL(moves[0][0], 'https://zoj.kr').searchParams.get('moveTo'),
      '/editor/account?section=passkeys&next=%2Fproblems%2Fabc%2Ffiles',
    );
  } finally {
    await view.close();
  }
});
test('An auth outage never opens account controls or reuses a stale stored identity', async () => {
  section = 'passkeys';
  failure = 503;
  const view = await mount();
  try {
    assert.equal(saved, null);
    assert.match(view.host.textContent, /확인하지 못했습니다/);
    assert.equal(moves.length, 0);
  } finally {
    await view.close();
  }
});
test('Password changes revoke local state and require login before returning to Editor', async () => {
  section = 'password';
  failure = null;
  const view = await mount();
  try {
    await act(async () => view.host.querySelector('button').click());
    assert.equal(cleared, 1);
    const to = new URL(moves[0][0], 'https://zoj.kr');
    assert.equal(to.pathname, '/login');
    assert.equal(to.searchParams.get('password'), 'changed');
    assert.match(to.searchParams.get('moveTo'), /^\/editor\/return\?/);
  } finally {
    await view.close();
  }
});
