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
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
const contest = {
  contest_id: 'contest',
  title: '표시 테스트',
  status: 'running',
  start_at: '2020-01-01T00:00:00Z',
  end_at: '2099-01-01T00:00:00Z',
};
const operatorSession = {
  accessToken: 'token',
  staff: {
    email: 'staff@test',
    display_name: '테스트 운영자',
    is_service_master: true,
    contest_scopes: {},
  },
};
const question = {
  contest_question_id: 'question',
  title: '답변 작성자 확인',
  body: '질문 내용',
  visibility: 'public',
  author_email: 'participant@test',
  author_name: '질문자',
  created_at: '2026-09-22T00:00:00Z',
  answers: [
    {
      contest_answer_id: 'author',
      created_by_role: 'operator',
      created_by_name: '손동열',
      created_by_title: '출제자',
      body: '출제자 답변',
    },
    {
      contest_answer_id: 'master',
      created_by_role: 'operator',
      created_by_name: '대회 총괄',
      created_by_title: '마스터',
      body: '마스터 답변',
    },
    {
      contest_answer_id: 'owner',
      created_by_role: 'operator',
      created_by_name: '총괄 담당자',
      created_by_title: '총괄',
      body: '총괄 답변',
    },
    {
      contest_answer_id: 'legacy',
      created_by_role: 'operator',
      created_by_name: '기존 운영진',
      body: '기존 답변',
    },
    {
      contest_answer_id: 'nameless',
      created_by_role: 'operator',
      created_by_title: '검수자',
      body: '이름 없는 답변',
    },
    {
      contest_answer_id: 'participant',
      created_by_role: 'participant',
      created_by_name: '질문자',
      created_by_email: 'participant@test',
      created_by_title: '마스터',
      body: '참가자 답변',
    },
  ].map((answer) => ({
    ...answer,
    visibility: 'public',
    created_at: '2026-09-22T00:00:00Z',
  })),
};
const baseSubmission = {
  submission_id: 'submission',
  problem_id: 'problem',
  problem_code: 'A',
  language: 'cpp17',
  status: 'accepted',
  submitted_at: '2026-09-22T00:00:00Z',
};
const submissionCases = [
  [
    {
      submission_kind: 'operator_test',
      submitted_by_name: '손동열',
      submitted_by_title: '출제자',
    },
    '손동열 / 출제자',
  ],
  [
    {
      submission_kind: 'operator_test',
      submitted_by_name: '총괄 담당자',
      submitted_by_title: '총괄',
    },
    '총괄 담당자 / 총괄',
  ],
  [
    { submission_kind: 'operator_test', submitted_by_name: '기존 운영진' },
    '기존 운영진 / 운영자',
  ],
  [
    { submission_kind: 'operator_test', submitted_by_title: '검수자' },
    '검수자',
  ],
  [
    {
      submission_kind: 'mock_judging',
      submitted_by_name: '모의 계정',
      submitted_by_title: '마스터',
    },
    '모의채점',
  ],
  [
    {
      submission_kind: 'participant',
      team_name: '참가팀',
      submitted_by_name: '참가자',
      submitted_by_title: '마스터',
    },
    '참가팀',
  ],
];
let submissions;
const wrapper = ({ children }) => h('section', null, children);
const mocks = {
  '@/utils/Icons': { SvgIcon: () => null },
  '@/shared/unsaved/useUnsavedForm': {
    default: () => ({ formProps: {}, confirm: (callback) => callback() }),
  },
  '@/shared/unsaved/UnsavedChangesContext': {
    useUnsavedNavigation: () => ({
      confirmTransition: (callback) => callback(),
    }),
  },
  '@/shared/ui/useConfirmation': {
    default: () => ({ confirm: async () => true, dialog: null }),
  },
  '@/shared/ui/Modal': {
    default: ({ children }) => h('div', { role: 'dialog' }, children),
  },
  '@/shared/ui/AnimatedNumber': { default: ({ value }) => String(value ?? 0) },
  '@/components/contest/ContestPageFrame': { default: wrapper },
  '@/components/contest/ContestPageNavigation': { default: () => null },
  '@/components/contest/ContestPageShell': {
    default: ({ children }) => children({ contest, divisions: [] }),
  },
  '@/components/contest/problem/ProblemStatementPanel': { default: () => null },
  '@/components/admin/AdminShell': {
    AdminAccessGate: ({ children }) => children(operatorSession),
    AdminMetricCard: () => null,
    AdminPanel: wrapper,
    AdminLayout: wrapper,
    AdminViewTabs: () => null,
    JudgeIcon: () => null,
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => token,
  },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) =>
      selector({
        generalSession: {
          account: { email: 'staff@test' },
          operatorContests: [],
          operatorSession,
        },
      }),
  },
  '@/domains/contestRuntime/useContestParticipantSession': {
    useContestParticipantSession: () => ({
      activeParticipantSession: null,
      generalSession: null,
      participantContest: null,
      token: 'token',
      ensureParticipantSession: async () => null,
    }),
  },
  '@/domains/contestRuntime/queryKeys': {
    generalSessionQueryIdentity: () => 'general',
    participantSessionQueryIdentity: () => 'participant',
    contestQueryKeys: {
      notices: (...args) => ['notices', ...args],
      questions: (...args) => ['questions', ...args],
    },
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => ({
      contest,
      divisions: [{ division_id: 'division', code: 'general', name: '일반부' }],
    }),
    getAdminContests: async () => [],
    getAdminContestDivisions: async () => [],
  },
  '@/domains/serviceCommunication/api': {
    getContestNotices: async () => [],
    getContestQuestions: async () => [question],
    listOperatorContestQuestions: async () => [question],
    listOperatorContestNotices: async () => [],
  },
  '@/domains/problemManagement/api': { getOperatorProblems: async () => [] },
  '@/domains/teamParticipation/api': { listParticipantTeams: async () => [] },
  '@/domains/submissionScoreboard/api': {
    listRejudgings: async () => ({ batches: [], total: 0 }),
    getOperatorSubmissionFilters: async () => ({ problems: [], teams: [] }),
    listOperatorSubmissionsPage: async () => ({
      data: submissions,
      page: { next_cursor: null },
    }),
  },
  '@/domains/auditMonitoring/api': {
    getAdminJudgeDashboard: async () => ({ nodes: [], queue: [] }),
    listAdminJudgeSubmissions: async () => ({
      data: submissions.map((submission) => ({ submission })),
      page: { next_cursor: null },
    }),
    getAdminJudgeSubmission: async (id) => ({
      submission: submissions.find(
        (submission) => submission.submission_id === id,
      ),
    }),
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
const { contestStaffDisplayName } = source(
  'domains/identityAccess/staffDisplay.ts',
);
const OperatorBoard = source('pages/operator/OperatorBoardPage.tsx').default;
const ParticipantBoard = source('pages/contest/ContestBoardPage.tsx').default;
const OperatorSubmissions = source(
  'pages/operator/OperatorSubmissionsPage.tsx',
).default;
const ParticipantSubmissions = source(
  'components/contest/submissions/ContestSubmissionsTable.tsx',
).default;

test('participant source loads on expansion and is reused', async () => {
  let requests = 0;
  const item = {
    ...baseSubmission,
    submission_id: 'lazy-source',
    source_code: '',
    language: 'cpp17',
  };
  await render(
    h(ParticipantSubmissions, {
      contestId: 'contest',
      submissions: [item],
      sourceScopeKey: 'participant-a',
      loadSource: async (id) => {
        assert.equal(id, 'lazy-source');
        requests += 1;
        return 'int main() { return 0; }';
      },
    }),
    '/contests/contest/submissions',
  );
  assert.equal(requests, 0);
  await click(container.querySelector('button[title="제출 코드 보기"]'));
  assert.equal(requests, 1);
  assert.match(container.querySelector('pre').textContent, /int main/);
  await click(container.querySelector('button[title="제출 코드 보기"]'));
  await click(container.querySelector('button[title="제출 코드 보기"]'));
  assert.equal(requests, 1);
});
const AdminJudge = source('pages/admin/AdminJudgePage.tsx').default;
test('source never shows the previous account code during a new fetch', async () => {
  client.setDefaultOptions({
    queries: { retry: false, placeholderData: (previous) => previous },
  });
  const item = {
    ...baseSubmission,
    submission_id: 'private-source',
    source_code: '',
    language: 'cpp17',
  };
  const view = (scope, loadSource) =>
    h(ParticipantSubmissions, {
      contestId: 'contest',
      submissions: [item],
      sourceScopeKey: scope,
      loadSource,
    });
  await render(
    view('account-a', async () => 'private code A'),
    '/contests/contest/submissions',
  );
  await click(container.querySelector('button[title="제출 코드 보기"]'));
  assert.match(container.querySelector('pre').textContent, /private code A/);
  let complete;
  await render(
    view(
      'account-b',
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    ),
    '/contests/contest/submissions',
  );
  assert.doesNotMatch(container.textContent, /private code A/);
  assert.match(container.textContent, /코드를 불러오는 중/);
  complete('private code B');
  await flush();
  assert.match(container.querySelector('pre').textContent, /private code B/);
});
let root, container, client;
beforeEach(() => {
  submissions = submissionCases.map(([fields], index) => ({
    ...baseSubmission,
    ...fields,
    submission_id: `submission-${index}`,
  }));
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
  container.remove();
});
after(() => dom.window.close());
async function flush() {
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
  );
}
async function render(element, route = '/operator/contests/contest/board') {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [route] },
          h(
            Routes,
            null,
            h(Route, { path: '/operator/contests/:contestId/*', element }),
            h(Route, { path: '/contests/:contestId/*', element }),
            h(Route, { path: '/admin/*', element }),
          ),
        ),
      ),
    ),
  );
  await flush();
  await flush();
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}
function button(label) {
  return [...container.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === label,
  );
}
function assertAnswerLabels() {
  for (const label of [
    '손동열 / 출제자',
    '대회 총괄 / 마스터',
    '총괄 담당자 / 총괄',
    '기존 운영진 / 운영자',
    '검수자',
    '질문자 (글쓴이)',
  ])
    assert.ok(container.textContent.includes(label), label);
  assert.ok(!container.textContent.includes('질문자 / 마스터'));
  assert.equal(question.answers[0].created_by_name, '손동열');
}

