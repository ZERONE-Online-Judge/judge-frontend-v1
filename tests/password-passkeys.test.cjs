const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { setTimeout: pause } = require('node:timers/promises');
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
let calls, done, available, supported, failure, validity;
const mocks = {
  '@/domains/identityAccess/accountPasswords': {
    getAccountPassword: async () => ({ has_password: true }),
    getLoginOptions: async (email) => {
      calls.push(['methods', email]);
      return { password_available: true, passkey_available: available };
    },
    requestAccountPassword: async (...args) => {
      calls.push(['email', ...args]);
    },
    confirmAccountPassword: async (...args) => {
      calls.push(['confirm-email', ...args]);
    },
    confirmAccountPasswordWithPasskey: async (...args) => {
      calls.push(['confirm-passkey', ...args]);
    },
  },
  '@/domains/identityAccess/passkeys': {
    supportsPasskeys: () => supported,
    getPasskeys: async () => ({ passkeys: available ? [{ id: 'key' }] : [] }),
    verifyPasswordPasskey: async (...args) => {
      calls.push(['verify-passkey', ...args]);
      if (failure) throw failure;
      return { proof_token: 'purpose-bound-proof', valid_seconds: validity };
    },
    passkeyError: () => '패스키 인증을 취소했습니다. 이메일 인증을 이용하세요.',
  },
  '@/shared/api/errors': {
    formatUserApiError: (error, fallback) => fallback + ': ' + error.message,
  },
  '@/shared/ui/ModalDialog': {
    __esModule: true,
    default: ({ title, children, footer }) =>
      h('section', { role: 'dialog' }, h('h2', null, title), children, footer),
    ModalButton: ({ tone, children, ...props }) => {
      void tone;
      return h('button', { type: 'button', ...props }, children);
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
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find((file) => fs.existsSync(file));
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
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Dialog = source('components/auth/AccountPasswordDialog.tsx').default;
async function mount(mode = 'set', support = true) {
  calls = [];
  done = [];
  available = true;
  supported = support;
  failure = null;
  validity = 300;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      h(Dialog, {
        mode,
        email: 'user@example.com',
        token: mode === 'set' ? 'session-token' : undefined,
        onClose: () => {},
        onDone: (email) => done.push(email),
      }),
    );
  });
  await act(async () => {
    await pause(mode === 'reset' ? 450 : 10);
  });
  return {
    host,
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
  const el = button(v, text);
  assert.ok(el, text);
  await act(async () => el.click());
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
async function password(v) {
  await input(v, 'input[autocomplete="new-password"]', 'Password1!');
  const fields = v.host.querySelectorAll('input[autocomplete="new-password"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    ).set.call(fields[1], 'Password1!');
    fields[1].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit(v) {
  await act(async () =>
    v.host
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
}
for (const mode of ['set', 'reset'])
  test(`${mode} uses a password-specific passkey proof without email code or a new login`, async () => {
    const v = await mount(mode);
    await click(v, '패스키로 인증');
    assert.equal(
      v.host.querySelector('input[autocomplete="one-time-code"]'),
      null,
    );
    assert.ok(v.host.textContent.includes('패스키로 본인 확인을 완료했습니다'));
    await password(v);
    await submit(v);
    assert.deepEqual(
      calls.filter(([name]) => name === 'verify-passkey'),
      [
        [
          'verify-passkey',
          mode,
          mode === 'set' ? 'session-token' : undefined,
          mode === 'reset' ? 'user@example.com' : undefined,
        ],
      ],
    );
    assert.deepEqual(
      calls.filter(([name]) => name === 'confirm-passkey'),
      [
        [
          'confirm-passkey',
          'purpose-bound-proof',
          'Password1!',
          mode === 'set' ? 'session-token' : undefined,
          mode === 'reset' ? 'user@example.com' : undefined,
        ],
      ],
    );
    assert.equal(
      calls.some(([name]) => name === 'email' || name === 'confirm-email'),
      false,
    );
    assert.deepEqual(done, ['user@example.com']);
    await v.close();
  });
test('cancelling passkey verification preserves the email alternative', async () => {
  const v = await mount();
  failure = new Error('cancelled');
  await click(v, '패스키로 인증');
  assert.ok(v.host.textContent.includes('이메일 인증을 이용하세요'));
  assert.deepEqual(done, []);
  await click(v, '이메일 인증번호 받기');
  await input(v, 'input[autocomplete="one-time-code"]', '123456');
  await password(v);
  await submit(v);
  assert.deepEqual(
    calls.filter(([name]) => name === 'confirm-email'),
    [['confirm-email', '123456', 'Password1!', 'session-token', undefined]],
  );
  assert.deepEqual(done, ['user@example.com']);
  await v.close();
});
test('resetting another email discards the previous proof and password fields', async () => {
  const v = await mount('reset');
  await click(v, '패스키로 인증');
  await password(v);
  await input(v, 'input[type="email"]', 'other@example.com');
  assert.equal(
    v.host.querySelector('input[autocomplete="new-password"]'),
    null,
  );
  assert.equal(button(v, '패스키로 인증'), undefined);
  await act(async () => {
    await pause(450);
  });
  await click(v, '패스키로 인증');
  await password(v);
  await submit(v);
  assert.deepEqual(calls.filter(([name]) => name === 'verify-passkey').at(-1), [
    'verify-passkey',
    'reset',
    undefined,
    'other@example.com',
  ]);
  assert.deepEqual(done, ['other@example.com']);
  await v.close();
});
test('email verification can be replaced by passkey verification without an email code', async () => {
  const v = await mount();
  await click(v, '이메일 인증번호 받기');
  assert.ok(v.host.querySelector('input[autocomplete="one-time-code"]'));
  await click(v, '패스키로 대신 인증');
  assert.equal(
    v.host.querySelector('input[autocomplete="one-time-code"]'),
    null,
  );
  await password(v);
  await submit(v);
  assert.deepEqual(done, ['user@example.com']);
  await v.close();
});
test('an expired proof disables saving until a fresh verification', async () => {
  const v = await mount();
  validity = -1;
  await click(v, '패스키로 인증');
  await password(v);
  assert.ok(v.host.textContent.includes('인증이 만료되었습니다'));
  assert.equal(button(v, '비밀번호 변경').disabled, true);
  validity = 300;
  await click(v, '패스키로 다시 인증');
  await password(v);
  assert.equal(button(v, '비밀번호 변경').disabled, false);
  await v.close();
});
test('unsupported browsers keep email verification available', async () => {
  const v = await mount('set', false);
  assert.equal(button(v, '패스키로 인증'), undefined);
  await click(v, '이메일 인증번호 받기');
  assert.ok(v.host.querySelector('input[autocomplete="one-time-code"]'));
  await v.close();
});
after(() => dom.window.close());
