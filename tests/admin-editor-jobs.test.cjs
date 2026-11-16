const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { URL } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/admin/judge?view=editor-jobs',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
} = require('@tanstack/react-query');
const { MemoryRouter } = require('react-router-dom');
const h = React.createElement;
const NOW = Date.parse('2026-11-17T03:00:00Z');
let records, requests, respond, host, root, client;
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (/\.(png|svg)$/.test(id))
      return { __esModule: true, default: '/fixture-asset' };
    if (id === '@/shared/api/client')
      return {
        apiRequest: async (url, token, init) => {
          requests.push({
            url,
            token,
            method: init?.method ?? 'GET',
            body: init?.body,
          });
          assert.equal(
            init?.method ?? 'GET',
            'GET',
            'History must remain read-only',
          );
          return respond(new URL(url, 'https://judge.test'));
        },
      };
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file))),
    );
  };
  modules.set(filename, loaded);
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
const History = source('components/admin/EditorJobHistory.tsx').default;
const { listAdminEditorJobs, getAdminEditorJob, editorJobDate } = source(
  'domains/auditMonitoring/editorJobs.ts',
);
const { ApiClientError } = source('shared/api/errors.ts');

function job(index, overrides = {}) {
  return {
    id: `job-${index}`,
    problem: {
      id: `problem-${index}`,
      slug: `problem-${index}`,
      name: `문제 ${index}`,
      deleted: false,
    },
    requester: {
      id: `requester-${index}`,
      display_name: `요청자 ${index}`,
      email: `fixture-${index}@example.test`,
      handle: `user${index}`,
    },
    kind: 'verify',
    category: 'verify',
    status: 'completed',
    revision: index + 1,
    workspace_version: index + 10,
    created_at: NOW / 1000 - 125 - index,
    started_at: NOW / 1000 - 100 - index,
    finished_at: NOW / 1000 - 80 - index,
    outcome: {
      execution: 'completed',
      assessment: {
        status: 'passed',
        code: 'expectations_match',
        counts: { total: 5, passed: 5, failed: 0, unconfirmed: 0 },
      },
    },
    options: { name: `실행 ${index}` },
    result: { summary: `실행 결과 ${index}`, progress: 100 },
    ...overrides,
  };
}
function page(items, total = items.length, current = 1) {
  return {
    items,
    total,
    page: current,
    page_size: 20,
    pages: Math.ceil(total / 20),
  };
}
function server(url) {
  const prefix = '/admin/judge/editor-jobs';
  if (url.pathname !== prefix) {
    assert.ok(url.pathname.startsWith(prefix + '/'));
    const id = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    return records.find((item) => item.id === id);
  }
  const params = url.searchParams;
  const filtered = records.filter(
    (item) =>
      (!params.get('category') || item.category === params.get('category')) &&
      (!params.get('status') || item.status === params.get('status')) &&
      (!params.get('q') ||
        `${item.problem?.name} ${item.requester?.display_name}`.includes(
          params.get('q'),
        )),
  );
  const current = Number(params.get('page'));
  assert.equal(params.get('page_size'), '20');
  return page(
    filtered.slice((current - 1) * 20, current * 20),
    filtered.length,
    current,
  );
}
beforeEach(() => {
  requests = [];
  records = Array.from({ length: 47 }, (_, index) => job(index));
  respond = server;
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, placeholderData: keepPreviousData },
    },
  });
});
afterEach(async () => {
  assert.ok(
    requests.every(
      (request) => request.method === 'GET' && request.body == null,
    ),
  );
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => dom.window.close());
async function settle() {
  await act(
    async () => new Promise((resolve) => window.setTimeout(resolve, 20)),
  );
}
async function render(token = 'master-token') {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, null, h(History, { token })),
      ),
    ),
  );
  await settle();
}
function button(label, scope = host) {
  return [...scope.querySelectorAll('button')].find(
    (node) => node.textContent.trim() === label,
  );
}
async function click(label, scope = host) {
  const control = button(label, scope);
  assert.ok(control, label);
  await act(async () => control.click());
  await settle();
}
const dialog = () =>
  document.querySelector('dialog[aria-label="에디터 작업 상세"]');
const lastListRequest = () =>
  requests.findLast(
    (request) =>
      new URL(request.url, 'https://judge.test').pathname ===
      '/admin/judge/editor-jobs',
  );
async function select(label, value) {
  const element = host.querySelector(`select[aria-label="${label}"]`);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await settle();
}
async function search(text) {
  const input = host.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  await settle();
}
async function refresh() {
  await act(async () =>
    client.invalidateQueries({ queryKey: ['admin', 'editor-jobs'] }),
  );
  await settle();
}

