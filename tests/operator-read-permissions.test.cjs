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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
const divisions = [
  { division_id: 'division', name: '일반부', code: 'general' },
];
const problem = {
  problem_id: 'problem',
  division_id: 'division',
  problem_code: 'A',
  title: '필터 문제',
};
const team = {
  participant_team_id: 'team',
  division_id: 'division',
  team_name: '필터 팀',
};
const submission = {
  submission_id: 'submission-one',
  problem_id: 'problem',
  participant_team_id: 'team',
  team_name: '필터 팀',
  member_name: '제출자',
  member_email: 'member@test',
  language: 'cpp',
  status: 'wrong_answer',
  submitted_at: '2026-09-22T00:00:00Z',
  runtime_ms: 12,
  memory_kb: 1024,
  failed_testcase_order: 2,
};
let session,
  reads,
  location,
  submissionItems,
  detailOverrides,
  noticeItems,
  questionItems;
function withScopes(scopes) {
  return {
    account: { email: 'staff@test' },
    operatorContests: [],
    operatorSession: {
      accessToken: 'token',
      staff: {
        email: 'staff@test',
        is_service_master: false,
        contest_scopes: { contest: ['contest.view', ...scopes] },
      },
    },
  };
}
function record(kind, args = {}) {
  reads.push({ kind, ...args });
}
function requests(kind) {
  return reads.filter((request) => request.kind === kind);
}
const mocks = {
  '@/utils/Icons': { SvgIcon: () => null },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => token,
  },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) => selector({ generalSession: session }),
  },
  '@/shared/ui/AnimatedNumber': { default: ({ value }) => String(value ?? 0) },
  '@/components/contest/problem/ProblemStatementPanel': {
    default: ({ problem }) => h('article', null, problem.statement),
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => {
      record('dashboard');
      return {
        contest: {
          contest_id: 'contest',
          title: '권한 대회',
          start_at: '2026-09-22T00:00:00Z',
          end_at: '2026-09-22T10:00:00Z',
          freeze_at: '2026-09-22T09:00:00Z',
        },
        divisions,
        participant_count: 1,
        submission_count: 1,
        pending_jobs: 0,
        participant_count_by_division: { division: 1 },
      };
    },
  },
  '@/domains/problemManagement/api': {
    getOperatorProblems: async () => {
      record('problems');
      return [{ ...problem, statement: '출제진에게만 보이는 문제 본문' }];
    },
  },
  '@/domains/teamParticipation/api': {
    listParticipantTeams: async () => {
      record('participants');
      return [
        {
          ...team,
          status: 'active',
          members: [
            {
              team_member_id: 'leader',
              name: '비공개 팀장',
              email: 'leader@test',
              role: 'leader',
            },
          ],
        },
      ];
    },
  },
  '@/domains/serviceCommunication/api': {
    listOperatorContestNotices: async () => {
      record('notices');
      return noticeItems;
    },
    listOperatorContestQuestions: async () => {
      record('questions');
      return questionItems;
    },
  },
  '@/domains/submissionScoreboard/api': {
    listRejudgings: async () => ({ batches: [], total: 0 }),
    getOperatorSubmissionFilters: async (contestId, token) => {
      record('filters', { contestId, token });
      return { problems: [problem], teams: [team] };
    },
    listOperatorSubmissionsPage: async (contestId, token, filters) => {
      record('submissions', { contestId, token, filters });
      const filtered = filters.submissionKind
        ? submissionItems.filter(
            (item) =>
              (item.submission_kind ?? 'participant') ===
              filters.submissionKind,
          )
        : submissionItems;
      const offset = Number(filters.cursor ?? 0);
      const end = offset + filters.limit;
      return {
        data: filtered.slice(offset, end),
        page: {
          total_count: filtered.length,
          current_cursor: filters.cursor ?? null,
          next_cursor: end < filtered.length ? String(end) : null,
        },
      };
    },
    getOperatorSubmission: async (contestId, submissionId, token) => {
      record('detail', { contestId, submissionId, token });
      return {
        ...submissionItems.find((item) => item.submission_id === submissionId),
        source_code: 'int main() { return 0; }',
        compile_message: '컴파일 성공',
        judge_message:
          'testcase #2 (2.in / 2.out): wrong answer\n[input]\n1 2\n[expected]\n3\n[actual]\n0',
        ...detailOverrides,
      };
    },
    waitOperatorSubmissionStatus: async () => {
      record('wait');
      return submission;
    },
  },
  '@/domains/auditMonitoring/api': {
    listAdminOperationalAuditLogs: async () => ({
      data: [],
      page: { total_count: 0, next_cursor: null },
    }),
    listMailDeliveryLogs: async (token, filters, contestId) => {
      record('mail', { token, filters, contestId });
      const empty = filters.q === 'missing';
      return {
        data: empty
          ? []
          : [
              {
                mail_queue_id: 'mail-one',
                recipient_email: 'recipient@test',
                contest_id: contestId ?? null,
                contest_title: contestId ? '권한 대회' : null,
                mail_type: 'participant_invited',
                subject: '대회 초대 안내',
                status: filters.status || 'sent',
                created_at: '2026-09-22T00:00:00Z',
                sent_at: null,
                last_attempt_at: null,
              },
            ],
        page: {
          total_count: empty ? 0 : 51,
          next_cursor: empty || filters.cursor ? null : 'mail-page-2',
        },
      };
    },
    listOperatorAccessLogs: async (contestId, token, filters) => {
      record('access', { contestId, token, filters });
      return {
        data: [
          {
            access_log_id: 'access',
            email: 'participant@test',
            member_name: '참가자',
            contest_id: 'contest',
            account_scope: 'participant',
            actor_role: 'participant',
            event_type: 'participant_login',
            created_at: '2026-09-22T00:00:00Z',
          },
        ],
        page: { total_count: 51, next_cursor: filters.cursor ? null : '50' },
      };
    },
    getOperatorAccessLogStats: async () => {
      record('access-stats');
      return {
        total_count: 51,
        success_count: 50,
        failed_count: 1,
        conflict_count: 0,
        unique_account_count: 10,
        active_session_count: 10,
      };
    },
    listOperatorOperationalAuditLogs: async (contestId, token, filters) => {
      record('operations', { contestId, token, filters });
      return { data: [], page: { total_count: 0, next_cursor: null } };
    },
  },
};
for (const mock of Object.values(mocks))
  if ('default' in mock) mock.__esModule = true;
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
const SubmissionsPage = source(
  'pages/operator/OperatorSubmissionsPage.tsx',
).default;
const AuditPage = source('pages/operator/OperatorAuditLogsPage.tsx').default;
const AdminAuditPage = source('pages/admin/AdminAuditLogsPage.tsx').default;
const HomePage = source('pages/operator/OperatorHomePage.tsx').default;
const NoticesPage = source('pages/operator/OperatorNoticesPage.tsx').default;
const BoardPage = source('pages/operator/OperatorBoardPage.tsx').default;
let root, container, client;
beforeEach(() => {
  session = withScopes([
    'contest.submission.view',
    'contest.submission.source.view',
  ]);
  reads = [];
  submissionItems = [submission];
  detailOverrides = {};
  noticeItems = [];
  questionItems = [];
  location = '';
  document.body.innerHTML = '';
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
after(() => dom.window.close());
function Observer() {
  location = useLocation().pathname;
  return null;
}
async function render(page, suffix) {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [`/operator/contests/contest${suffix}`] },
          h(Observer),
          h(
            Routes,
            null,
            h(Route, {
              path: `/operator/contests/:contestId${suffix}`,
              element: h(page),
            }),
            h(Route, {
              path: '/operator/contests/:contestId/problem-review',
              element: h('p', null, '검수 페이지'),
            }),
          ),
        ),
      ),
    ),
  );
  await flush();
  await flush();
}
async function flush() {
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
  );
}
function button(label, scope = document) {
  return [...scope.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === label,
  );
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}
async function input(element, value) {
  assert.ok(element);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    ).set;
    setter.call(element, value);
    element.dispatchEvent(
      new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
  await flush();
}

