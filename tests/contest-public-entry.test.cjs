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

let state,
  calls,
  contest,
  detail,
  currentPath,
  currentLocation,
  contestError,
  boardQuestions;
const listeners = new Set();
function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
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

const division = {
  division_id: 'general',
  name: '일반부',
  code: 'general',
  description: '누구나 함께하는 유형',
};
const participant = {
  accessToken: 'participant-token',
  contestId: 'public-contest',
  division,
  member: { name: '참가자 이름', email: 'participant@example.test' },
  team: { participant_team_id: 'team', team_name: '참가팀 이름' },
};
const problem = {
  problem_id: 'sum',
  contest_id: 'public-contest',
  division_id: 'general',
  problem_code: 'A',
  title: '두 수의 합',
  statement: '두 수를 더합니다.',
  time_limit_ms: 1000,
  memory_limit_mb: 256,
  display_order: 1,
};
async function apiRequest(url, token, init) {
  calls.push({
    url,
    token,
    ...(init
      ? {
          method: init.method,
          body: init.body ? JSON.parse(init.body) : undefined,
        }
      : {}),
  });
  if (url === '/public/share/shortCode01')
    return { contest_id: 'public-contest' };
  if (url.startsWith('/public/share/')) throw new Error('Missing link');
  if (url === '/public/contests/public-contest') {
    if (contestError) throw contestError;
    return detail;
  }
  if (url.endsWith('/problems')) return [problem];
  if (url.endsWith('/boards')) {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body);
      const question = {
        ...body,
        contest_question_id: 'new-question',
        created_at: '2026-10-23T00:00:00Z',
        answers: [],
        effective_comment_scope: body.comment_scope,
      };
      boardQuestions = [question, ...boardQuestions];
      return question;
    }
    return boardQuestions;
  }
  if (url.endsWith('/notices')) return [];
  throw new Error(`Unexpected API request: ${url}`);
}

const mocks = {
  '@/domains/identityAccess/sessionStore': { useSessionStore },
  '@/domains/identityAccess/useRefreshGeneralSession': {
    useRefreshGeneralSession: () => false,
  },
  '@/domains/identityAccess/api': {
    getGeneralMe: async () => {
      calls.push({ url: '/auth/general/me' });
      return state.generalSession;
    },
  },
  '@/domains/teamParticipation/api': {
    createParticipantSessionFromGeneralToken: async () => {
      calls.push({ url: '/participant-session' });
      return participant;
    },
  },
  '@/shared/api/client': {
    apiRequest,
    API_BASE_URL: '/api',
  },
  '@/components/contest/ContestAccessDeniedModal': {
    default: () => h('div', { role: 'dialog' }, '참가 권한 없음'),
  },
  '@/shared/ui/MarkdownPreview': {
    default: ({ statement }) => h('p', null, statement),
  },
  '@/utils/Icons': { SvgIcon: () => null },
};
for (const mock of Object.values(mocks)) {
  if ('default' in mock) mock.__esModule = true;
}
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
    const relativePath = ['.ts', '.tsx']
      .map((extension) => id.slice(2) + extension)
      .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
    assert.ok(relativePath, `Cannot resolve ${id}`);
    return source(relativePath);
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
const Overview = source('pages/contest/ContestOverviewPage.tsx').default;
const Problems = source('pages/contest/ContestProblemsPage.tsx').default;
const Board = source('pages/contest/ContestBoardPage.tsx').default;
const Share = source('pages/public/ContestSharePage.tsx').default;
const Navigation = source(
  'components/contest/ContestPageNavigation.tsx',
).default;
const ContestListItem = source('components/ui/ContestListItem.tsx').default;
const { contestAccessPhase } = source('domains/contestAdministration/logic.ts');
const { ApiClientError } = source('shared/api/errors.ts');

