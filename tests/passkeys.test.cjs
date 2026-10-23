const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { URLSearchParams } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr/login',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let state, calls, navigation, supported, options, items, recent, handler;
const params = new URLSearchParams('next=/contests');
const navigate = (...args) => navigation.push(args[0]);
const session = {
  account: { email: 'user@example.com' },
  accessToken: 'fixture-access',
  participantContests: [],
  operatorContests: [],
};
class ApiError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const useStore = (select) => select(state);
useStore.getState = () => state;
const api = {
  supportsPasskeys: () => supported,
  getPasskeys: async () => ({ passkeys: items, recently_verified: recent }),
  loginPasskey: async (email) => {
    calls.push(['passkey', email]);
    if (handler) return handler('passkey');
    return session;
  },
  confirmPasskeyLoginTransfer: async (email, token) => {
    calls.push(['transfer', email, token]);
    if (handler) return handler('transfer');
    return session;
  },
  registerPasskey: async (token, name) => {
    calls.push(['register', token, name]);
    if (handler) await handler('register');
    items = [{ id: 'new-key', name, created_at: 100 }];
  },
  removePasskey: async (token, id) => {
    calls.push(['remove', token, id]);
    items = items.filter((item) => item.id !== id);
  },
  requestSecurityCode: async () => {
    calls.push(['request-security']);
    return { challenge_id: 'proof-id', cooldown_seconds: 30 };
  },
  verifySecurityCode: async (...args) => {
    calls.push(['verify-security', ...args]);
    recent = true;
  },
  passkeyError: (error) =>
    error.name === 'NotAllowedError'
      ? '패스키 인증을 취소했습니다. 이메일 인증을 이용하세요.'
      : null,
};
const mocks = {
  'react-router-dom': {
    Link: ({ to, children, ...rest }) =>
      h('a', { href: to, ...rest }, children),
    useNavigate: () => navigate,
    useLocation: () => ({ state: {} }),
    useSearchParams: () => [params, () => {}],
  },
  '@/domains/identityAccess/sessionStore': { useSessionStore: useStore },
  '@/domains/identityAccess/passkeys': api,
  '@/domains/identityAccess/permissions': { isServiceMaster: () => false },
  '@/domains/identityAccess/participantPreview': {
    hasParticipantPreviewAccess: () => false,
  },
  '@/domains/presentationAccess/api': { loginPresentation: async () => {} },
  '@/domains/presentationAccess/session': {
    isPresentationEmail: () => false,
    usePresentationSession: {},
  },
  '@/domains/identityAccess/accountPasswords': {
    getLoginOptions: async () => options,
    loginGeneralPassword: async () => {
      calls.push(['password']);
      if (handler) return handler('password');
      return session;
    },
  },
  '@/domains/identityAccess/api': {
    requestGeneralOtp: async () => {
      calls.push(['request-otp']);
      return { cooldown_seconds: 10 };
    },
    verifyGeneralOtp: async () => {
      calls.push(['verify-otp']);
      return session;
    },
  },
  '@/shared/api/errors': {
    isApiClientError: (e) => e instanceof ApiError,
    formatUserApiError: (e, fallback) => fallback + ': ' + e.message,
    readRetryAfterSeconds: () => 0,
  },
  '@/components/auth/AccountPasswordDialog': {
    default: ({ email, onDone }) =>
      h(
        'section',
        { role: 'dialog' },
        h('button', { onClick: () => onDone(email) }, '비밀번호 변경 완료'),
      ),
  },
  '@/components/auth/PasswordInput': {
    PasswordInput: (props) =>
      h('input', { ...props, label: undefined, type: 'password' }),
  },
  '@/shared/ui/PageNotice': {
    default: ({ message }) =>
      message ? h('p', { role: 'status' }, message) : null,
  },
  '@/shared/ui/ModalDialog': {
    default: ({ title, children, footer, onClose }) =>
      h(
        'section',
        { role: 'dialog' },
        h('h2', null, title),
        children,
        footer,
        onClose &&
          h('button', { onClick: onClose, 'aria-label': '닫기' }, '닫기'),
      ),
    ModalButton: ({ tone, children, type = 'button', ...props }) => {
      void tone;
      return h('button', { ...props, type }, children);
    },
  },
};
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/')) {
      const target = id.slice(2);
      return source(
        ['.ts', '.tsx']
          .map((ext) => target + ext)
          .find((name) =>
            fs.existsSync(path.resolve(__dirname, '../src', name)),
          ),
      );
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
for (const value of Object.values(mocks))
  if (value.default) value.__esModule = true;