test('staff display trims separate fields and tolerates legacy missing names or titles', () => {
  assert.equal(
    contestStaffDisplayName(' 손동열 ', ' 출제자 '),
    '손동열 / 출제자',
  );
  assert.equal(
    contestStaffDisplayName('운영 담당자', null),
    '운영 담당자 / 운영자',
  );
  assert.equal(contestStaffDisplayName(' ', '검수자'), '검수자');
  assert.equal(contestStaffDisplayName(undefined, ''), '운영자');
});
test('operator board displays each answer author name and title while preserving participant authorship', async () => {
  await render(h(OperatorBoard));
  await click(
    [...container.querySelectorAll('button')].find((item) =>
      item.textContent.includes(question.title),
    ),
  );
  assertAnswerLabels();
});
test('participant board displays the same operator names and titles in expanded answers', async () => {
  await render(
    h(ParticipantBoard),
    '/contests/contest/board?questionId=question',
  );
  assertAnswerLabels();
});
test('operator submissions display titles only for operator tests', async () => {
  await render(
    h(OperatorSubmissions),
    '/operator/contests/contest/submissions',
  );
  for (const [, label] of submissionCases)
    assert.ok(container.textContent.includes(label), label);
  assert.ok(!container.textContent.includes('참가자 / 마스터'));
  assert.ok(!container.textContent.includes('모의 계정 / 마스터'));
});
test('participant submission table displays titles only for operator tests including legacy tagged teams', async () => {
  const legacy = {
    ...baseSubmission,
    submission_id: 'legacy-tagged',
    team_name: '__operator_test__:staff@test',
    submitted_by_name: '레거시 출제자',
    submitted_by_title: '출제자',
  };
  await render(
    h(ParticipantSubmissions, {
      contestId: 'contest',
      submissions: [...submissions, legacy],
    }),
    '/contests/contest/submissions',
  );
  for (const [, label] of submissionCases)
    assert.ok(container.textContent.includes(label), label);
  assert.ok(container.textContent.includes('레거시 출제자 / 출제자'));
  assert.ok(!container.textContent.includes('참가자 / 마스터'));
  assert.ok(!container.textContent.includes('모의 계정 / 마스터'));
  assert.equal(submissions[0].submitted_by_name, '손동열');
});
test('admin judge submission details use the same operator title and preserve mock and participant labels', async () => {
  await render(h(AdminJudge), '/admin/judge?view=submissions');
  for (let index = 0; index < submissionCases.length; index++) {
    const openButtons = [...container.querySelectorAll('button')].filter(
      (item) => item.textContent.trim() === '보기',
    );
    await click(openButtons[index]);
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(
      dialog.textContent.includes(submissionCases[index][1]),
      submissionCases[index][1],
    );
    await click(button('닫기'));
  }
});