test('submission viewers use safe filter labels and inspect source/results without fetching full teams or problems', async () => {
  await render(SubmissionsPage, '/submissions');
  const selects = [...container.querySelectorAll('select')];
  assert.equal(selects.length, 3);
  assert.match(selects[1].textContent, /A\. 필터 문제/);
  assert.match(selects[2].textContent, /필터 팀/);
  assert.equal(requests('filters').length, 1);
  assert.equal(requests('problems').length, 0);
  assert.equal(requests('participants').length, 0);
  assert.equal(button('A. 필터 문제'), undefined);
  await input(selects[1], 'problem');
  await input(selects[2], 'team');
  assert.deepEqual(requests('submissions').at(-1).filters, {
    cursor: undefined,
    divisionId: undefined,
    limit: 20,
    problemId: 'problem',
    teamId: 'team',
    submissionKind: undefined,
  });
  await click(button('보기'));
  const detail = document.querySelector('dialog[aria-label="제출 상세"]');
  assert.ok(detail?.open);
  assert.match(detail.textContent, /틀렸습니다/);
  assert.match(detail.textContent, /int main\(\) \{ return 0; \}/);
  assert.match(detail.textContent, /컴파일 성공/);
  assert.match(detail.textContent, /실패 입력1 2/);
  assert.match(detail.textContent, /기대 출력3/);
  assert.match(detail.textContent, /실제 출력0/);
  const diagnostics = [...detail.querySelectorAll('details')].find((item) =>
    item.querySelector('summary').textContent.startsWith('채점 상세'),
  );
  assert.equal(diagnostics.open, false);
  await click(diagnostics.querySelector('summary'));
  assert.equal(diagnostics.open, true);
  assert.deepEqual(requests('detail'), [
    {
      kind: 'detail',
      contestId: 'contest',
      submissionId: 'submission-one',
      token: 'token',
    },
  ]);
  await click(button('닫기', detail));
  await click(button('필터 팀(제출자)'));
  const owner = document.querySelector('dialog[aria-label="팀 정보"]');
  assert.match(owner.textContent, /member@test/);
  assert.doesNotMatch(owner.textContent, /팀장|팀원|leader@test/);
  assert.equal(requests('problems').length, 0);
  assert.equal(requests('participants').length, 0);
});