function Observer() {
  currentLocation = useLocation();
  currentPath = currentLocation.pathname;
  return null;
}
function Directory() {
  return h(
    'ul',
    null,
    h(ContestListItem, {
      contestId: contest.contest_id,
      title: contest.title,
      organization: contest.organization_name,
      status: '종료',
      publicResourceLabels: [],
    }),
  );
}
let root, host, client;
beforeEach(() => {
  contest = {
    contest_id: 'public-contest',
    title: '함께하는 알고리즘 대회',
    organization_name: '제로원 연구회',
    overview: '함께 생각하고 풀어보는 프로그래밍 대회입니다.',
    status: 'ended',
    start_at: '2024-01-01T01:00:00Z',
    freeze_at: '2024-01-01T04:00:00Z',
    end_at: '2024-01-01T05:00:00Z',
    problem_access_after_end: 'private',
    submission_access_after_end: 'private',
    scoreboard_access_after_end: 'private',
    board_access_after_end: 'private',
    notice_access_after_end: 'private',
    editorial_access_after_end: 'private',
  };
  detail = {
    contest,
    divisions: [division],
    participant_count: 127,
    team_count: 43,
  };
  state = {
    generalSession: null,
    participantSession: null,
    setParticipantSession: (next) => setState({ participantSession: next }),
    setGeneralSession: (next) => setState({ generalSession: next }),
  };
  calls = [];
  contestError = null;
  boardQuestions = [];
  currentPath = undefined;
  document.body.innerHTML = '<main></main>';
  window.localStorage.clear();
  host = document.querySelector('main');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
after(() => dom.window.close());

function login(isParticipant = false) {
  state.generalSession = {
    accessToken: 'general-token',
    account: { email: 'visitor@example.test', display_name: '방문자' },
    operatorContests: [],
    participantContests: isParticipant
      ? [{ contest, ...participant, member: participant.member }]
      : [],
  };
  if (isParticipant) state.participantSession = participant;
}
async function flush() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function render(url = '/contests/public-contest', element) {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [url] },
          h(Observer),
          element ??
            h(
              Routes,
              null,
              h(Route, { path: '/share/:code', element: h(Share) }),
              h(Route, { path: '/contests', element: h(Directory) }),
              h(Route, {
                path: '/contests/:contestId',
                element: h(Overview),
              }),
              h(Route, {
                path: '/contests/:contestId/problems',
                element: h(Problems),
              }),
              h(Route, {
                path: '/contests/:contestId/board',
                element: h(Board),
              }),
              h(Route, {
                path: '/login',
                element: h('p', null, '로그인 화면'),
              }),
            ),
        ),
      ),
    );
  });
  await flush();
}
async function click(element) {
  assert.ok(element, 'Expected a navigable link');
  await act(async () => element.click());
  await flush();
}
function navigationPaths() {
  return [...host.querySelectorAll('nav a')].map((link) =>
    link.getAttribute('href'),
  );
}
function assertNoProtectedPrefetch() {
  assert.equal(
    calls.some((call) => /\/(notices|boards)$/.test(call.url)),
    false,
    'Unrelated private notices and questions must not be prefetched',
  );
}
function assertPublicOverview() {
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(host.querySelector('h1')?.textContent, contest.title);
  assert.ok(host.textContent.includes(contest.organization_name));
  assert.ok(host.textContent.includes(contest.overview));
}

test('anonymous visitors can open a contest overview from the directory even when every ended resource is private', async () => {
  await render('/contests');
  const link = host.querySelector('li a');
  assert.equal(link?.getAttribute('href'), '/contests/public-contest');
  await click(link);
  assert.equal(currentPath, '/contests/public-contest');
  assertPublicOverview();
  assert.deepEqual(navigationPaths(), ['/contests/public-contest']);
  assertNoProtectedPrefetch();
});