test('API query parameters use read-only GET, fixed 20 rows and escaped search and job IDs', async () => {
  respond = () => page([]);
  await listAdminEditorJobs('master-token', {
    page: 3,
    q: '구간 & 이름',
    category: 'verify-single',
    status: 'running',
  });
  const url = new URL(requests[0].url, 'https://judge.test');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    page: '3',
    page_size: '20',
    q: '구간 & 이름',
    category: 'verify-single',
    status: 'running',
  });
  await listAdminEditorJobs('master-token', {
    page: 1,
    q: '',
    category: 'all',
    status: 'all',
  });
  assert.deepEqual(
    Object.fromEntries(
      new URL(requests[1].url, 'https://judge.test').searchParams,
    ),
    { page: '1', page_size: '20' },
  );
  await getAdminEditorJob('master-token', 'id/with ?&');
  assert.equal(requests[2].url, '/admin/judge/editor-jobs/id%2Fwith%20%3F%26');
  assert.ok(requests.every((request) => request.token === 'master-token'));
});

test('total means all matching jobs while each page contains only 20', async () => {
  await render();
  assert.match(host.textContent, /검색 결과 47건/);
  assert.equal(host.querySelectorAll('tbody tr').length, 20);
  assert.match(host.textContent, /1 \/ 3 페이지/);
  await click('다음');
  assert.match(host.textContent, /검색 결과 47건/);
  assert.equal(host.querySelectorAll('tbody tr').length, 20);
  assert.equal(
    new URL(lastListRequest().url, 'https://judge.test').searchParams.get(
      'page',
    ),
    '2',
  );
  await click('다음');
  assert.equal(host.querySelectorAll('tbody tr').length, 7);
  assert.match(host.textContent, /3 \/ 3 페이지/);
  assert.equal(button('다음').disabled, true);
});

test('search, category and status each return to page one and preserve combined filters', async () => {
  await render();
  await click('다음');
  await search('  문제 1  ');
  let params = new URL(lastListRequest().url, 'https://judge.test')
    .searchParams;
  assert.equal(params.get('page'), '1');
  assert.equal(params.get('q'), '문제 1');
  await search('');
  await click('다음');
  await select('에디터 작업 종류', 'verify');
  params = new URL(lastListRequest().url, 'https://judge.test').searchParams;
  assert.equal(params.get('page'), '1');
  assert.equal(params.get('category'), 'verify');
  await click('다음');
  await select('에디터 실행 상태', 'completed');
  params = new URL(lastListRequest().url, 'https://judge.test').searchParams;
  assert.equal(params.get('page'), '1');
  assert.equal(params.get('category'), 'verify');
  assert.equal(params.get('status'), 'completed');
  await search('요청자 2');
  params = new URL(lastListRequest().url, 'https://judge.test').searchParams;
  assert.equal(params.get('q'), '요청자 2');
  assert.equal(params.get('category'), 'verify');
  assert.equal(params.get('status'), 'completed');
});

test('loading, failed reads, empty results and manual retry stay distinguishable', async () => {
  let resolve;
  respond = () =>
    new Promise((done) => {
      resolve = done;
    });
  await render();
  assert.match(host.textContent, /에디터 작업 내역을 불러오는 중/);
  assert.equal(button('다음').disabled, true);
  await act(async () => resolve(page([])));
  await settle();
  assert.match(host.textContent, /조건에 맞는 에디터 작업이 없습니다/);
  assert.match(host.textContent, /검색 결과 0건/);
  respond = () => {
    throw new Error('fixture network failure');
  };
  await refresh();
  assert.ok(host.querySelector('[role="alert"]'));
  assert.match(host.textContent, /잠시 후 다시 불러와 주세요/);
  respond = server;
  await click('새로고침');
  assert.equal(host.querySelector('[role="alert"]'), null);
  assert.match(host.textContent, /검색 결과 47건/);
});

test('changing filters never shows rows or totals from the preceding condition while waiting', async () => {
  await render();
  assert.match(host.querySelector('tbody').textContent, /요청자 0/);
  let resolve;
  respond = () =>
    new Promise((done) => {
      resolve = done;
    });
  await select('에디터 작업 종류', 'stress');
  assert.match(host.querySelector('tbody').textContent, /불러오는 중/);
  assert.doesNotMatch(host.querySelector('tbody').textContent, /요청자 0/);
  assert.doesNotMatch(host.textContent, /검색 결과 47건/);
  await act(async () => resolve(page([])));
  await settle();
  assert.match(host.textContent, /검색 결과 0건/);
});

test('a different selected job never displays the previously inspected detail while loading', async () => {
  await render();
  await click('자세히');
  assert.match(dialog().textContent, /실행 결과 0/);
  await act(async () => dialog().querySelector('[aria-label="닫기"]').click());
  let resolve;
  respond = (url) =>
    url.pathname.endsWith('/job-1')
      ? new Promise((done) => {
          resolve = done;
        })
      : server(url);
  await act(async () => host.querySelectorAll('tbody button')[1].click());
  await settle();
  assert.match(dialog().textContent, /작업 상세를 불러오는 중/);
  assert.doesNotMatch(dialog().textContent, /실행 결과 0|요청자 0/);
  await act(async () => resolve(records[1]));
  await settle();
  assert.match(dialog().textContent, /실행 결과 1/);
  assert.doesNotMatch(dialog().textContent, /실행 결과 0/);
});