test('submission detail preserves exact source on copy and hides absent logs for accepted code', async () => {
  const source = '  int main() {\n\treturn 0;\n}\n';
  detailOverrides = {
    status: 'accepted',
    source_code: source,
    compile_message: '',
    judge_message: '',
    failed_testcase_order: null,
  };
  let copied;
  const oldNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    },
  });
  try {
    await render(SubmissionsPage, '/submissions');
    await click(button('보기'));
    const detail = document.querySelector('dialog[aria-label="제출 상세"]');
    assert.equal(detail.querySelector('pre code').textContent, source);
    assert.doesNotMatch(
      detail.textContent,
      /채점 상세|실패 입력|컴파일 로그|원본 채점 로그/,
    );
    await click(button('코드 복사', detail));
    assert.equal(copied, source);
    assert.ok(button('복사됨', detail));
    await click(button('줄바꿈 꺼짐', detail));
    assert.equal(
      button('줄바꿈 켜짐', detail).getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(detail.querySelector('pre code').textContent, source);
  } finally {
    if (oldNavigator) Object.defineProperty(global, 'navigator', oldNavigator);
    else delete global.navigator;
  }
});

test('compile errors open diagnostics; output comparisons preserve whitespace and distinguish empty output', async () => {
  detailOverrides = {
    status: 'compile_error',
    compile_message: 'error: expected ;',
    judge_message: '',
    failed_testcase_order: null,
  };
  await render(SubmissionsPage, '/submissions');
  await click(button('보기'));
  let detail = document.querySelector('dialog[aria-label="제출 상세"]');
  const diagnostics = [...detail.querySelectorAll('details')].find((item) =>
    item.querySelector('summary').textContent.startsWith('채점 상세'),
  );
  assert.equal(diagnostics.open, true);
  assert.match(diagnostics.textContent, /error: expected ;/);
  await click(button('닫기', detail));
  detailOverrides = {
    judge_message:
      'testcase #2 (2.in / 2.out): wrong answer\n[input]\n 1 \n\n[expected]\n 3 \n\n[actual]\n',
  };
  await act(async () =>
    client.removeQueries({ queryKey: ['operator', 'submission-detail'] }),
  );
  await click(button('보기'));
  detail = document.querySelector('dialog[aria-label="제출 상세"]');
  assert.equal(
    detail.querySelector('pre[aria-label="실패 입력"]').textContent,
    ' 1 \n',
  );
  assert.equal(
    detail.querySelector('pre[aria-label="기대 출력"]').textContent,
    ' 3 \n',
  );
  assert.equal(
    detail.querySelector('pre[aria-label="실제 출력"]').textContent,
    '(비어 있음)',
  );
});

