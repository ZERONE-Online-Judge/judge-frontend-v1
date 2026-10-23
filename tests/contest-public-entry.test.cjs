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

let state, calls, contest, detail, currentPath, currentLocation, contestError;
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
async function apiRequest(url, token) {
  calls.push({ url, token });
  if (url === '/public/contests/public-contest') {
    if (contestError) throw contestError;
    return detail;
  }
  if (url.endsWith('/problems')) return [problem];
  if (url.endsWith('/notices') || url.endsWith('/boards')) return [];
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
  currentPath = undefined;
  document.body.innerHTML = '<main></main>';
  window.localStorage.clear();
  host = document.querySelector('main');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
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
  assert.equal(host.querySelector('progress')?.value, 100);
  assert.match(host.textContent, /대회 진행률/);
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
