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
global.Event = dom.window.Event;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
let state, calls, serverDivision, rejectOptions, savedSession, currentPath;
let notices, questions, notificationItems;
const listeners = new Set();
const division = (id) => ({
  division_id: id,
  code: id,
  name: id === 'a' ? '일반부' : '고등부',
  description: '',
});
const contest = {
  contest_id: 'contest',
  title: '예정된 검수 대회',
  organization_name: 'ZOJ',
  overview: '',
  status: 'scheduled',
  start_at: '2099-01-01T01:00:00Z',
  freeze_at: '2099-01-01T04:00:00Z',
  end_at: '2099-01-01T05:00:00Z',
  problem_access_after_end: 'private',
  submission_access_after_end: 'private',
  scoreboard_access_after_end: 'private',
  board_access_after_end: 'participants',
  notice_access_after_end: 'public',
  emergency_notice: '긴급 공지 확인',
};
const problem = {
  problem_id: 'problem',
  contest_id: 'contest',
  division_id: 'a',
  problem_code: 'A',
  title: '합 구하기',
  statement: '두 수를 더하세요.',
  editorial: '',
  time_limit_ms: 1000,
  memory_limit_mb: 256,
  display_order: 1,
};
function previewSession(id = 'a') {
  return {
    accessToken: 'general-token',
    isPreview: true,
    contestId: 'contest',
    member: { name: '점검자', email: 'preview@example.test' },
    team: { team_name: '점검자 미리보기' },
    division: division(id),
  };
}
function setState(patch) {
  state = { ...state, ...patch };
  for (const notify of listeners) notify();
}
function useSessionStore(selector) {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(state),
  );
}
useSessionStore.getState = () => state;
async function apiRequest(url, token, init) {
  calls.push({
    url,
    token,
    body: init?.body ? JSON.parse(init.body) : undefined,
  });
  if (url.endsWith('/participant-preview')) {
    if (rejectOptions) throw new Error('권한 없음');
    return {
      contest,
      divisions: [division('a'), division('b')],
      selected_division_id: serverDivision,
    };
  }
  if (url.endsWith('/participant-preview-session')) {
    serverDivision = JSON.parse(init.body).division_id;
    const next = previewSession(serverDivision);
    return {
      access_token: token,
      is_preview: true,
      team: next.team,
      member: next.member,
      division: next.division,
    };
  }
  if (url === '/public/contests/contest')
    return { contest, divisions: [division('a'), division('b')] };
  if (url.includes('/problems') && init?.method === 'POST')
    return {
      submission_id: 'submission',
      problem_id: 'problem',
      status: 'accepted',
    };
  if (url.endsWith('/problems/problem/assets')) return [];
  if (url.endsWith('/problems/problem')) return problem;
  if (url.endsWith('/problems'))
    return [{ ...problem, division_id: serverDivision || 'a' }];
  if (url.endsWith('/boards') && init?.method === 'POST')
    return {
      contest_question_id: 'preview-question',
      title: JSON.parse(init.body).title,
      body: JSON.parse(init.body).body,
      answers: [],
      created_at: new Date().toISOString(),
    };
  if (url.startsWith('/notifications'))
    return {
      items: notificationItems,
      next_offset: null,
      unread_count: notificationItems.filter((item) => !item.read_at).length,
      total_count: notificationItems.length,
    };
  if (url.endsWith('/notices')) return notices;
  if (url.endsWith('/boards')) return questions;
  if (url.startsWith('/contests/contest/submissions')) return [];
  throw new Error(`Unexpected API ${url}`);
}
const mocks = {
  '@/domains/identityAccess/sessionStore': { useSessionStore },
  '@/domains/identityAccess/useRefreshGeneralSession': {
    useRefreshGeneralSession: () => false,
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'preview-identity',
  },
  '@/domains/identityAccess/sessionStorage': {
    PARTICIPANT_PREVIEW_MODE_KEY: 'zoj.participantPreviewMode',
    saveParticipantSession: (next) => {
      savedSession = next;
    },
  },
  '@/domains/identityAccess/api': {
    getGeneralMe: async () => state.generalSession,
  },
  '@/shared/api/client': {
    apiRequest,
    apiPageRequest: async (...args) => ({
      data: await apiRequest(...args),
      page: {},
    }),
    API_BASE_URL: '/api',
  },
  '@/shared/unsaved/useUnsavedForm': {
    default: () => ({ formProps: {}, confirm: (callback) => callback() }),
  },
  '@/shared/unsaved/UnsavedChangesContext': {
    useUnsavedNavigation: () => ({
      confirmTransition: (callback) => callback(),
    }),
  },
  '@/utils/Icons': { SvgIcon: () => null },
  '@/shared/ui/MarkdownPreview': {
    default: ({ statement }) => h('p', null, statement),
  },
  '@/shared/ui/CodeEditor': {
    default: ({ value, onChange }) =>
      h('textarea', {
        'aria-label': '제출 코드',
        value,
        onChange: (event) => onChange(event.target.value),
      }),
  },
  '@/components/contest/problem/ProblemStatementPanel': {
    default: ({ problem }) => h('article', null, problem.statement),
  },
  '@/components/contest/problem/ProblemEditorialPanel': { default: () => null },
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
  loaded.require = (id) =>
    (id.endsWith('.css') ? {} : mocks[id]) ??
    (id.startsWith('@/')
      ? source(
          ['.ts', '.tsx']
            .map((ext) => id.slice(2) + ext)
            .find((file) =>
              fs.existsSync(path.resolve(__dirname, '../src', file)),
            ),
        )
      : native(id));
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
const Shell = source('components/contest/ContestPageShell.tsx').default;
const Navigation = source(
  'components/contest/ContestPageNavigation.tsx',
).default;
const Problems = source('pages/contest/ContestProblemsPage.tsx').default;
const Detail = source('pages/contest/ContestProblemDetailPage.tsx').default;
const Board = source('pages/contest/ContestBoardPage.tsx').default;
const Notifications = source(
  'components/layout/HeaderNotifications.tsx',
).default;
const RoleSelector = source(
  'components/operator/ContestRoleSelector.tsx',
).default;
const { contestRoleTitle, contestRoleTitleForScopes } = source(
  'domains/identityAccess/contestRoles.ts',
);
const { hasParticipantPreviewAccess } = source(
  'domains/identityAccess/participantPreview.ts',
);
function Home() {
  return h(Shell, null, (detail) =>
    h(Navigation, { contest: detail.contest, contestId: 'contest' }),
  );
}
function Observer() {
  currentPath = useLocation().pathname;
  return null;
}
let root, container, client;
beforeEach(() => {
  state = {
    generalSession: {
      accessToken: 'general-token',
      account: { email: 'preview@example.test', display_name: '점검자' },
      participantContests: [],
      operatorContests: [
        { contest, scopes: ['contest.view', 'contest.participant.preview'] },
      ],
    },
    participantSession: null,
    setParticipantSession: (next) => setState({ participantSession: next }),
    setGeneralSession: (next) => setState({ generalSession: next }),
  };
  calls = [];
  serverDivision = null;
  rejectOptions = false;
  savedSession = null;
  notificationItems = [];
  notices = [];
  questions = [];
  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
after(() => dom.window.close());
async function flush() {
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
  );
}
async function render(
  url = '/contests/contest?preview=1',
  showNotifications = false,
) {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [url] },
          h(Observer),
          showNotifications ? h(Notifications) : null,
          h(
            Routes,
            null,
            h(Route, { path: '/contests/:contestId', element: h(Home) }),
            h(Route, {
              path: '/contests/:contestId/problems',
              element: h(Problems),
            }),
            h(Route, {
              path: '/contests/:contestId/problems/:problemId/:problemView',
              element: h(Detail),
            }),
            h(Route, { path: '/contests/:contestId/board', element: h(Board) }),
            h(Route, {
              path: '/contests/:contestId/submissions',
              element: h('p', null, '참가자 채점현황'),
            }),
          ),
        ),
      ),
    ),
  );
  await flush();
}
function button(text) {
  return [...container.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === text,
  );
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}
async function waitForElement(selector) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const element = container.querySelector(selector);
    if (element) return element;
    await flush();
  }
  assert.fail(`Element did not appear: ${selector}`);
}
async function input(element, value) {
  assert.ok(element);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    ).set.call(element, value);
    element.dispatchEvent(
      new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
  await flush();
}