test('combined problem and participant permissions retain authorized previews in submissions', async () => {
  session = withScopes([
    'contest.submission.view',
    'contest.submission.source.view',
    'contest.problem.view',
    'contest.problem.manage',
    'contest.participant.view',
  ]);
  await render(SubmissionsPage, '/submissions');
  assert.ok(requests('problems').length > 0);
  assert.ok(requests('participants').length > 0);
  await click(button('A. 필터 문제'));
  const preview = document.querySelector('dialog[aria-label="문제 미리보기"]');
  assert.match(preview.textContent, /출제진에게만 보이는 문제 본문/);
  await click(button('닫기', preview));
  await click(button('필터 팀(제출자)'));
  assert.match(
    document.querySelector('dialog[aria-label="팀 정보"]').textContent,
    /비공개 팀장/,
  );
});

test('participant managers browse, filter, refresh and paginate only access logs', async () => {
  session = withScopes([
    'contest.participant.view',
    'contest.participant.manage',
    'contest.access_log.view',
  ]);
  await render(AuditPage, '/audit-logs');
  assert.ok(button('접속 로그'));
  assert.equal(button('작업 로그'), undefined);
  assert.equal(button('이메일 발송 로그'), undefined);
  assert.equal(requests('mail').length, 0);
  assert.match(container.textContent, /participant@test/);
  assert.match(container.textContent, /활성 세션/);
  assert.equal(requests('operations').length, 0);
  assert.equal(requests('access-stats').length, 1);
  await click(button('다음'));
  assert.equal(requests('access').at(-1).filters.cursor, '50');
  await input(
    container.querySelector('input[placeholder="계정 이메일로 필터"]'),
    'PARTICIPANT@Test',
  );
  await click(button('필터 적용'));
  assert.equal(requests('access').at(-1).filters.email, 'participant@test');
  assert.equal(requests('access').at(-1).filters.cursor, undefined);
  const beforeRefresh = requests('access').length;
  await click(button('새로고침'));
  assert.equal(requests('access').length, beforeRefresh + 1);
  assert.equal(requests('operations').length, 0);
});

test('operation-only audit permission never fetches participant access logs', async () => {
  session = withScopes(['contest.audit.view']);
  await render(AuditPage, '/audit-logs');
  assert.ok(button('작업 로그'));
  assert.equal(button('접속 로그'), undefined);
  await click(button('새로고침'));
  assert.ok(requests('operations').length > 0);
  assert.equal(requests('access').length, 0);
  assert.equal(requests('access-stats').length, 0);
});

