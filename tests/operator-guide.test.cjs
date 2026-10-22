const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://guide.test/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
let session;
const mocks = {
  '@/utils/Icons': { SvgIcon: () => null },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) => selector({ generalSession: session }),
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => ({
      contest: { title: 'Example' },
      divisions: [],
      participant_count: 0,
    }),
  },
  '@/domains/problemManagement/api': { getOperatorProblems: async () => [] },
  '@/domains/serviceCommunication/api': {
    listOperatorContestNotices: async () => [],
    listOperatorContestQuestions: async () => [],
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
    if (id.endsWith('.css')) return {};
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('./')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const file = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find((file) => fs.existsSync(file));
      if (file)
        return source(path.relative(path.resolve(__dirname, '../src'), file));
    }
    return native(id);
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
const { operatorGuideCategories, searchOperatorGuide } = source(
  'data/operatorGuideContent.ts',
);
const Page = source('pages/operator/OperatorGuidePage.tsx').default;
let host, root, client;
beforeEach(() => {
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  session = {
    account: { email: 'reviewer@test', display_name: 'Reviewer' },
    operatorContests: [],
    operatorSession: {
      accessToken: 'fixture',
      defaultRedirect: '/operator',
      staff: {
        email: 'reviewer@test',
        display_name: 'Reviewer',
        is_service_master: false,
        contest_scopes: { contest: ['contest.view', 'contest.problem.review'] },
      },
    },
  };
  host = document.createElement('div');
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
async function render(query = '') {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: ['/operator/contests/contest/guide' + query] },
          h(
            Routes,
            null,
            h(Route, {
              path: '/operator/contests/:contestId/guide',
              element: h(Page),
            }),
          ),
        ),
      ),
    );
  });
}
function button(text) {
  return [...host.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === text,
  );
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
}

test('guide covers every shipped operator tab and links have unique article identities', () => {
  const expected = [
    '',
    'settings',
    'operators',
    'notices',
    'board',
    'participants',
    'problems',
    'problem-review',
    'submissions',
    'scoreboard',
    'audit-logs',
  ];
  for (const route of expected)
    assert.ok(
      operatorGuideCategories.some((c) => c.route === route),
      route,
    );
  const ids = operatorGuideCategories.flatMap((c) =>
    c.articles.map((a) => a.id),
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 40);
  for (const c of operatorGuideCategories)
    for (const a of c.articles) {
      assert.ok(a.steps.length >= 3);
      assert.ok(a.effect);
    }
});
test('search finds detailed instructions and requires every keyword', () => {
  assert.ok(
    searchOperatorGuide('강제 로그아웃').some(
      (r) => r.article.id === 'force-logout',
    ),
  );
  assert.ok(
    searchOperatorGuide('countdown:freeze').some(
      (r) => r.article.id === 'notice-options',
    ),
  );
  assert.ok(
    searchOperatorGuide('파일 .out').some(
      (r) => r.article.id === 'testcase-files',
    ),
  );
  assert.equal(searchOperatorGuide('없는검색어1000xyz').length, 0);
  assert.equal(searchOperatorGuide('    ').length, 0);
  assert.ok(
    searchOperatorGuide('삭제').some(
      (r) =>
        r.article.id === 'divisions' && r.article.note.includes('유형 삭제'),
    ),
  );
});
test('review-only operators can read the guide without receiving settings controls', async () => {
  await render('?section=settings');
  assert.match(host.textContent, /대회 설정과 참가자 공개 범위/);
  assert.equal(host.querySelector('a[href$="/settings"]'), null);
  assert.ok(host.querySelector('a[href$="/guide"]'));
  assert.match(host.textContent, /해당 관리 화면을 열려면 담당 권한이 필요/);
  assert.equal(host.querySelector('.og-category-header a'), null);
});
test('unauthenticated visitors cannot open the operator guide', async () => {
  session = null;
  await render();
  assert.equal(host.querySelector('.operator-guide'), null);
  assert.ok(host.querySelector('a[href="/login"]'));
});
test('deep links open the requested article without unrelated autoplay controls', async () => {
  await render('?section=participants&article=force-logout');
  const article = host.querySelector('#guide-force-logout');
  assert.equal(
    article.querySelector('h3 button').getAttribute('aria-expanded'),
    'true',
  );
  assert.equal(article.querySelector('[id^="guide-body"]').hidden, false);
  assert.match(article.textContent, /다른 대회의 세션도 영향을/);
  assert.equal(host.querySelector('.og-player'), null);
  assert.equal(host.querySelector('.og-overview-art'), null);
});
test('search result navigation opens its exact category and article', async () => {
  await render('?q=countdown%3Afreeze');
  const result = host.querySelector('.og-search-result');
  assert.ok(result);
  await click(result);
  assert.ok(host.querySelector('#guide-notice-options'));
  assert.equal(
    host
      .querySelector('#guide-notice-options h3 button')
      .getAttribute('aria-expanded'),
    'true',
  );
  assert.equal(host.querySelector('#operator-guide-search').value, '');
});
test('every guide category shows instructions without practice widgets', async () => {
  await render();
  for (const category of operatorGuideCategories) {
    const link = [
      ...host.querySelectorAll('[aria-label="가이드 카테고리"] button'),
    ].find((el) => el.querySelector('strong').textContent === category.label);
    await click(link);
    const content = host.querySelector('.og-content');
    assert.equal(content.getAttribute('aria-label'), category.title);
    assert.equal(
      content.querySelectorAll('.og-article').length,
      category.articles.length,
    );
    assert.equal(
      content.querySelector(
        'form, textarea, dialog, [class*="og-practice"], [aria-label="검수 채점 결과"]',
      ),
      null,
    );
    assert.doesNotMatch(
      content.textContent,
      /연습용 예제|처음부터 다시하기|데이터에만 적용/,
    );
  }
  assert.doesNotMatch(
    host.querySelector('.operator-guide-summary').textContent,
    /조작을 연습|화면 요소로 연습/,
  );
});