test('preview combines with operator roles and masters can open it explicitly', async () => {
  function Fixture() {
    const [roles, setRoles] = React.useState([
      'problem_author',
      'audit_viewer',
    ]);
    return h(RoleSelector, {
      canAssignMaster: true,
      value: roles,
      onChange: setRoles,
    });
  }
  await act(async () => root.render(h(Fixture)));
  const role = (text) =>
    [...container.querySelectorAll('label')]
      .find((item) => item.textContent.includes(text))
      .querySelector('input');
  await click(role('참가자 미리보기'));
  assert.equal(role('출제진').checked, true);
  assert.equal(role('참가자 미리보기').checked, true);
  await click(role('공지 작성'));
  assert.equal(role('참가자 미리보기').checked, true);
  assert.equal(contestRoleTitle(['participant_preview']), '운영진');
  assert.equal(
    contestRoleTitleForScopes(['contest.participant.preview']),
    '운영진',
  );
  assert.equal(
    hasParticipantPreviewAccess(
      {
        ...state.generalSession,
        operatorContests: [{ contest, scopes: ['contest.*'] }],
      },
      'contest',
    ),
    true,
  );
});

test('a preview permission alone does not switch a normal contest page into preview', async () => {
  await render('/contests/contest');
  assert.equal(
    calls.some((call) => call.url.endsWith('/participant-preview')),
    false,
  );
  assert.equal(
    calls.some((call) => call.url === '/public/contests/contest'),
    true,
  );
});