test('audit viewers can switch between operation and access logs without unrelated participant access', async () => {
  session = withScopes(['contest.audit.view', 'contest.access_log.view']);
  await render(AuditPage, '/audit-logs');
  assert.ok(button('작업 로그'));
  assert.ok(button('접속 로그'));
  assert.equal(requests('operations').length, 1);
  assert.equal(requests('access').length, 0);
  await click(button('접속 로그'));
  assert.equal(requests('access').length, 1);
  assert.equal(requests('access-stats').length, 1);
  assert.equal(requests('participants').length, 0);
  assert.equal(requests('dashboard').length, 1);
});

test('reviewer home includes shared notice and board links', async () => {
  session = withScopes(['contest.problem.review', 'contest.problem.test']);
  await render(HomePage, '');
  assert.equal(location, '/operator/contests/contest');
  for (const suffix of ['notices', 'board', 'problem-review'])
    assert.ok(container.querySelector(`a[href$="/${suffix}"]`));
  assert.equal(requests('participants').length, 0);
  assert.equal(requests('dashboard').length, 2);
});

test('reviewer and submission roles share a home with only their authorized quick links and statistics', async () => {
  session = withScopes([
    'contest.problem.review',
    'contest.problem.test',
    'contest.submission.view',
    'contest.submission.source.view',
  ]);
  await render(HomePage, '');
  assert.equal(location, '/operator/contests/contest');
  const links = [...container.querySelectorAll('a')].map((link) =>
    link.textContent.trim(),
  );
  assert.ok(links.includes('문제 모아보기'));
  assert.ok(links.includes('제출 확인'));
  for (const label of [
    '대회 설정',
    '운영자 추가',
    '참가팀 관리',
    '문제 관리',
    '공지 관리',
    '게시글 관리',
    '스코어보드',
  ])
    assert.equal(links.includes(label), false, label);
  assert.match(container.textContent, /전체 제출 수/);
  assert.doesNotMatch(container.textContent, /전체 참가팀/);
  assert.deepEqual(reads.map((request) => request.kind).sort(), [
    'dashboard',
    'dashboard',
    'notices',
    'problems',
    'questions',
  ]);
});

for (const [scopes, expectedLinks] of [
  [['contest.settings.manage'], ['대회 설정']],
  [['contest.staff.manage'], ['운영자 추가']],
  [
    ['contest.settings.manage', 'contest.staff.manage'],
    ['대회 설정', '운영자 추가'],
  ],
]) {
  test(`home separates settings and operators quick links for ${scopes.join(' + ')}`, async () => {
    session = withScopes(scopes);
    await render(HomePage, '');
    const links = [...container.querySelectorAll('a')].filter(
      (link) => !link.closest('nav'),
    );
    for (const [label, suffix] of [
      ['대회 설정', 'settings'],
      ['운영자 추가', 'operators'],
    ]) {
      const link = links.find((item) => item.textContent.trim() === label);
      assert.equal(Boolean(link), expectedLinks.includes(label), label);
      if (link)
        assert.equal(
          link.getAttribute('href'),
          `/operator/contests/contest/${suffix}`,
        );
    }
  });
}