test('real execution examples show recorded source, input and measurements without executing code', async () => {
  await render('?section=judge-servers');
  assert.match(
    host.querySelector('.og-runtime-facts').textContent,
    /6대.*5 vCPU.*26GiB/,
  );
  assert.match(host.querySelector('.og-benchmark-metrics').textContent, /33ms/);
  assert.match(host.querySelector('.og-load-selector').textContent, /총 3건/);
  assert.match(host.querySelector('.og-benchmark-code').textContent, /i % 97/);
  const choice = host.querySelector('.og-benchmark-select select');
  await act(async () => {
    choice.value = 'array-python';
    choice.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(
    host.querySelector('.og-benchmark-code').textContent,
    /list\(range\(n\)\)/,
  );
  assert.match(
    host.querySelector('.og-benchmark-metrics').textContent,
    /116ms/,
  );
  assert.match(
    host.querySelector('.og-benchmark-metrics').textContent,
    new RegExp(
      (
        source('data/judgeBenchmark.ts').judgeBenchmark.cases.find(
          (item) => item.id === 'array-python',
        ).loadScenarios[0].memoryKb.max / 1024
      ).toFixed(2) + 'MiB',
    ),
  );
  assert.equal(
    host.querySelectorAll('.og-benchmark-records tbody tr').length,
    3,
  );
  assert.ok(
    host.querySelector(
      'a[download][href="/guides/judge-benchmark-2026-09-26.json"]',
    ),
  );
});

test('downloadable benchmark preserves every displayed measurement and source', () => {
  const { judgeBenchmark } = source('data/judgeBenchmark.ts');
  const download = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../public/guides/judge-benchmark-2026-09-26.json',
      ),
      'utf8',
    ),
  );
  assert.deepEqual(judgeBenchmark, download);
  assert.equal(judgeBenchmark.cases.length, 8);
  for (const example of judgeBenchmark.cases) {
    assert.equal(example.runs.length, 3);
    assert.ok(example.runs.every((run) => run.status === 'accepted'));
  }
  assert.ok(
    searchOperatorGuide('경과 시간').some(
      (result) => result.article.id === 'judge-time-metrics',
    ),
  );
});

