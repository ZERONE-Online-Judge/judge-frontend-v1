const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setTimeout } = require('node:timers');
const { URL, URLSearchParams } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'http://100.64.0.19:5265/operator',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const navigatorDescriptor = Object.getOwnPropertyDescriptor(
  global,
  'navigator',
);
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const nativeFetch = global.fetch;
const cache = new Map();
let account,
  reads,
  changes,
  copied,
  clipboardDenied,
  deferredRead,
  popupOpens,
  requests;
const initialAccount = {
  email: 'abcd1234@score.zoj.kr',
  created_at: '2026-11-12T00:00:00Z',
  expires_at: '2026-11-19T00:00:00Z',
  active: true,
};
const mocks = {
  '@/domains/presentationAccess/api': {
    getPresentationAccount: async (contestId, token) => {
      reads.push({ contestId, token });
      if (deferredRead) await deferredRead;
      return account;
    },
    issuePresentationAccount: async (contestId, token) => {
      changes.push({ action: 'issue', contestId, token });
      account = {
        ...initialAccount,
        email: `abcd000${changes.length}@score.zoj.kr`,
      };
      return account;
    },
    revokePresentationAccount: async (contestId, token) => {
      changes.push({ action: 'revoke', contestId, token });
      account = null;
      return { revoked: true };
    },
  },
};
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.endsWith('.css')) return {};
    if (!id.startsWith('@/')) return native(id);
    const target = ['.ts', '.tsx']
      .map((ext) => id.slice(2) + ext)
      .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
    assert.ok(target, `Cannot resolve ${id}`);
    return source(target);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
let root, host, client, props;
async function flush() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function render(next = {}) {
  props = { ...props, ...next };
  const Card = source(
    'components/operator/PresentationAccountCard.tsx',
  ).default;
  await act(() =>
    root.render(h(QueryClientProvider, { client }, h(Card, props))),
  );
  await flush();
}
const button = (text) =>
  [...document.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === text,
  );
async function click(text) {
  assert.ok(button(text), text);
  await act(async () => button(text).click());
  await flush();
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  account = { ...initialAccount };
  reads = [];
  changes = [];
  copied = [];
  clipboardDenied = false;
  deferredRead = null;
  popupOpens = 0;
  requests = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value) => {
        if (clipboardDenied) throw new Error('denied');
        copied.push(value);
      },
    },
  });
  global.fetch = (...args) => {
    requests.push(args);
    throw new Error('No real APIs in isolated card verification');
  };
  props = {
    contestId: 'contest-test',
    token: 'synthetic-token',
    canManage: true,
    onOpenPopup: () => popupOpens++,
    popupDisabled: false,
    popupBlocked: false,
    popupUrl: '/operator/contests/test/scoreboard/presentation?divisionId=b',
    divisionIds: ['b', 'a'],
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  assert.deepEqual(requests, []);
});
after(() => {
  global.fetch = nativeFetch;
  if (navigatorDescriptor)
    Object.defineProperty(global, 'navigator', navigatorDescriptor);
  else delete global.navigator;
  dom.window.close();
});

test('one presentation view card groups the popup, manual account and auto-login link', async () => {
  await render();
  assert.equal(host.querySelectorAll('[data-edit-card]').length, 1);
  assert.equal(host.querySelector('h2').textContent, '프레젠테이션 뷰');
  assert.ok(button('프레젠테이션 팝업'));
  assert.ok(button('자동 로그인 링크 복사'));
  assert.equal(
    host.querySelector('[aria-label="프레젠테이션 로그인 계정"]').textContent,
    initialAccount.email,
  );
  assert.match(host.textContent, /7일.*여러 기기.*동시에/s);
  await click('프레젠테이션 팝업');
  assert.equal(popupOpens, 1);
  assert.deepEqual(changes, []);
});

test('clipboard receives a production HTTPS auto-login link with account fragment and selected divisions', async () => {
  await render();
  await click('자동 로그인 링크 복사');
  assert.equal(copied.length, 1);
  const url = new URL(copied[0]);
  assert.equal(url.origin, 'https://zoj.kr');
  assert.equal(url.pathname, '/presentation/login');
  assert.equal(url.searchParams.get('contestId'), props.contestId);
  assert.deepEqual(url.searchParams.getAll('divisionId'), ['b', 'a']);
  assert.equal(
    new URLSearchParams(url.hash.slice(1)).get('account'),
    initialAccount.email,
  );
  assert.notEqual(copied[0], initialAccount.email);
  assert.match(
    host.querySelector('[role="status"]').textContent,
    /자동 로그인 링크를 복사/,
  );
  assert.deepEqual(changes, []);
  await render({ divisionIds: ['a'] });
  await click('자동 로그인 링크 복사');
  assert.deepEqual(new URL(copied[1]).searchParams.getAll('divisionId'), ['a']);
});