test('all submissions clears persisted filters and identifies review and preview owners', async () => {
  window.localStorage.setItem(
    'zoj.operator.submissions.division.contest',
    'division',
  );
  window.localStorage.setItem(
    'zoj.operator.submissions.problem.contest',
    'problem',
  );
  window.localStorage.setItem('zoj.operator.submissions.team.contest', 'team');
  submissionItems = [
    {
      ...submission,
      submission_id: 'preview-one',
      participant_team_id: null,
      team_name: null,
      member_name: null,
      submission_kind: 'participant_preview',
      submitted_by_name: '미리보기 담당',
      submitted_by_title: '참가자 미리보기',
    },
    {
      ...submission,
      submission_id: 'review-one',
      participant_team_id: null,
      team_name: null,
      member_name: null,
      submission_kind: 'operator_test',
      submitted_by_name: '검수 담당',
      submitted_by_title: '검수자',
    },
  ];
  await render(SubmissionsPage, '/submissions');
  await click(button('전체 제출 보기'));
  assert.deepEqual(requests('submissions').at(-1).filters, {
    cursor: undefined,
    divisionId: undefined,
    limit: 20,
    problemId: undefined,
    teamId: undefined,
    submissionKind: undefined,
  });
  for (const field of ['division', 'problem', 'team']) {
    assert.equal(
      window.localStorage.getItem(`zoj.operator.submissions.${field}.contest`),
      '',
    );
  }
  assert.equal(container.querySelector('select').value, '');
  assert.ok(button('미리보기 담당 / 참가자 미리보기'));
  assert.ok(button('검수 담당 / 검수자'));
  assert.match(
    container.querySelector('tbody').textContent,
    /문제 검수·테스트/,
  );
  await click(button('미리보기 담당 / 참가자 미리보기'));
  const owner = document.querySelector('dialog[aria-label="팀 정보"]');
  assert.match(owner.textContent, /참가자 미리보기 화면에서 생성한 제출/);
  assert.doesNotMatch(owner.textContent, /팀장|팀원/);
  await click(button('닫기', owner));
  await click(button('보기'));
  const detail = document.querySelector('dialog[aria-label="제출 상세"]');
  assert.match(detail.textContent, /제출 구분참가자 미리보기/);
  assert.match(detail.textContent, /int main/);
  assert.equal(requests('participants').length, 0);
});

test('audit viewers can browse only their contest mail with filters, pagination and refresh', async () => {
  session = withScopes(['contest.audit.view']);
  await render(AuditPage, '/audit-logs');
  assert.equal(requests('mail').length, 0);
  await click(button('이메일 발송 로그'));
  assert.equal(requests('mail').at(-1).contestId, 'contest');
  assert.match(container.textContent, /recipient@test/);
  assert.match(container.textContent, /대회 초대 안내/);
  assert.match(container.textContent, /기존 기록 · 시각 미기록/);
  await click(button('다음'));
  assert.equal(requests('mail').at(-1).filters.cursor, 'mail-page-2');
  await input(
    container.querySelector('input[placeholder="받는 이메일 또는 제목"]'),
    ' recipient@test ',
  );
  await input(container.querySelector('input[type="date"]'), '2026-09-22');
  await click(button('검색 적용'));
  assert.equal(requests('mail').at(-1).filters.q, 'recipient@test');
  assert.equal(
    requests('mail').at(-1).filters.since,
    '2026-09-21T15:00:00.000Z',
  );
  assert.equal(requests('mail').at(-1).filters.cursor, undefined);
  const before = requests('mail').length;
  await click(button('새로고침'));
  assert.equal(requests('mail').length, before + 1);
  assert.equal(requests('access').length, 0);
  assert.equal(requests('participants').length, 0);
});

test('service masters query all mail instead of the contest-specific endpoint', async () => {
  session = withScopes([]);
  session.operatorSession.staff.is_service_master = true;
  await render(AdminAuditPage, '/audit-logs');
  await click(button('이메일 발송 로그'));
  assert.equal(requests('mail').at(-1).contestId, undefined);
  assert.ok(
    container.querySelector('input[placeholder="받는 이메일, 제목, 대회명"]'),
  );
  await input(
    container.querySelector('input[placeholder="받는 이메일, 제목, 대회명"]'),
    'missing',
  );
  await click(button('검색 적용'));
  assert.match(
    container.textContent,
    /조건에 맞는 이메일 발송 기록이 없습니다/,
  );
  assert.equal(button('다음').disabled, true);
});

