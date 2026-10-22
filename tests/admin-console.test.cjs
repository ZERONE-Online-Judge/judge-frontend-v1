const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, useNavigate, useLocation } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
let session,
  rows,
  calls,
  createFailure,
  listFailure,
  root,
  host,
  client,
  navigate,
  location,
  invalidations,
  visible;
const cache = new Map();
const serviceApi = {
  listAdminServiceNotices: async () => {
    if (listFailure) throw listFailure;
    return [...rows];
  },
  listAdminContactInquiries: async () => [],
  createAdminServiceNotice: async (token, payload) => {
    calls.push({ type: 'create', token, payload });
    if (createFailure) throw createFailure;
    const notice = {
      ...payload,
      service_notice_id: 'created',
      published_at: '2026-10-23T00:00:00Z',
    };
    rows.unshift(notice);
    return notice;
  },
  deleteAdminServiceNotice: async (id, token) => {
    calls.push({ type: 'delete', id, token });
    rows = rows.filter((row) => row.service_notice_id !== id);
    return { service_notice_id: id, deleted: true };
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
    if (id.endsWith('.css')) return {};
    if (id === '@/domains/identityAccess/sessionStore')
      return {
        useSessionStore: (selector) => selector({ generalSession: session }),
      };
    if (id === '@/domains/identityAccess/queryIdentity')
      return { tokenQueryIdentity: () => session?.account.email ?? 'none' };
    if (id === '@/shared/hooks/useDocumentVisibility')
      return { __esModule: true, default: () => visible };
    if (id === '@/domains/serviceCommunication/api') return serviceApi;
    if (id === '@/domains/contestAdministration/api')
      return {
        getAdminContests: async () => [],
        getAdminContestDivisions: async () => [],
      };
    if (id === '@/domains/usageAnalytics/api')
      return {
        getUsageReport: async () => ({
          generated_at: '2026-10-23T00:00:00Z',
          timezone: 'Asia/Seoul',
          retention_days: 90,
          first_event_at: null,
          period: { start: '2026-10-17', end: '2026-10-23', interval: 'day' },
          filters: { contest_id: null, service: null, audience: 'all' },
          summary: {
            views: 0,
            visitors: 0,
            visits: 0,
            signed_in_users: 0,
            active_seconds: 0,
            active_visitors: 0,
            returning_visitors: 0,
            new_visitors: 0,
            average_active_seconds: 0,
          },
          previous: {
            views: 0,
            visitors: 0,
            visits: 0,
            signed_in_users: 0,
            active_seconds: 0,
          },
          comparison_available: false,
          timeline: [],
          hours: [],
          heatmap: [],
          services: [],
          pages: [],
          audiences: [],
          devices: [],
          browsers: [],
          referrers: [],
          contests: [],
          operations: {
            submissions: 0,
            questions: 0,
            login_successes: 0,
            login_failures: 0,
            session_conflicts: 0,
            operation_failures: 0,
            average_judge_seconds: null,
            outcomes: [],
            languages: [],
            submission_kinds: [],
          },
        }),
      };
    if (id === '@/domains/auditMonitoring/api')
      return {
        getAdminDashboard: async () => ({
          contest_count: 3,
          pending_jobs: 2,
          judge_node_count: 6,
          active_judge_node_count: 6,
          mail_queue_pending: 0,
        }),
        getAdminJudgeDashboard: async () => ({
          nodes: [],
          queue: [],
          queue_stats: { pending_count: 0, running_count: 0 },
        }),
        listAdminJudgeSubmissions: async () => {
          calls.push({ type: 'submissions' });
          return { data: [], page: {} };
        },
      };
    if (id === '@/shared/ui/ModalDialog')
      return {
        __esModule: true,
        default: ({ title, children, footer, onClose }) =>
          h(
            'section',
            { role: 'dialog', 'aria-label': title },
            h('h2', null, title),
            children,
            footer,
            onClose && h('button', { onClick: onClose }, '닫기'),
          ),
        ModalButton: ({ children, tone, ...props }) =>
          h('button', props, children),
      };
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file))),
    );
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
const Notices = source('pages/admin/AdminNoticesPage.tsx').default;
const Home = source('pages/admin/AdminHomePage.tsx').default;
const Contests = source('pages/admin/AdminContestsPage.tsx').default;
const Judge = source('pages/admin/AdminJudgePage.tsx').default;
const Analytics = source('pages/admin/AdminAnalyticsPage.tsx').default;
const draftKey = 'zoj.admin.notice-draft:master@judge.test';
function Observer() {
  navigate = useNavigate();
  location = useLocation();
  return null;
}
function admin(email = 'master@judge.test') {
  return {
    account: { email },
    operatorContests: [],
    participantContests: [],
    operatorSession: {
      accessToken: 'master',
      staff: {
        email,
        display_name: '관리자',
        is_service_master: true,
        contest_scopes: {},
      },
    },
  };
}
beforeEach(() => {
  session = admin();
  visible = true;
  calls = [];
  invalidations = [];
  createFailure = null;
  listFailure = null;
  window.sessionStorage.clear();
  rows = Array.from({ length: 25 }, (_, i) => ({
    service_notice_id: `n${i + 1}`,
    title: `안내 ${i + 1}`,
    summary: `요약 ${i + 1}`,
    body: i === 24 ? '검색어 needle' : '안내 본문',
    emergency: i === 24,
    published_at: new Date(Date.UTC(2026, 9, 25 - i)).toISOString(),
  }));
  document.body.innerHTML = '<div id="test"></div>';
  host = document.getElementById('test');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (options) => {
    invalidations.push(options.queryKey);
    return invalidate(options);
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
});
after(() => dom.window.close());
async function flush() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 12)));
}
async function render(Page = Notices, url = '/admin/notices/new') {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: [url] }, h(Observer), h(Page)),
      ),
    ),
  );
  await flush();
}
async function click(el) {
  assert.ok(el);
  await act(async () => el.click());
  await flush();
}
function button(label, within = host) {
  return [...within.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === label,
  );
}
async function fill(el, value) {
  assert.ok(el);
  await act(() => {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(
      new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}
async function write() {
  await fill(host.querySelector('.admin-notice-title-input'), '  점검 안내  ');
  await fill(
    host.querySelector('#admin-notice-body'),
    '  안내 내용\n둘째 줄  ',
  );
}
function sectionTab(label) {
  return [...host.querySelectorAll('.admin-section-tabs button')].find(
    (el) => el.textContent === label,
  );
}

test('all admin sections have independent navigation and dashboard has no notice editor', async () => {
  await render(Home, '/admin');
  const nav = host.querySelector('[aria-label="관리자 메뉴"]');
  assert.equal(nav.querySelectorAll('a').length, 7);
  assert.equal(
    nav.querySelector('a[aria-current="page"]').getAttribute('href'),
    '/admin',
  );
  assert.ok(nav.querySelector('a[href="/admin/notices"]'));
  assert.ok(
    nav.querySelector('.admin-navigation-link.is-active[aria-current="page"]'),
  );
  assert.equal(host.querySelector('textarea'), null);
  assert.match(host.textContent, /최근 서비스 공지/);
  assert.ok(host.querySelector('a[href="/admin/contests?view=create"]'));
});
test('admin gate still excludes anonymous and non-master accounts', async () => {
  session = null;
  await render();
  assert.equal(host.querySelector('form'), null);
  assert.ok(host.querySelector('a[href="/login"]'));
  session = admin();
  session.operatorSession.staff.is_service_master = false;
  await act(() => root.render(h(MemoryRouter, null, h(Notices))));
  assert.equal(host.querySelector('form'), null);
  assert.equal(host.querySelector('[aria-label="관리자 메뉴"]'), null);
});
test('contest tasks are separate and selected tabs survive browser back navigation', async () => {
  await render(Contests, '/admin/contests');
  assert.equal(host.querySelectorAll('form').length, 0);
  await click(sectionTab('대회 생성'));
  assert.match(location.search, /view=create/);
  assert.ok(host.querySelector('form'));
  assert.doesNotMatch(host.textContent, /대회 목록을 불러오는/);
  await click(sectionTab('마스터 배정'));
  assert.match(location.search, /view=masters/);
  assert.match(host.querySelector('form').textContent, /운영자 이메일|이메일/);
  await act(() => navigate(-1));
  assert.equal(sectionTab('대회 생성').getAttribute('aria-pressed'), 'true');
});
test('judge nodes, queue and submissions are distinct and inactive submissions do not poll', async () => {
  await render(Judge, '/admin/judge');
  assert.equal(calls.filter((c) => c.type === 'submissions').length, 0);
  assert.ok(
    [...host.querySelectorAll('h2')].some((h) => h.textContent === '채점 노드'),
  );
  await click(sectionTab('작업 큐'));
  assert.match(host.textContent, /대기 중인 작업이 없습니다/);
  assert.equal(calls.length, 0);
  await click(sectionTab('제출 내역'));
  assert.equal(calls.filter((c) => c.type === 'submissions').length, 1);
  assert.match(host.textContent, /최근 제출/);
  assert.equal(host.querySelectorAll('details').length, 0);
});
test('editor preserves per-account drafts, line breaks and safe literal text without publishing', async () => {
  await render();
  await write();
  await fill(
    host.querySelector('#admin-notice-body'),
    '<script>alert(1)</script>\n둘째 줄',
  );
  assert.equal(calls.length, 0);
  assert.equal(host.querySelector('.admin-notice-preview script'), null);
  assert.match(
    host.querySelector('.admin-preview-body').textContent,
    /<script>/,
  );
  assert.equal(
    JSON.parse(window.sessionStorage.getItem(draftKey)).title,
    '  점검 안내  ',
  );
  await act(() => navigate('/admin/notices'));
  await flush();
  await act(() => navigate('/admin/notices/new'));
  await flush();
  assert.equal(
    host.querySelector('.admin-notice-title-input').value,
    '  점검 안내  ',
  );
  assert.equal(
    source('components/admin/noticeDraft.ts').loadNoticeDraft(
      'zoj.admin.notice-draft:another@judge.test',
    ).body,
    '',
  );
});
test('body tools insert plain text at the cursor and preview remains compatible with public notices', async () => {
  await render();
  await fill(host.querySelector('#admin-notice-body'), '앞\n뒤');
  const body = host.querySelector('#admin-notice-body');
  body.setSelectionRange(2, 2);
  await click(button('글머리표'));
  assert.equal(body.value, '앞\n• 항목\n뒤');
  assert.equal(calls.length, 0);
  await click(sectionTab('미리보기'));
  assert.equal(host.querySelector('.admin-editor').hidden, true);
  assert.match(host.querySelector('.admin-preview-body').textContent, /• 항목/);
});
test('publishing validates fields, requires a final review and cancellation preserves the draft', async () => {
  await render();
  await click(button('발행 전 확인'));
  assert.match(host.querySelector('[role=alert]').textContent, /제목과 본문/);
  assert.equal(calls.length, 0);
  await write();
  await click(button('발행 전 확인'));
  const dialog = host.querySelector('[role=dialog]');
  assert.ok(dialog);
  assert.equal(calls.length, 0);
  assert.match(dialog.textContent, /점검 안내/);
  await click(button('돌아가기', dialog));
  assert.equal(host.querySelector('[role=dialog]'), null);
  assert.ok(window.sessionStorage.getItem(draftKey));
  assert.equal(calls.length, 0);
});
test('confirmed publishing sends the selected notice kind, clears draft and refreshes both lists', async () => {
  await render();
  await write();
  await fill(
    host.querySelector('.admin-field input:not(.admin-notice-title-input)'),
    '  짧은 요약  ',
  );
  await click(host.querySelectorAll('input[name="notice-kind"]')[1]);
  await click(button('발행 전 확인'));
  await click(button('공지 발행', host.querySelector('[role=dialog]')));
  assert.deepEqual(
    calls.filter((c) => c.type === 'create'),
    [
      {
        type: 'create',
        token: 'master',
        payload: {
          title: '점검 안내',
          body: '안내 내용\n둘째 줄',
          summary: '짧은 요약',
          emergency: true,
        },
      },
    ],
  );
  assert.equal(window.sessionStorage.getItem(draftKey), null);
  assert.equal(location.pathname, '/admin/notices');
  assert.match(location.search, /notice=created/);
  assert.ok(
    invalidations.some(
      (key) => key[0] === 'admin' && key[1] === 'service-notices',
    ),
  );
  assert.ok(invalidations.some((key) => key[0] === 'public-service-notices'));
});
test('failed publishing keeps content and can be retried without losing the draft', async () => {
  createFailure = new Error('offline');
  await render();
  await write();
  await click(button('발행 전 확인'));
  await click(button('공지 발행', host.querySelector('[role=dialog]')));
  assert.equal(calls.length, 1);
  assert.ok(host.querySelector('[role=alert]'));
  assert.equal(
    host.querySelector('#admin-notice-body').value,
    '  안내 내용\n둘째 줄  ',
  );
  assert.ok(window.sessionStorage.getItem(draftKey));
  createFailure = null;
  await click(button('공지 발행', host.querySelector('[role=dialog]')));
  assert.equal(calls.length, 2);
  assert.equal(location.pathname, '/admin/notices');
});
test('notice list deep links, filters and bounded pagination work together', async () => {
  await render(Notices, '/admin/notices?notice=n25');
  assert.equal(host.querySelectorAll('.admin-notice-row').length, 5);
  assert.match(
    host.querySelector('.admin-notice-expanded').textContent,
    /needle/,
  );
  await fill(host.querySelector('[aria-label="공지 검색"]'), 'needle');
  assert.equal(host.querySelectorAll('.admin-notice-row').length, 1);
  assert.match(location.search, /q=needle/);
  await fill(host.querySelector('select[aria-label="공지 유형"]'), 'general');
  assert.equal(host.querySelectorAll('.admin-notice-row').length, 0);
  assert.match(host.textContent, /검색 조건에/);
});
test('notice deletion requires confirmation and cancelled deletion leaves the record intact', async () => {
  await render(Notices, '/admin/notices');
  await click(button('삭제'));
  await click(button('취소', host.querySelector('[role=dialog]')));
  assert.equal(calls.length, 0);
  await click(button('삭제'));
  await click(button('삭제', host.querySelector('[role=dialog]')));
  assert.deepEqual(calls, [{ type: 'delete', id: 'n1', token: 'master' }]);
  assert.equal(rows.length, 24);
  assert.match(host.querySelector('[role=status]').textContent, /삭제했습니다/);
});
test('notice load failure stays distinct from empty records', async () => {
  listFailure = new Error('offline');
  await render(Notices, '/admin/notices');
  assert.ok(host.querySelector('[role=alert]'));
  assert.doesNotMatch(host.textContent, /아직 발행한 공지가 없습니다/);
});

test('analytics renders empty time-series reports without crashing the admin workspace', async () => {
  await render(Analytics, '/admin/analytics');
  assert.equal(host.querySelector('h1').textContent, '운영 통계');
  assert.ok(host.querySelector('.analytics-empty'));
  assert.match(host.textContent, /선택한 범위에 기록이 없습니다/);
});