test('clipboard denial offers the complete selectable URL while retaining manual account login', async () => {
  clipboardDenied = true;
  await render();
  await click('자동 로그인 링크 복사');
  const input = host.querySelector('input[readonly]');
  assert.ok(input);
  assert.match(input.value, /^https:\/\/zoj\.kr\/presentation\/login/);
  input.focus();
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, input.value.length);
  assert.match(host.textContent, /직접 복사/);
  assert.match(host.textContent, /직접 로그인/);
  assert.match(
    host.textContent,
    new RegExp(initialAccount.email.replaceAll('.', '\\.')),
  );
});

test('view-only operators keep popup access without reading or exposing presentation accounts', async () => {
  await render({ canManage: false, popupBlocked: true });
  assert.deepEqual(reads, []);
  assert.deepEqual(changes, []);
  assert.ok(button('프레젠테이션 팝업'));
  assert.equal(button('자동 로그인 링크 복사'), undefined);
  assert.equal(button('전용 계정 만들기'), undefined);
  assert.doesNotMatch(host.textContent, /abcd1234/);
  const fallback = host.querySelector('a');
  assert.equal(fallback.getAttribute('href'), props.popupUrl);
  assert.equal(fallback.getAttribute('target'), '_blank');
  await click('프레젠테이션 팝업');
  assert.equal(popupOpens, 1);
});

test('account loading disables account controls while keeping a ready popup available', async () => {
  let finish;
  deferredRead = new Promise((resolve) => {
    finish = resolve;
  });
  await render();
  assert.equal(button('전용 계정 만들기').disabled, true);
  assert.equal(button('프레젠테이션 팝업').disabled, false);
  finish();
  await flush();
  assert.ok(button('자동 로그인 링크 복사'));
  assert.equal(button('자동 로그인 링크 복사').disabled, false);
  await render({ popupDisabled: true });
  assert.equal(button('프레젠테이션 팝업').disabled, true);
  assert.equal(button('자동 로그인 링크 복사').disabled, true);
});

test('issue, reissue cancellation and revoke retain explicit confirmations and query updates', async () => {
  account = null;
  await render();
  await click('전용 계정 만들기');
  assert.equal(changes.length, 1);
  assert.ok(button('자동 로그인 링크 복사'));
  await click('새 주소로 재발급');
  assert.equal(changes.length, 1);
  assert.match(
    document.querySelector('dialog').textContent,
    /기존 주소.*즉시 해제/,
  );
  await click('취소');
  assert.equal(changes.length, 1);
  await click('새 주소로 재발급');
  await click('재발급');
  assert.equal(changes.length, 2);
  assert.match(host.textContent, /abcd0002@score.zoj.kr/);
  await click('사용 중지');
  assert.equal(changes.length, 2);
  await click('취소');
  assert.equal(changes.length, 2);
  await click('사용 중지');
  const dialog = document.querySelector('dialog');
  const confirm = [...dialog.querySelectorAll('button')].find(
    (item) => item.textContent === '사용 중지',
  );
  await act(async () => confirm.click());
  await flush();
  assert.equal(changes.length, 3);
  assert.equal(changes.at(-1).action, 'revoke');
  assert.ok(button('전용 계정 만들기'));
  assert.equal(button('자동 로그인 링크 복사'), undefined);
});

test('losing management permission removes account data and a pending confirmation without mutation', async () => {
  await render();
  await click('새 주소로 재발급');
  assert.ok(document.querySelector('dialog'));
  await render({ canManage: false });
  assert.equal(document.querySelector('dialog'), null);
  assert.doesNotMatch(host.textContent, /abcd1234/);
  assert.deepEqual(changes, []);
  assert.ok(button('프레젠테이션 팝업'));
});

test('malformed account data preserves manual login and popup without copying an invalid link', async () => {
  account = { ...initialAccount, email: 'legacy@example.test' };
  await render();
  assert.match(host.textContent, /legacy@example\.test/);
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /링크를 만들지 못했습니다/,
  );
  assert.equal(button('자동 로그인 링크 복사').disabled, true);
  await click('자동 로그인 링크 복사');
  assert.deepEqual(copied, []);
  await click('프레젠테이션 팝업');
  assert.equal(popupOpens, 1);
  assert.deepEqual(changes, []);
});