test('only-public problem book is reachable anonymously without fetching participant-only notices or questions', async () => {
  contest.problem_access_after_end = 'public';
  for (const resource of ['submission', 'scoreboard', 'board', 'notice']) {
    contest[`${resource}_access_after_end`] = 'participants';
  }
  await render();
  assertPublicOverview();
  assert.deepEqual(navigationPaths(), [
    '/contests/public-contest',
    '/contests/public-contest/problems',
  ]);
  assertNoProtectedPrefetch();
  await click(host.querySelector('nav a[href$="/problems"]'));
  assert.ok(host.textContent.includes(problem.title));
  assert.ok(
    calls.some(
      (call) =>
        call.url === '/contests/public-contest/divisions/general/problems' &&
        call.token === undefined,
    ),
  );
  assertNoProtectedPrefetch();
});

test('signing in without joining does not turn public contest entry into a participant access denial', async () => {
  login();
  await render('/contests');
  await click(host.querySelector('li a'));
  assertPublicOverview();
  assert.deepEqual(navigationPaths(), ['/contests/public-contest']);
  assert.equal(
    calls.some((call) => call.url === '/participant-session'),
    false,
  );
  assertNoProtectedPrefetch();
});

test('public overview includes the real participant totals, duration, host, description and KST schedule', async () => {
  await render();
  assertPublicOverview();
  const facts = host.querySelector('[aria-label="대회 일정과 참가 규모"]');
  assert.ok(facts);
  assert.match(facts.textContent, /127명/);
  assert.match(facts.textContent, /43개 참가팀/);
  assert.match(facts.textContent, /4시간/);
  assert.match(facts.textContent, /한국 시간 \(KST\)/);
  assert.match(facts.textContent, /2024년 1월 1일.*10:00/);
  assert.match(facts.textContent, /2024년 1월 1일.*14:00/);
  assert.ok(host.textContent.includes(division.name));
});

test('a contest with zero registrations displays zero rather than implying its count is unavailable', async () => {
  detail.participant_count = 0;
  detail.team_count = 0;
  await render();
  const facts = host.querySelector('[aria-label="대회 일정과 참가 규모"]');
  assert.match(facts.textContent, /0명/);
  assert.match(facts.textContent, /0개 참가팀/);
  assert.doesNotMatch(facts.textContent, /집계 정보 없음/);
});

for (const phase of ['before', 'running']) {
  test(`${phase} contest has a public overview without participant-only resource requests`, async () => {
    const now = Date.now();
    contest.status = phase === 'before' ? 'open' : 'running';
    contest.start_at = new Date(
      now + (phase === 'before' ? 3600000 : -3600000),
    ).toISOString();
    contest.end_at = new Date(now + 7200000).toISOString();
    for (const resource of [
      'problem',
      'submission',
      'scoreboard',
      'board',
      'notice',
    ]) {
      contest[`${resource}_access_after_end`] = 'participants';
    }
    await render();
    assertPublicOverview();
    assert.deepEqual(navigationPaths(), ['/contests/public-contest']);
    assertNoProtectedPrefetch();
  });
}

test('ended participant access permits participant resources but never overrides private resources', async () => {
  login(true);
  contest.problem_access_after_end = 'participants';
  contest.submission_access_after_end = 'private';
  contest.scoreboard_access_after_end = 'participants';
  contest.board_access_after_end = 'participants';
  await render(
    '/contests/public-contest',
    h(Navigation, { contest, contestId: contest.contest_id }),
  );
  assert.deepEqual(navigationPaths(), [
    '/contests/public-contest',
    '/contests/public-contest/problems',
    '/contests/public-contest/scoreboard',
    '/contests/public-contest/board',
  ]);
});

for (const resource of ['board', 'notice']) {
  test(`the shared board navigation is available when only ${resource} is public`, async () => {
    contest[`${resource}_access_after_end`] = 'public';
    await render(
      '/contests/public-contest',
      h(Navigation, { contest, contestId: contest.contest_id }),
    );
    assert.deepEqual(navigationPaths(), [
      '/contests/public-contest',
      '/contests/public-contest/board',
    ]);
  });
}

test('direct access to a private ended problem book does not fetch problems even for a participant', async () => {
  login(true);
  await render('/contests/public-contest/problems');
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
  assert.equal(host.textContent.includes(problem.title), false);
  assert.equal(
    host.querySelector('nav a[href="/contests/public-contest/problems"]'),
    null,
  );
});

