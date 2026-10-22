const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setTimeout } = require('node:timers');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
let rows, calls, error, resolveDelete, host, root, query;
const cache = new Map();
const mocks = {
  '@/components/admin/AdminShell': {
    AdminAccessGate: ({ children }) => children({ accessToken: 'master' }),
    AdminPanel: ({ children }) => h('section', null, children),
    AdminLayout: ({ children }) => h('main', null, children),
    AdminViewTabs: () => null,
    ContestIcon: () => null,
  },
  '@/components/common/PageLayout': {
    default: ({ children }) => h('main', null, children),
  },
  '@/components/operator/ContestVisibilitySettings': { default: () => null },
  '@/shared/ui/ModalDialog': {
    default: ({ title, children, footer, onClose, closeOnBackdrop }) =>
      h(
        'section',
        {
          role: 'dialog',
          'aria-label': title,
          'data-backdrop-close': closeOnBackdrop,
        },
        h(
          'button',
          { disabled: !onClose, onClick: onClose, 'aria-label': '닫기' },
          '닫기',
        ),
        children,
        footer,
      ),
    ModalButton: ({ children, tone, ...props }) =>
      h('button', { ...props, 'data-tone': tone }, children),
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => token,
  },
  '@/domains/contestAdministration/api': {
    getAdminContests: async () => [...rows],
    deleteAdminContest: async (contestId, token, title) => {
      calls.push({ contestId, token, title });
      if (error) throw error;
      if (resolveDelete)
        await new Promise((resolve) => {
          resolveDelete = resolve;
        });
      rows = rows.filter((row) => row.contest_id !== contestId);
      return { deleted: true, contest_id: contestId, title };
    },
  },
};
for (const mock of Object.values(mocks))
  if ('default' in mock) mock.__esModule = true;
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (!id.startsWith('@/')) return native(id);
    const next = ['.ts', '.tsx']
      .map((ext) => id.slice(2) + ext)
      .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
    return source(next);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Page = source('pages/admin/AdminContestsPage.tsx').default;
beforeEach(async () => {
  calls = [];
  error = null;
  resolveDelete = null;
  rows = ['ended', 'running'].map((status, i) => ({
    contest_id: 'c' + i,
    title: i ? '진행 대회' : '삭제 확인 대회',
    organization_name: 'ZOJ',
    status,
    start_at: '2026-10-01T01:00:00Z',
    end_at: '2026-10-01T06:00:00Z',
    visibility: 'public',
    visibility_after_end: 'public',
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  query = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await act(async () =>
    root.render(
      h(QueryClientProvider, { client: query }, h(MemoryRouter, null, h(Page))),
    ),
  );
  await flush();
});
afterEach(async () => {
  await act(() => root.unmount());
  query.clear();
  host.remove();
});
after(() => dom.window.close());
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function open() {
  await act(() =>
    host.querySelector('[aria-label="삭제 확인 대회 삭제"]').click(),
  );
}
async function input(value) {
  const field = host.querySelector('[aria-label="삭제할 대회명"]');
  await act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(field, value);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function confirm() {
  return [...host.querySelectorAll('[role="dialog"] button')].find(
    (el) => el.textContent === '대회 삭제',
  );
}

test('deletion requires the exact name and cancel never sends a request', async () => {
  await open();
  assert.equal(
    host.querySelector('[role="dialog"]').dataset.backdropClose,
    'false',
  );
  assert.ok(confirm().disabled);
  await input('다른 대회');
  assert.ok(confirm().disabled);
  await input('삭제 확인 대회');
  assert.equal(confirm().disabled, false);
  await act(() =>
    [...host.querySelectorAll('[role="dialog"] button')]
      .find((el) => el.textContent === '취소')
      .click(),
  );
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.deepEqual(calls, []);
  assert.ok(host.querySelector('[aria-label="진행 대회 삭제"]').disabled);
});

test('success removes only the chosen row and failure keeps the contest and dialog visible', async () => {
  await open();
  await input('삭제 확인 대회');
  error = new Error('채점이 남아 있습니다.');
  await act(() => confirm().click());
  await flush();
  assert.ok(host.querySelector('[role="dialog"]'));
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /채점이 남아 있습니다/,
  );
  assert.ok(host.querySelector('[aria-label="삭제 확인 대회 삭제"]'));
  error = null;
  await act(() => confirm().click());
  await flush();
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(host.querySelector('[aria-label="삭제 확인 대회 삭제"]'), null);
  assert.ok(host.querySelector('[aria-label="진행 대회 삭제"]'));
  assert.match(
    host.querySelector('[role="status"]').textContent,
    /삭제 확인 대회 대회를 삭제했습니다/,
  );
  assert.deepEqual(calls[0], {
    contestId: 'c0',
    token: 'master',
    title: '삭제 확인 대회',
  });
});

test('pending deletion blocks repeat confirmation and closing', async () => {
  resolveDelete = true;
  await open();
  await input('삭제 확인 대회');
  await act(() => confirm().click());
  await flush();
  assert.equal(calls.length, 1);
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(
    [...dialog.querySelectorAll('button')].every((button) => button.disabled),
  );
  await act(() => resolveDelete());
  await flush();
  assert.equal(host.querySelector('[role="dialog"]'), null);
});