const Login = source('pages/auth/LoginPage.tsx').default;
const Dialog = source('components/auth/PasskeyDialog.tsx').default;
function reset() {
  for (const key of [...params.keys()]) params.delete(key);
  params.set('next', '/contests');
  calls = [];
  navigation = [];
  supported = true;
  options = { password_available: false, passkey_available: false };
  items = [];
  recent = true;
  handler = null;
  state = {
    generalSession: null,
    setGeneralSession: (v) => {
      state.generalSession = v;
    },
    setParticipantSession: () => {},
  };
}
async function mount(Component = Login, props = {}) {
  reset();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(h(Component, props)));
  return {
    host,
    render: () => act(async () => root.render(h(Component, props))),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const button = (v, text) =>
  [...v.host.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
async function click(v, text) {
  const element = button(v, text);
  assert.ok(element, text);
  await act(async () => element.click());
}
async function input(v, selector, value) {
  const element = v.host.querySelector(selector);
  assert.ok(element, selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    ).set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit(v, selector = 'form') {
  await act(async () =>
    v.host
      .querySelector(selector)
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
}

test('email OTP login pauses at passkey enrollment and skip preserves the requested destination', async () => {
  const v = await mount();
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  assert.ok(calls.some(([name]) => name === 'request-otp'));
  await input(v, '#login-otp', '123456');
  await submit(v);
  assert.ok(v.host.textContent.includes('패스키를 등록할까요?'));
  assert.deepEqual(navigation, []);
  await click(v, '나중에');
  assert.ok(navigation.includes('/contests'));
  assert.equal(state.generalSession, session);
  await v.close();
});
test('successful login enrollment immediately closes and returns to the requested destination', async () => {
  const v = await mount();
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-otp', '123456');
  await submit(v);
  assert.deepEqual(navigation, []);
  assert.equal(v.host.querySelector('#passkey-name'), null);
  await click(v, '패스키 등록');
  assert.deepEqual(
    calls.filter(([name]) => name === 'register'),
    [['register', session.accessToken, '내 패스키']],
  );
  assert.equal(v.host.querySelector('[role="dialog"]'), null);
  assert.ok(navigation.includes('/contests'));
  assert.equal(state.generalSession, session);
  await v.close();
});

test('cancelled login enrollment stays open and lets the signed-in user skip or retry', async () => {
  const v = await mount();
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-otp', '123456');
  await submit(v);
  handler = async () => {
    throw Object.assign(new Error('cancel'), { name: 'NotAllowedError' });
  };
  await click(v, '패스키 등록');
  assert.deepEqual(navigation, []);
  assert.ok(v.host.textContent.includes('패스키를 등록할까요?'));
  assert.equal(state.generalSession, session);
  handler = null;
  await click(v, '패스키 등록');
  assert.equal(v.host.querySelector('[role="dialog"]'), null);
  assert.ok(navigation.includes('/contests'));
  await v.close();
});

test('email first prioritizes the password even with a passkey and cancellation keeps alternatives available', async () => {
  const v = await mount();
  assert.equal(button(v, '패스키로 로그인'), undefined);
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  assert.equal(v.host.querySelector('#login-email').readOnly, true);
  assert.equal(calls.length, 0);
  assert.ok(v.host.querySelector('#login-password'));
  assert.equal(v.host.querySelector('#login-otp'), null);
  handler = async () => {
    throw Object.assign(new Error('cancel'), { name: 'NotAllowedError' });
  };
  await click(v, '패스키로 로그인');
  assert.equal(calls.length, 0);
  await submit(v);
  assert.equal(state.generalSession, null);
  assert.ok(v.host.textContent.includes('이메일 인증을 이용하세요'));
  handler = null;
  await click(v, '패스키로 로그인');
  assert.equal(state.generalSession, session);
  assert.ok(navigation.includes('/contests'));
  await v.close();
});
test('password login on an unfamiliar environment switches to email or passkey verification', async () => {
  const v = await mount();
  options = { password_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-password', 'Password1!');
  handler = async () => {
    throw new ApiError('additional_verification_required');
  };
  await submit(v);
  assert.equal(state.generalSession, null);
  assert.equal(v.host.querySelector('#login-password'), null);
  assert.ok(v.host.textContent.includes('새로운 브라우저 또는 IP'));
  assert.equal(button(v, '패스키로 로그인'), undefined);
  assert.equal(button(v, '비밀번호로 로그인'), undefined);
  assert.equal(v.host.querySelector('#login-otp'), null);
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 0);
  await click(v, '이메일 인증번호 받기');
  assert.ok(v.host.querySelector('#login-otp'));
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 1);
  await v.close();
});
test('passkey management requires email verification before registration and deletion requires confirmation', async () => {
  const v = await mount(Dialog, {
    token: session.accessToken,
    email: session.account.email,
    onClose: () => {},
  });
  // Remount with an unverified status.
  await v.close();
  reset();
  recent = false;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(Dialog, {
        token: session.accessToken,
        email: session.account.email,
        onClose: () => {},
      }),
    ),
  );
  const view = { host };
  assert.equal(button(view, '패스키 추가'), undefined);
  await click(view, '이메일 인증번호 받기');
  await input(view, '#passkey-code', '123456');
  await submit(view);
  assert.ok(button(view, '패스키 추가'));
  await submit(view, '.passkey-add');
  assert.ok(host.textContent.includes('패스키를 등록했습니다'));
  await click(view, '삭제');
  assert.equal(
    calls.some(([name]) => name === 'remove'),
    false,
  );
  await click(view, '취소');
  assert.equal(
    calls.some(([name]) => name === 'remove'),
    false,
  );
  await click(view, '삭제');
  const confirms = [...host.querySelectorAll('button')].filter(
    (item) => item.textContent === '삭제',
  );
  await act(async () => confirms.at(-1).click());
  assert.equal(calls.filter(([name]) => name === 'remove').length, 1);
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());

test('replacing an existing passkey session authenticates once then consumes the transfer proof', async () => {
  const v = await mount();
  options = { password_available: false, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  handler = async (method) => {
    if (method === 'passkey') {
      const error = new ApiError('session_conflict', 409);
      error.details = { transfer_token: 'verified-transfer-proof-'.repeat(2) };
      throw error;
    }
    return session;
  };
  await click(v, '패스키로 로그인');
  await submit(v);
  assert.equal(state.generalSession, null);
  assert.ok(v.host.textContent.includes('기존 로그인 연결을 끊을까요?'));
  await click(v, '이 브라우저에서 사용');
  assert.deepEqual(
    calls.filter(([name]) => name === 'passkey' || name === 'transfer'),
    [
      ['passkey', 'user@example.com'],
      ['transfer', 'user@example.com', 'verified-transfer-proof-'.repeat(2)],
    ],
  );
  assert.equal(state.generalSession, session);
  await v.close();
});

test('canceling session transfer discards approval without logging in', async () => {
  const v = await mount();
  options = { password_available: false, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  handler = async () => {
    const error = new ApiError('session_conflict', 409);
    error.details = { transfer_token: 'verified-transfer-proof-'.repeat(2) };
    throw error;
  };
  await click(v, '패스키로 로그인');
  await submit(v);
  await click(v, '이전 세션 유지');
  assert.equal(state.generalSession, null);
  assert.equal(calls.filter(([name]) => name === 'transfer').length, 0);
  assert.equal(button(v, '이 브라우저에서 사용'), undefined);
  await v.close();
});

test('expired session transfer closes confirmation without another passkey prompt', async () => {
  const v = await mount();
  options = { password_available: false, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  handler = async (method) => {
    const error = new ApiError(
      method === 'passkey' ? 'session_conflict' : 'invalid_passkey',
      method === 'passkey' ? 409 : 400,
    );
    error.details = { transfer_token: 'verified-transfer-proof-'.repeat(2) };
    throw error;
  };
  await click(v, '패스키로 로그인');
  await submit(v);
  await click(v, '이 브라우저에서 사용');
  assert.equal(state.generalSession, null);
  assert.equal(calls.filter(([name]) => name === 'passkey').length, 1);
  assert.equal(calls.filter(([name]) => name === 'transfer').length, 1);
  assert.equal(button(v, '이 브라우저에서 사용'), undefined);
  assert.ok(v.host.textContent.includes('다시 시도해 주세요'));
  await v.close();
});

test('an account switch closes the previous account enrollment prompt', async () => {
  const v = await mount();
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-otp', '123456');
  await submit(v);
  assert.ok(v.host.textContent.includes('패스키를 등록할까요?'));
  state.generalSession = {
    ...session,
    account: { email: 'other@example.com' },
  };
  await v.render();
  assert.equal(v.host.textContent.includes('패스키를 등록할까요?'), false);
  assert.ok(navigation.includes('/contests'));
  assert.equal(state.generalSession.account.email, 'other@example.com');
  await v.close();
});

test('switching methods reuses a valid email code and changing email clears account-specific methods', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await click(v, '이메일로 대신 로그인');
  assert.ok(v.host.querySelector('#login-otp'));
  await click(v, '비밀번호로 로그인');
  await input(v, '#login-password', 'Password1!');
  await click(v, '이메일로 대신 로그인');
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 1);
  await click(v, '다른 이메일 사용');
  assert.equal(v.host.querySelector('#login-email').readOnly, false);
  assert.equal(v.host.querySelector('#login-otp'), null);
  assert.equal(v.host.querySelector('#login-password'), null);
  assert.equal(button(v, '패스키로 로그인'), undefined);
  options = { password_available: false, passkey_available: false };
  await input(v, '#login-email', 'other@example.com');
  await submit(v);
  assert.ok(v.host.querySelector('#login-otp'));
  assert.equal(button(v, '패스키로 로그인'), undefined);
  assert.equal(button(v, '비밀번호로 로그인'), undefined);
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 2);
  await v.close();
});

for (const passwordAvailable of [true, false]) {
  test(`unsupported passkey browser falls back with password=${passwordAvailable}`, async () => {
    const v = await mount();
    supported = false;
    options = {
      password_available: passwordAvailable,
      passkey_available: true,
    };
    await input(v, '#login-email', 'user@example.com');
    await submit(v);
    assert.equal(button(v, '패스키로 로그인'), undefined);
    assert.equal(
      Boolean(v.host.querySelector('#login-password')),
      passwordAvailable,
    );
    assert.equal(
      Boolean(v.host.querySelector('#login-otp')),
      !passwordAvailable,
    );
    assert.equal(
      calls.some(([name]) => name === 'request-otp'),
      !passwordAvailable,
    );
    await v.close();
  });
}

test('new environment verification can use the registered passkey without returning to password', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-password', 'Password1!');
  handler = async (method) => {
    if (method === 'password')
      throw new ApiError('additional_verification_required');
    return session;
  };
  await submit(v);
  assert.equal(state.generalSession, null);
  assert.equal(v.host.querySelector('#login-otp'), null);
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 0);
  assert.equal(button(v, '비밀번호로 로그인'), undefined);
  await click(v, '패스키로 인증');
  assert.equal(state.generalSession, session);
  assert.deepEqual(
    calls.filter(([name]) => name === 'passkey'),
    [['passkey', 'user@example.com']],
  );
  await v.close();
});