test('load selection compares measured execution, queue wait and batch completion without starting work', async () => {
  await render('?section=judge-servers');
  const choice = host.querySelector('.og-benchmark-select select');
  await act(async () => {
    choice.value = 'loop-python';
    choice.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click(button('동시 100건'));
  assert.equal(button('동시 100건').getAttribute('aria-pressed'), 'true');
  assert.match(host.querySelector('.og-load-selector').textContent, /총 300건/);
  const metrics = host.querySelector('.og-benchmark-metrics').textContent;
  assert.match(metrics, /1,018ms/);
  assert.match(metrics, /큐 대기 시간 중앙값6\.95초/);
  assert.match(metrics, /100건 모두 완료.*15\.80초/);
  assert.match(metrics, /300 \/ 300건/);
  assert.equal(host.querySelectorAll('.og-load-comparison tbody tr').length, 3);
  assert.equal(
    host.querySelector('.og-load-selected').dataset.batchSize,
    '100',
  );
  await click(button('동시 10건'));
  assert.match(host.querySelector('.og-load-selector').textContent, /총 30건/);
  assert.match(
    host.querySelector('.og-benchmark-metrics').textContent,
    /969ms/,
  );
  assert.match(
    host.querySelector('.og-benchmark-records').textContent,
    /HTTP 요청 처리 시간/,
  );
  assert.ok(
    host.querySelector(
      'a[download][href="/guides/judge-load-benchmark-2026-09-26.json"]',
    ),
  );
});

test('common environment is described for every node and load summaries match all raw records', () => {
  const { judgeBenchmark } = source('data/judgeBenchmark.ts');
  const { judgeServerGuide } = source('data/judgeServerGuide.ts');
  const environment = judgeServerGuide.articles.find(
    (a) => a.id === 'server-speed',
  );
  const text = JSON.stringify(environment);
  assert.doesNotMatch(text, /03번|07번/);
  assert.match(text, /전체 채점 VM이 같은 실행 환경/);
  assert.match(text, /6대/);
  assert.match(text, /5 vCPU/);
  assert.match(text, /26GiB/);
  assert.match(text, /전체 채점 에이전트 공통/);
  const raw = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../public/guides/judge-load-benchmark-2026-09-26.json',
      ),
      'utf8',
    ),
  );
  assert.equal(raw.batches.length, 72);
  assert.equal(
    raw.batches.reduce((sum, b) => sum + b.samples.length, 0),
    2664,
  );
  const median = (values) => {
    const v = [...values].sort((a, b) => a - b);
    return (
      Math.round(
        ((v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) /
          2) *
          1000,
      ) / 1000
    );
  };
  for (const example of judgeBenchmark.cases) {
    for (const scenario of example.loadScenarios) {
      const batches = raw.batches.filter(
        (b) => b.case_id === example.id && b.batch_size === scenario.batchSize,
      );
      const samples = batches.flatMap((b) => b.samples);
      assert.equal(batches.length, 3);
      assert.equal(samples.length, scenario.sampleCount);
      assert.equal(samples.length, scenario.batchSize * 3);
      assert.equal(
        scenario.statuses.accepted,
        samples.filter((s) => s.status === 'accepted').length,
      );
      assert.ok(batches.every((b) => b.other_jobs_observed === 0));
      for (const [field, stats] of [
        ['runtime_ms', scenario.runtimeMs],
        ['queue_wait_ms', scenario.queueWaitMs],
        ['completion_ms', scenario.completionMs],
        ['memory_kb', scenario.memoryKb],
      ]) {
        const values = samples.map((s) => s[field]).sort((a, b) => a - b);
        assert.equal(stats.min, values[0]);
        assert.equal(stats.max, values.at(-1));
        assert.ok(
          Math.abs(stats.median - median(values)) <= 0.00101,
          `${example.id} ${scenario.batchSize}: median rounding`,
        );
        assert.equal(stats.p95, values[Math.ceil(values.length * 0.95) - 1]);
      }
      assert.equal(
        scenario.batchCompletionMs.median,
        median(
          batches.map((b) =>
            Math.max(...b.samples.map((s) => s.completion_ms)),
          ),
        ),
      );
      assert.ok(
        samples.every(
          (s) => s.completion_ms >= s.queue_wait_ms && !s.reassigned,
        ),
      );
    }
  }
});

test('operator guide separates the planned VM allocation from historical benchmarks', () => {
  const { judgeInfrastructure: config } = source('data/judgeInfrastructure.ts');
  const archived = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../public/guides/judge-environment-2026-10-16.json',
      ),
      'utf8',
    ),
  );
  assert.deepEqual(config, archived);
  assert.equal(config.vm.planned_count, 6);
  assert.equal(config.vm.vcpus_per_agent, 5);
  assert.equal(config.vm.memory_gib_per_agent, 26);
  assert.equal(
    config.agent_configuration.submission_slots *
      config.agent_configuration.testcases_parallel_per_submission,
    4,
  );
  const guide = source('data/judgeServerGuide.ts').judgeServerGuide;
  const measured = guide.articles.find((a) => a.id === 'judge-hundred-million');
  assert.equal(measured.table.rows.length, 36);
  const current = source('data/judgeTimeBenchmark.ts').judgeTimeBenchmark;
  const memory = current.cases.find(
    (c) => c.profile === 'pointer' && c.language === 'cpp17',
  );
  assert.ok(
    JSON.stringify(measured).includes(
      (memory.serialMaxMs / 1000).toFixed(3) + '초',
    ),
  );
  assert.match(JSON.stringify(measured), /ZOJ 실행 정책 v1/);
  assert.match(JSON.stringify(measured), /isolate CPU 시간/);
  assert.match(JSON.stringify(measured), /보장 상한이 아닙니다/);
  assert.match(
    JSON.stringify(
      guide.articles.find((a) => a.id === 'judge-tle-investigation'),
    ),
    /estimate_runtime/,
  );
});
