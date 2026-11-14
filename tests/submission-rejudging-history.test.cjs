const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false;
Object.defineProperty(document, 'hidden', { get: () => hidden });
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
let calls, pages, failure, host, root, client;
const mocks = {
  '@/domains/submissionScoreboard/api': {
    getSubmissionRejudgings: async (contestId, submissionId, token, offset) => {
      calls.push({ contestId, submissionId, token, offset });
      if (failure) throw failure;
      return pages[offset] ?? pages[0];
    },
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => `identity:${token}`,
  },
};
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (!id.startsWith('@/')) return native(id);
    const base = id.slice(2);
    return source(
      ['.ts', '.tsx']
        .map((extension) => base + extension)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file))),
    );
  };
  modules.set(filename, loaded);
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
const History = source(
  'components/operator/SubmissionRejudgingHistory.tsx',
).default;
const { ApiClientError } = source('shared/api/errors.ts');

function example(status = 'ready', id = 'batch') {
  return {
    rejudging_id: id,
    status,
    reason: '정답 파일 수정',
    requested_by_name: '운영자',
    requested_by_email: 'operator@example.test',
    decided_by_email: ['applied', 'cancelled'].includes(status)
      ? 'reviewer@example.test'
      : null,
    created_at: '2026-11-14T00:00:00Z',
    decided_at: ['applied', 'cancelled'].includes(status)
      ? '2026-11-14T00:05:00Z'
      : null,
    original_result: {
      status: 'wrong_answer',
      scoring_mode: 'ioi',
      score: 25,
      max_score: 100,
    },
    candidate_result: {
      status: status === 'pending' ? 'judging' : 'accepted',
      scoring_mode: 'ioi',
      score: status === 'pending' ? null : 100,
      max_score: 100,
    },
    rejudging_progress:
      status === 'pending'
        ? {
            rejudging_id: id,
            status: 'judging',
            progress_current: 4,
            progress_total: 15,
            progress_percent: 27,
            progress_phase: 'tle_confirmation',
          }
        : null,
    changed: status !== 'pending',
  };
}
function page(items = [example()], total = items.length, offset = 0) {
  return { items, total, offset, limit: 10, has_next: offset + 10 < total };
}
beforeEach(() => {
  hidden = false;
  calls = [];
  pages = { 0: page() };
  failure = null;
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => dom.window.close());
async function settle(milliseconds = 15) {
  await act(
    async () => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  );
}
async function render(overrides = {}) {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(History, {
          contestId: 'contest',
          submissionId: 'submission',
          token: 'fixture',
          ...overrides,
        }),
      ),
    ),
  );
  await settle();
}
function button(label) {
  return [...host.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
}
async function click(label) {
  assert.ok(button(label));
  await act(async () => button(label).click());
  await settle();
}
function interval() {
  const query = client
    .getQueryCache()
    .getAll()
    .find((entry) => entry.getObserversCount());
  return query.options.refetchInterval(query);
}

test('shows original and candidate scores with the explicit unapplied state', async () => {
  await render();
  assert.match(host.textContent, /재채점 이력1건/);
  assert.match(host.textContent, /요청: 운영자/);
  assert.match(host.textContent, /정답 파일 수정/);
  assert.match(host.textContent, /기존 결과틀렸습니다25 \/ 100점/);
  assert.match(host.textContent, /재채점 결과맞았습니다100 \/ 100점/);
  assert.match(host.textContent, /결과 반영 대기/);
  assert.match(host.textContent, /운영자가 반영하면/);
  assert.equal(interval(), false);
  assert.deepEqual(calls[0], {
    contestId: 'contest',
    submissionId: 'submission',
    token: 'fixture',
    offset: 0,
  });
});

test('pending candidate progress refreshes without changing the official result', async () => {
  pages[0] = page([example('pending')]);
  await render();
  assert.match(host.textContent, /기존 결과틀렸습니다25 \/ 100점/);
  assert.match(host.textContent, /시간 초과 재확인 중/);
  assert.match(host.textContent, /4\/15 · 27%/);
  assert.equal(interval(), 2_000);
  pages[0] = page([example('ready')]);
  await settle(2_100);
  assert.ok(calls.length >= 2);
  assert.match(host.textContent, /결과 반영 대기/);
  assert.equal(interval(), false);
});

test('hidden pages stop pending polling and resume when visible', async () => {
  pages[0] = page([example('pending')]);
  await render();
  hidden = true;
  await act(async () =>
    document.dispatchEvent(new dom.window.Event('visibilitychange')),
  );
  assert.equal(interval(), false);
  hidden = false;
  await act(async () =>
    document.dispatchEvent(new dom.window.Event('visibilitychange')),
  );
  assert.equal(interval(), 2_000);
});

test('applied, cancelled and blocked history states remain distinguishable', async () => {
  pages[0] = page(
    ['applied', 'cancelled', 'blocked'].map((status) =>
      example(status, status),
    ),
  );
  await render();
  assert.match(host.textContent, /결과 반영 완료/);
  assert.match(host.textContent, /반영한 결과/);
  assert.match(host.textContent, /공식 판정과 점수에 반영했습니다/);
  assert.match(host.textContent, /reviewer@example.test/);
  assert.match(host.textContent, /취소됨/);
  assert.match(host.textContent, /이 작업의 결과는 반영하지 않습니다/);
  assert.match(host.textContent, /시스템 에러 · 반영 불가/);
  assert.match(host.textContent, /시스템 오류로 반영할 수 없습니다/);
});

test('paginates ten per page and resets the page when the selected submission changes', async () => {
  pages = {
    0: page(
      Array.from({ length: 10 }, (_, index) =>
        example('applied', `batch-${index}`),
      ),
      11,
    ),
    10: page([example('cancelled', 'batch-10')], 11, 10),
  };
  await render();
  assert.equal(host.querySelectorAll('article').length, 10);
  assert.equal(button('이전 이력').disabled, true);
  await click('다음 이력');
  assert.equal(calls.at(-1).offset, 10);
  assert.equal(host.querySelectorAll('article').length, 1);
  assert.equal(button('다음 이력').disabled, true);
  await render({ submissionId: 'different-submission' });
  assert.equal(calls.at(-1).submissionId, 'different-submission');
  assert.equal(calls.at(-1).offset, 0);
  assert.equal(host.querySelectorAll('article').length, 10);
});

test('shows an empty state and supports retrying a transient read failure', async () => {
  failure = new Error('connection reset');
  await render();
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /불러오지 못했습니다/,
  );
  failure = null;
  pages[0] = page([]);
  await click('다시 불러오기');
  assert.match(host.textContent, /이 제출의 재채점 이력이 없습니다/);
  assert.equal(host.querySelector('[role="alert"]'), null);
  assert.equal(interval(), false);
});

test('permission errors do not offer a retry or expose stale unrelated records', async () => {
  failure = new ApiClientError(403, 'scope_denied', 'Denied');
  await render();
  assert.match(host.textContent, /재채점 이력을 볼 권한이 없습니다/);
  assert.equal(button('다시 불러오기'), undefined);
  assert.equal(host.querySelectorAll('article').length, 0);
});

test('losing read access hides cached history and stops its pending timer', async () => {
  pages[0] = page([example('pending')]);
  await render();
  assert.equal(host.querySelectorAll('article').length, 1);
  failure = new ApiClientError(403, 'scope_denied', 'Denied');
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['operator', 'submission-rejudgings'],
    });
  });
  await settle();
  assert.match(host.textContent, /재채점 이력을 볼 권한이 없습니다/);
  assert.equal(host.querySelectorAll('article').length, 0);
  assert.equal(interval(), false);
});