test('a trusted environment finishes with the password alone even when a passkey exists', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-password', 'Password1!');
  await submit(v);
  assert.deepEqual(calls, [['password']]);
  assert.equal(state.generalSession, session);
  assert.ok(navigation.includes('/contests'));
  assert.equal(v.host.textContent.includes('패스키를 등록할까요?'), false);
  await v.close();
});

test('an incorrect password stays on the password screen without sending email or opening a passkey', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  handler = async () => {
    throw new ApiError('invalid_credentials', 401);
  };
  await input(v, '#login-password', 'WrongPassword1!');
  await submit(v);
  assert.deepEqual(calls, [['password']]);
  assert.equal(state.generalSession, null);
  assert.ok(v.host.querySelector('#login-password'));
  assert.equal(button(v, '이메일 인증번호 받기'), undefined);
  assert.equal(button(v, '패스키로 인증'), undefined);
  await v.close();
});

test('a password change still defaults to the new password before environment verification', async () => {
  const v = await mount();
  params.set('password', 'changed');
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  assert.ok(v.host.querySelector('#login-password'));
  assert.equal(v.host.querySelector('#login-otp'), null);
  assert.deepEqual(calls, []);
  await v.close();
});

test('password recovery returns to the new password and clears the previous email code', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await click(v, '이메일로 대신 로그인');
  await input(v, '#login-otp', '123456');
  await click(v, '비밀번호로 로그인');
  await click(v, '비밀번호 찾기');
  await click(v, '비밀번호 변경 완료');
  assert.ok(v.host.querySelector('#login-password'));
  assert.equal(v.host.querySelector('#login-password').value, '');
  assert.equal(v.host.querySelector('#login-otp'), null);
  assert.equal(v.host.querySelector('h1').textContent, '로그인');
  assert.ok(button(v, '패스키로 로그인'));
  await input(v, '#login-password', 'NewPassword1!');
  handler = async () => {
    throw new ApiError('additional_verification_required');
  };
  await submit(v);
  assert.ok(button(v, '이메일 인증번호 받기'));
  assert.equal(button(v, '이메일 인증번호 입력'), undefined);
  assert.equal(state.generalSession, null);
  await v.close();
});