test('running jobs show progress and become assessed results in the row and open detail', async () => {
  records = [
    job(0, {
      status: 'running',
      outcome: undefined,
      finished_at: null,
      result: { progress: 37 },
    }),
  ];
  await render();
  assert.equal(
    host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '37',
  );
  await click('자세히');
  assert.equal(
    dialog()
      .querySelector('[role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '37',
  );
  const detailQuery = client
    .getQueryCache()
    .getAll()
    .find((query) => query.queryKey[1] === 'editor-job');
  assert.equal(detailQuery.options.refetchInterval(detailQuery), 1500);
  records = [job(0)];
  await refresh();
  await act(async () =>
    client.invalidateQueries({ queryKey: ['admin', 'editor-job'] }),
  );
  await settle();
  assert.equal(host.querySelector('[role="progressbar"]'), null);
  assert.equal(dialog().querySelector('[role="progressbar"]'), null);
  assert.match(dialog().textContent, /예상 일치/);
  assert.equal(detailQuery.options.refetchInterval(detailQuery), false);
});

test('UTC Unix seconds produce an ISO date and a readable relative time', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  records = [job(0)];
  await render();
  const time = host.querySelector('tbody time');
  assert.equal(
    time.dateTime,
    new Date(records[0].created_at * 1000).toISOString(),
  );
  assert.match(time.textContent, /2분 전/);
  assert.doesNotMatch(time.textContent, /1970/);
  assert.equal(editorJobDate(null), undefined);
  assert.equal(editorJobDate(Number.NaN), undefined);
  assert.equal(editorJobDate(Number.POSITIVE_INFINITY), undefined);
  assert.equal(editorJobDate(0), '1970-01-01T00:00:00.000Z');
});

test('sanitized settings and results remain escaped text in collapsed JSON details', async () => {
  records = [
    job(0, {
      options: {
        name: 'redacted fixture',
        note: '<img src=x onerror=alert(1)>',
        credential: '[redacted]',
      },
      result: {
        summary: '결과 요약',
        command: '[omitted]',
        output: '<script>throw 1</script>',
      },
    }),
  ];
  await render();
  await click('자세히');
  const settings = dialog().querySelector('[aria-label="실행 설정 데이터"]');
  const results = dialog().querySelector(
    '[aria-label="상세 실행 결과 데이터"]',
  );
  assert.equal(
    settings.textContent,
    JSON.stringify(records[0].options, null, 2),
  );
  assert.equal(results.textContent, JSON.stringify(records[0].result, null, 2));
  assert.equal(settings.closest('details').open, false);
  assert.equal(results.closest('details').open, false);
  assert.equal(dialog().querySelector('script,img'), null);
});

test('a denied refresh removes cached administrator list and detail identity', async () => {
  await render();
  await click('자세히');
  respond = () => {
    throw new ApiClientError(403, 'permission_denied', 'fixture denied');
  };
  await act(async () => client.invalidateQueries({ queryKey: ['admin'] }));
  await settle();
  assert.doesNotMatch(
    host.querySelector('tbody').textContent,
    /요청자 0|문제 0/,
  );
  assert.doesNotMatch(dialog().textContent, /요청자 0|문제 0|실행 결과 0/);
  assert.ok(dialog().querySelector('[role="alert"]'));
});

test('solution result rows explain expected and observed verdicts with bounded result notices', async () => {
  records = [
    job(0, {
      name: '전체 풀이 검증',
      result_truncated: true,
      result_redacted: true,
      result: {
        summary: '풀이별 검증 완료',
        solutions: [
          {
            name: 'accepted.cpp',
            tag: 'OK',
            observed_verdicts: ['AC'],
            matched: true,
            completed_tests: 15,
            total_tests: 15,
            max_cpu_ms: 1250,
            max_memory_kb: 22000,
          },
          {
            name: 'slow.py',
            tag: 'WA',
            observed_verdicts: ['TLE', 'WA'],
            matched: false,
            completed_tests: 6,
            total_tests: 15,
          },
          { name: '<script>unsafe.cpp</script>', tag: 'NEW_VERDICT' },
          null,
          'invalid entry',
        ],
      },
    }),
  ];
  await render();
  assert.match(host.querySelector('tbody').textContent, /전체 풀이 검증/);
  await click('자세히');
  const section = dialog().querySelector('[aria-label="풀이별 실행 결과"]');
  const rows = section.querySelectorAll('tbody tr');
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /accepted.cpp.*정답.*정답.*예상 일치/);
  assert.match(rows[0].textContent, /15 \/ 15개 검사.*1,250 ms.*22 MB/);
  assert.match(rows[1].textContent, /오답.*시간 초과 · 오답.*예상 불일치/);
  assert.match(rows[2].textContent, /NEW_VERDICT.*미확인/);
  assert.equal(section.querySelector('script'), null);
  assert.match(dialog().textContent, /결과가 많아 일부 항목만 표시합니다/);
});