test('an explicit ended status opens its public archive even if saved schedule dates remain in the future', async () => {
  contest.start_at = '2099-01-01T01:00:00Z';
  contest.end_at = '2099-01-01T05:00:00Z';
  contest.problem_access_after_end = 'public';
  assert.equal(contestAccessPhase(contest), 'ended');
  await render('/contests/public-contest/problems');
  assert.ok(host.textContent.includes(problem.title));
  assert.ok(host.querySelector('nav a[href$="/problems"]'));
  assertNoProtectedPrefetch();
});

test('participant overview uses the shared progress panel and keeps account, team and notices', async () => {
  login(true);
  await render();
  await flush();
  assert.match(host.textContent, /대회가 종료되었습니다/);
  assert.ok(host.querySelector('.contest-participant-summary'));
  assert.match(host.textContent, /참가자 이름/);
  assert.match(host.textContent, /참가팀 이름/);
  assert.match(host.textContent, /공지사항/);
  assert.equal(host.querySelectorAll('.zoj-overview-card').length, 2);
  assert.equal(host.querySelector('.zoj-overview-schedule'), null);
  assert.equal(host.querySelector('a[href*="/settings"]'), null);
});

for (const status of [401, 403, 404]) {
  test(`anonymous contest entry with ${status} redirects to login and retains the full destination`, async () => {
    contestError = new ApiClientError(status, 'not_found', 'Unavailable');
    const target = '/contests/public-contest?source=invitation#schedule';
    await render(target);
    await flush();
    assert.equal(currentPath, '/login');
    const params = new URLSearchParams(currentLocation.search);
    assert.equal(params.get('moveTo'), target);
    assert.equal(params.get('contestId'), 'public-contest');
    assert.equal(params.has('reason'), false);
    assertNoProtectedPrefetch();
  });
}

test('a participant-only ended resource redirects guests even when another resource is public', async () => {
  contest.problem_access_after_end = 'participants';
  contest.scoreboard_access_after_end = 'public';
  await render('/contests/public-contest/problems?divisionId=general#A');
  assert.equal(currentPath, '/login');
  assert.equal(
    new URLSearchParams(currentLocation.search).get('moveTo'),
    '/contests/public-contest/problems?divisionId=general#A',
  );
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
});

test('a running contest participant route redirects guests before fetching private resources', async () => {
  contest.status = 'running';
  contest.start_at = new Date(Date.now() - 3600000).toISOString();
  contest.end_at = new Date(Date.now() + 3600000).toISOString();
  await render('/contests/public-contest/problems');
  assert.equal(currentPath, '/login');
  assert.equal(
    calls.some((call) => call.url.endsWith('/problems')),
    false,
  );
});

test('a signed-in account without contest access stays on an explanatory denial instead of looping through login', async () => {
  login();
  contestError = new ApiClientError(404, 'not_found', 'Unavailable');
  await render();
  await flush();
  assert.equal(currentPath, '/contests/public-contest');
  assert.match(host.textContent, /접근 권한이 없습니다/);
  assertNoProtectedPrefetch();
});

test('a server outage does not send a guest to login', async () => {
  contestError = new ApiClientError(503, 'api_busy', 'Unavailable');
  await render();
  assert.equal(currentPath, '/contests/public-contest');
});

async function openQuestionForm(policy = {}) {
  login(true);
  Object.assign(contest, {
    status: 'running',
    start_at: new Date(Date.now() - 3600000).toISOString(),
    end_at: new Date(Date.now() + 3600000).toISOString(),
    ...policy,
  });
  await render('/contests/public-contest/board');
  await click(
    [...host.querySelectorAll('button')].find(
      (item) => item.textContent === '질문하기',
    ),
  );
  return host.querySelector('form[aria-label="질문 작성"]');
}