test('an account without a password defaults to email and offers its passkey as an alternative', async () => {
  const v = await mount();
  options = { password_available: false, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  assert.ok(v.host.querySelector('#login-otp'));
  assert.equal(v.host.querySelector('#login-password'), null);
  assert.deepEqual(calls, [['request-otp']]);
  assert.ok(button(v, '패스키로 로그인'));
  await v.close();
});

test('new environment email verification sends only after selection and finishes without asking for the password again', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  items = [{ id: 'existing-key', name: '내 패스키', created_at: 100 }];
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-password', 'Password1!');
  handler = async () => {
    throw new ApiError('additional_verification_required');
  };
  await submit(v);
  assert.equal(v.host.querySelector('h1').textContent, '본인 확인');
  assert.deepEqual(calls, [['password']]);
  await click(v, '이메일 인증번호 받기');
  await input(v, '#login-otp', '123456');
  await submit(v);
  assert.deepEqual(calls, [['password'], ['request-otp'], ['verify-otp']]);
  assert.equal(state.generalSession, session);
  assert.ok(navigation.includes('/contests'));
  await v.close();
});

test('cancelled additional passkey verification can fall back to email without another password', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await input(v, '#login-password', 'Password1!');
  handler = async (method) => {
    if (method === 'password')
      throw new ApiError('additional_verification_required');
    throw Object.assign(new Error('cancel'), { name: 'NotAllowedError' });
  };
  await submit(v);
  await click(v, '패스키로 인증');
  assert.equal(state.generalSession, null);
  assert.deepEqual(calls, [['password'], ['passkey', 'user@example.com']]);
  assert.equal(v.host.querySelector('#login-password'), null);
  await click(v, '이메일 인증번호 받기');
  assert.ok(v.host.querySelector('#login-otp'));
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 1);
  await v.close();
});