test('submission kind filters reset pagination and persist the selected kind', async () => {
  submissionItems = [
    ...Array.from({ length: 21 }, (_, i) => ({
      ...submission,
      submission_id: `real-${i}`,
      submission_kind: 'participant',
    })),
    ...['operator_test', 'participant_preview', 'mock_judging'].map((kind) => ({
      ...submission,
      submission_id: kind,
      submission_kind: kind,
    })),
  ];
  await render(SubmissionsPage, '/submissions');
  await click(button('다음'));
  assert.equal(requests('submissions').at(-1).filters.cursor, '20');
  for (const [label, kind] of [
    ['검수·테스트 제출', 'operator_test'],
    ['참가자 제출', 'participant'],
    ['참가자 미리보기', 'participant_preview'],
    ['모의채점', 'mock_judging'],
  ]) {
    await click(button(label));
    const request = requests('submissions').at(-1).filters;
    assert.equal(request.submissionKind, kind);
    assert.equal(request.cursor, undefined);
    assert.equal(button(label).getAttribute('aria-pressed'), 'true');
    assert.equal(
      window.localStorage.getItem('zoj.operator.submissions.kind.contest'),
      kind,
    );
    const expectedRows = kind === 'participant' ? 20 : 1;
    assert.equal(container.querySelectorAll('tbody tr').length, expectedRows);
  }
  await click(button('전체 제출 보기'));
  assert.equal(
    requests('submissions').at(-1).filters.submissionKind,
    undefined,
  );
  assert.equal(button('전체').getAttribute('aria-pressed'), 'true');
  assert.equal(
    window.localStorage.getItem('zoj.operator.submissions.kind.contest'),
    'all',
  );
});

test('saved submission kind restores without requesting other submission kinds', async () => {
  window.localStorage.setItem(
    'zoj.operator.submissions.kind.contest',
    'operator_test',
  );
  await render(SubmissionsPage, '/submissions');
  assert.ok(requests('submissions').length);
  assert.ok(
    requests('submissions').every(
      (request) => request.filters.submissionKind === 'operator_test',
    ),
  );
  assert.equal(button('검수·테스트 제출').getAttribute('aria-pressed'), 'true');
});

test('every operator reads notices without notice creation, emergency or mutation controls', async () => {
  session = withScopes([]);
  noticeItems = [
    {
      contest_notice_id: 'notice',
      contest_id: 'contest',
      title: '일정 변경 안내',
      body: '종료 18시로 변경\n\n변경 사유: 장비 점검',
      emergency: true,
      pinned: true,
      visibility: 'participants',
      published_at: '2026-10-20T00:00:00Z',
    },
  ];
  await render(NoticesPage, '/notices');
  assert.ok(button('일정 변경 안내'));
  await click(button('일정 변경 안내'));
  assert.match(container.textContent, /장비 점검/);
  for (const label of [
    '공지 작성',
    '긴급공지 관리',
    '수정',
    '삭제',
    '공지 등록',
  ])
    assert.equal(button(label), undefined, label);
  assert.equal(container.querySelector('form'), null);
});

test('every operator reads questions and answers while board management remains separate', async () => {
  session = withScopes([]);
  questionItems = [
    {
      contest_question_id: 'q',
      contest_id: 'contest',
      title: '제한 질문',
      body: '입력 제한이 궁금합니다.',
      author_name: '참가자',
      visibility: 'private',
      created_at: '2026-10-20T00:00:00Z',
      answers: [
        {
          contest_answer_id: 'a',
          body: '제한은 100입니다.',
          visibility: 'questioner',
          created_by_role: 'operator',
          created_by_name: '운영자',
          created_at: '2026-10-20T00:01:00Z',
        },
      ],
    },
  ];
  await render(BoardPage, '/board');
  const question = [...container.querySelectorAll('button')].find((el) =>
    el.textContent.includes('제한 질문'),
  );
  await click(question);
  assert.match(container.textContent, /입력 제한이 궁금합니다/);
  assert.match(container.textContent, /제한은 100입니다/);
  for (const label of [
    '답변 작성',
    '공개 전환',
    '비공개 전환',
    '삭제',
    '답변 등록',
  ])
    assert.equal(button(label), undefined, label);
  assert.equal(container.querySelector('textarea'), null);
  // A board manager keeps the same controls after a role change.
  session = withScopes(['contest.board.question.manage']);
  await render(BoardPage, '/board');
  assert.ok(button('답변 작성'));
  await click(button('답변 작성'));
  assert.ok(container.querySelector('textarea'));
});