test('private scheduled contest starts preview through division selection then uses actual participant problems API', async () => {
  await render();
  assert.equal(
    calls.some((call) => call.url === '/public/contests/contest'),
    false,
  );
  assert.equal(container.querySelector('nav'), null);
  await input(container.querySelector('select'), 'b');
  await click(button('미리보기 시작'));
  assert.equal(savedSession.isPreview, true);
  assert.equal(savedSession.division.division_id, 'b');
  await click(container.querySelector('a[href="/contests/contest/problems"]'));
  assert.ok(container.textContent.includes('합 구하기'));
  assert.ok(
    calls.some(
      (call) =>
        call.url === '/contests/contest/divisions/b/problems' &&
        call.token === 'general-token',
    ),
  );
  assert.equal(
    calls.some((call) => call.url.startsWith('/operator/')),
    false,
  );
});

test('selected preview can submit code before start using the ordinary participant submission endpoint', async () => {
  state.participantSession = previewSession();
  serverDivision = 'a';
  await render('/contests/contest/problems/problem/submit?preview=1');
  await input(
    await waitForElement('textarea[aria-label="제출 코드"]'),
    'print(3)',
  );
  await click(button('제출하기'));
  assert.ok(
    calls.some(
      (call) =>
        call.url === '/contests/contest/problems/problem/submissions' &&
        call.body.source_code === 'print(3)' &&
        call.token === 'general-token',
    ),
  );
  assert.equal(currentPath, '/contests/contest/submissions');
});