test('question composer starts with contest defaults and sends the selected comment scope', async () => {
  const form = await openQuestionForm({
    board_question_default_visibility: 'private',
    board_comment_default_scope: 'operators',
  });
  assert.equal(
    form.querySelector('input[name="question_visibility"][value="private"]')
      .checked,
    true,
  );
  assert.equal(
    form.querySelector(
      'input[name="question_comment_scope"][value="operators"]',
    ).checked,
    true,
  );
  for (const [selector, value] of [
    ['input[placeholder="제목을 입력하세요."]', '정책 질문'],
    ['textarea', '질문 내용'],
  ]) {
    const input = form.querySelector(selector);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA'
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype,
        'value',
      ).set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  await act(async () =>
    form.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
  await flush();
  const request = calls.find(
    (item) => item.method === 'POST' && item.url.endsWith('/boards'),
  );
  assert.deepEqual(request.body, {
    body: '질문 내용',
    title: '정책 질문',
    visibility: 'private',
    comment_scope: 'operators',
  });
  assert.match(host.textContent, /운영진만 댓글을 작성할 수 있는 질문/);
  assert.equal(host.querySelector('form.contest-reply-form'), null);
});

test('forced private questions and staff-only comments disable forbidden participant choices', async () => {
  const form = await openQuestionForm({
    board_question_visibility_policy: 'private',
    board_question_default_visibility: 'public',
    board_comment_scope_policy: 'operators',
    board_comment_default_scope: 'all',
  });
  assert.equal(
    form.querySelector('input[name="question_visibility"][value="public"]')
      .disabled,
    true,
  );
  assert.equal(
    form.querySelector('input[name="question_visibility"][value="private"]')
      .checked,
    true,
  );
  assert.equal(
    form.querySelector('input[name="question_comment_scope"][value="all"]')
      .disabled,
    true,
  );
  assert.equal(
    form.querySelector(
      'input[name="question_comment_scope"][value="operators"]',
    ).checked,
    true,
  );
  assert.match(form.textContent, /설정으로 고정/);
});

test('an existing question with staff-only comments keeps its replies readable without a participant composer', async () => {
  login(true);
  contest.board_access_after_end = 'participants';
  contest.board_write_after_end = true;
  boardQuestions = [
    {
      contest_question_id: 'q',
      title: '운영진에게 질문',
      body: '질문 내용',
      visibility: 'public',
      comment_scope: 'operators',
      effective_comment_scope: 'operators',
      created_at: '2026-10-23T00:00:00Z',
      answers: [
        {
          contest_answer_id: 'a',
          body: '운영진 답변',
          created_by_role: 'operator',
          created_by_name: '운영자',
          created_at: '2026-10-23T00:01:00Z',
        },
      ],
    },
  ];
  await render('/contests/public-contest/board?questionId=q');
  assert.match(host.textContent, /운영진 답변/);
  assert.match(host.textContent, /운영진만 댓글을 작성/);
  assert.equal(host.querySelector('form.contest-reply-form'), null);
});

test('short share links preserve private-contest login and return to the participant destination', async () => {
  contestError = new ApiClientError(404, 'not_found', 'Missing');
  await render('/share/shortCode01');
  await flush();
  await flush();
  assert.equal(currentPath, '/login');
  const query = new URLSearchParams(currentLocation.search);
  assert.equal(query.get('moveTo'), '/contests/public-contest');
  assert.equal(query.get('contestId'), 'public-contest');
});

test('a participant can follow a short share link directly to the contest', async () => {
  login(true);
  await render('/share/shortCode01');
  await flush();
  assert.equal(currentPath, '/contests/public-contest');
  assert.ok(host.textContent.includes(contest.title));
});

test('invalid and missing short links show a useful error without navigating away', async () => {
  await render('/share/not-valid');
  assert.ok(host.textContent.includes('공유 링크를 찾을 수 없습니다'));
  assert.equal(calls.length, 0);
});

test('public schedule ticks down and crosses start and end boundaries without protected requests', async () => {
  const originalNow = Date.now;
  const originalInterval = window.setInterval;
  const ticks = [];
  let now = Date.parse('2026-11-10T03:55:54Z');
  Date.now = () => now;
  window.setInterval = (callback, delay, ...args) => {
    if (delay === 250) {
      ticks.push(callback);
      return -ticks.length;
    }
    return originalInterval.call(window, callback, delay, ...args);
  };
  try {
    contest.status = 'open';
    contest.start_at = '2026-11-11T04:00:00Z';
    contest.end_at = '2026-11-11T08:00:00Z';
    await render();
    let timer = host.querySelector('[role="timer"]');
    assert.equal(timer.getAttribute('aria-label'), '대회 시작까지');
    assert.equal(timer.getAttribute('aria-live'), 'off');
    assert.deepEqual(
      [...timer.querySelectorAll('.contest-clock-digit-new')].map(
        (el) => el.textContent,
      ),
      ['1', '00', '04', '06'],
    );
    assert.ok(ticks.length);
    now += 1000;
    await act(() => ticks.forEach((tick) => tick()));
    assert.deepEqual(
      [...host.querySelectorAll('[role="timer"] .contest-clock-digit-new')].map(
        (el) => el.textContent,
      ),
      ['1', '00', '04', '05'],
    );
    now = Date.parse(contest.start_at);
    await act(() => ticks.forEach((tick) => tick()));
    assert.match(host.textContent, /대회가 시작되었습니다/);
    now += 2000;
    await act(() => ticks.forEach((tick) => tick()));
    timer = host.querySelector('[role="timer"]');
    assert.equal(timer.getAttribute('aria-label'), '대회 종료까지');
    assert.deepEqual(
      [...timer.querySelectorAll('.contest-clock-digit-new')].map(
        (el) => el.textContent,
      ),
      ['03', '59', '58'],
    );
    assert.match(
      host.querySelector('.contest-public-status').textContent,
      /진행 중/,
    );
    now = Date.parse(contest.end_at);
    await act(() => ticks.forEach((tick) => tick()));
    assert.equal(host.querySelector('[role="timer"]'), null);
    assert.match(
      host.querySelector('.contest-public-status').textContent,
      /종료된 대회/,
    );
    assert.match(
      host.querySelector('.contest-clock-message').textContent,
      /대회가 종료되었습니다/,
    );
    assertNoProtectedPrefetch();
  } finally {
    Date.now = originalNow;
    window.setInterval = originalInterval;
  }
});

test('public schedule preserves KST midnight and the next-day end date', async () => {
  contest.start_at = '2024-01-01T15:00:00Z';
  contest.end_at = '2024-01-02T18:30:00Z';
  await render();
  const moments = [
    ...host.querySelectorAll(
      '.contest-clock-moment[data-kind="start"] time, .contest-clock-moment[data-kind="end"] time',
    ),
  ];
  assert.equal(moments[0].dateTime, contest.start_at);
  assert.match(moments[0].textContent, /2024년 1월 2일.*00:00/);
  assert.match(moments[1].textContent, /2024년 1월 3일.*03:30/);
});

test('unconfirmed or invalid schedules never show a misleading countdown', async () => {
  contest.status = 'draft';
  contest.start_at = '2099-01-01T01:00:00Z';
  contest.end_at = '2099-01-01T05:00:00Z';
  await render();
  assert.equal(host.querySelector('[role="timer"]'), null);
  assert.match(
    host.querySelector('.contest-public-schedule').textContent,
    /일정 미정/,
  );
  assert.match(
    host.querySelector('.contest-public-intro').textContent,
    /대회 일정을 준비/,
  );
  contest.status = 'open';
  contest.start_at = 'invalid';
  contest.end_at = 'invalid';
  await render();
  assert.equal(host.querySelector('[role="timer"]'), null);
  assert.doesNotMatch(
    host.querySelector('.contest-public-schedule').textContent,
    /NaN|Invalid Date/,
  );
});