test('new environment verification reuses an already requested email code during cooldown', async () => {
  const v = await mount();
  options = { password_available: true, passkey_available: true };
  await input(v, '#login-email', 'user@example.com');
  await submit(v);
  await click(v, '이메일로 대신 로그인');
  await click(v, '비밀번호로 로그인');
  await input(v, '#login-password', 'Password1!');
  handler = async () => {
    throw new ApiError('additional_verification_required');
  };
  await submit(v);
  assert.equal(button(v, '이메일 인증번호 입력').disabled, false);
  await click(v, '이메일 인증번호 입력');
  assert.ok(v.host.querySelector('#login-otp'));
  assert.equal(calls.filter(([name]) => name === 'request-otp').length, 1);
  await v.close();
});

for (const method of ['otp', 'password', 'passkey']) {
  test(`${method} login returns to the original contest path including query and fragment`, async () => {
    const v = await mount();
    const target = '/contests/shared-contest/problems?divisionId=general#A';
    params.delete('next');
    params.set('moveTo', target);
    params.set('contestId', 'shared-contest');
    options = {
      password_available: method === 'password',
      passkey_available: method === 'passkey',
    };
    items = [{ id: 'existing-key', name: '내 패스키', created_at: 100 }];
    await input(v, '#login-email', 'user@example.com');
    await submit(v);
    if (method === 'password') await input(v, '#login-password', 'Password1!');
    if (method === 'otp') await input(v, '#login-otp', '123456');
    if (method === 'passkey') await click(v, '패스키로 로그인');
    await submit(v);
    assert.equal(state.generalSession, session);
    assert.ok(navigation.includes(target));
    await v.close();
  });
}