test('selected preview can post a question through the actual participant board', async () => {
  state.participantSession = previewSession();
  serverDivision = 'a';
  await render('/contests/contest/board?preview=1');
  await click(button('질문하기'));
  await input(
    container.querySelector('input[placeholder="제목을 입력하세요."]'),
    '미리보기 질문',
  );
  await input(
    container.querySelector('textarea[placeholder="질문 내용을 입력하세요."]'),
    '이 입력을 확인해 주세요.',
  );
  await click(button('등록'));
  assert.ok(
    calls.some(
      (call) =>
        call.url === '/contests/contest/boards' &&
        call.body?.title === '미리보기 질문' &&
        call.token === 'general-token',
    ),
  );
});

test('local preview without a matching server selection must be restarted before pages are shown', async () => {
  state.participantSession = previewSession();
  client.setQueryData(['participant-preview', 'contest', 'preview-identity'], {
    contest,
    divisions: [division('a')],
    selected_division_id: 'a',
  });
  await render('/contests/contest/problems?preview=1');
  assert.ok(button('미리보기 시작'));
  assert.equal(button('미리보기 시작').disabled, false);
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
  await click(button('미리보기 시작'));
  assert.equal(serverDivision, 'a');
});

test('server preview denial hides participant content even with a saved local session', async () => {
  state.participantSession = previewSession();
  serverDivision = 'a';
  rejectOptions = true;
  await render('/contests/contest/problems?preview=1');
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
  assert.ok(
    container.textContent.includes('미리보기 권한을 확인하지 못했습니다.'),
  );
});

test('preview displays the same dismissible emergency notice as normal participant pages', async () => {
  state.participantSession = previewSession();
  serverDivision = 'a';
  await render();
  assert.ok(container.textContent.includes('긴급 공지 확인'));
  await click(container.querySelector('button[aria-label="긴급공지 닫기"]'));
  assert.equal(container.textContent.includes('긴급 공지 확인'), false);
});

test('preview keeps the account inbox independent of division selection and does not poll judging sources', async () => {
  state.participantSession = previewSession();
  await render('/contests/contest?preview=1', true);
  assert.ok(
    calls.some(
      (call) => call.url === '/notifications' && call.token === 'general-token',
    ),
  );
  assert.equal(
    calls.some(
      (call) =>
        call.url.startsWith('/contests/') &&
        ['/notices', '/boards', '/submissions?limit=10'].some((suffix) =>
          call.url.endsWith(suffix),
        ),
    ),
    false,
  );
  await click(button('미리보기 시작'));
  await flush();
  assert.equal(
    calls.some((call) => call.url.endsWith('/submissions?limit=10')),
    false,
  );
});

test('active preview shows its own server account inbox without creating participant source alerts', async () => {
  state.participantSession = previewSession();
  serverDivision = 'a';
  notificationItems = ['notice', 'answer'].map((type) => ({
    notification_id: type,
    notification_type: type,
    contest_id: 'other-contest',
    contest_title: '내가 참가한 대회',
    title: type === 'notice' ? '새 대회 공지' : '내 질문 답변',
    body: '서버에 저장된 개인 알림',
    href: '/contests/other-contest/board',
    created_at: new Date().toISOString(),
    read_at: null,
    dismissed_at: null,
  }));
  await render('/contests/contest?preview=1', true);
  await flush();
  assert.ok(container.textContent.includes('새 대회 공지'));
  assert.ok(container.textContent.includes('내 질문 답변'));
  assert.equal(state.generalSession.participantContests.length, 0);
  assert.equal(window.localStorage.getItem('zoj.headerNotifications.v1'), null);
});

test('ordinary participants retain the pre-start navigation and problem lock', async () => {
  state.generalSession.operatorContests = [];
  state.generalSession.participantContests = [
    {
      contest,
      division: division('a'),
      team: { participant_team_id: 'team' },
      member: { email: 'preview@example.test' },
    },
  ];
  state.participantSession = { ...previewSession(), isPreview: false };
  await render('/contests/contest/problems');
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
  assert.equal(button('문제집').disabled, true);
  assert.equal(container.textContent.includes('참가자 미리보기'), false);
});
