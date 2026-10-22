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
const {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
const divisions = [
  { division_id: 'a', name: '일반부' },
  { division_id: 'b', name: '고등부' },
];
const problems = [
  {
    problem_id: 'a1',
    division_id: 'a',
    problem_code: 'A',
    title: '두 수의 합',
    statement: '일반부 문제 본문',
    editorial: '일반부 풀이',
    display_order: 1,
  },
  {
    problem_id: 'b1',
    division_id: 'b',
    problem_code: 'A',
    title: '경로 찾기',
    statement: '고등부 문제 본문',
    editorial: '고등부 풀이',
    display_order: 1,
  },
];
let session,
  creates,
  waits,
  problemReads,
  assetReads,
  rejectCreate,
  rejectWait,
  currentLocation;
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const mocks = {
  '@/utils/Icons': { SvgIcon: () => null },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => 'identity:' + token,
  },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) => selector({ generalSession: session }),
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => ({
      contest: { title: '검수 대회', contest_id: 'contest' },
      divisions,
    }),
  },
  '@/domains/serviceCommunication/api': {
    listOperatorContestNotices: async () => [],
    listOperatorContestQuestions: async () => [],
  },
  '@/domains/problemManagement/api': {
    getOperatorProblems: async (contestId, token) => {
      problemReads.push({ contestId, token });
      return problems;
    },
    getProblemAssets: async (contestId, problemId, token) => {
      assetReads.push({ contestId, problemId, token });
      return [{ asset_id: problemId, original_filename: 'diagram.png' }];
    },
  },
  '@/domains/submissionScoreboard/api': {
    createOperatorTestSubmission: (contestId, problemId, token, body) => {
      const gate = deferred();
      creates.push({ contestId, problemId, token, body, gate });
      return rejectCreate
        ? Promise.reject(new Error('create failed'))
        : gate.promise;
    },
    waitOperatorTestSubmissionStatus: (contestId, submissionId, token) => {
      const gate = deferred();
      waits.push({ contestId, submissionId, token, gate });
      return rejectWait
        ? Promise.reject(new Error('poll failed'))
        : gate.promise;
    },
  },
  '@/components/contest/problem/ProblemStatementPanel': {
    default: ({ problem, assets }) =>
      h(
        'article',
        null,
        h('h1', null, problem.title),
        problem.statement,
        assets?.map((a) => a.original_filename).join(','),
      ),
  },
  '@/components/contest/problem/ProblemEditorialPanel': {
    default: ({ problem }) => h('article', null, problem.editorial),
  },
  '@/shared/ui/CodeEditor': {
    default: ({ value, onChange, disabled }) =>
      h('textarea', {
        'aria-label': '검수 코드',
        value,
        disabled,
        onChange: (event) => onChange(event.target.value),
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
const Page = source('pages/operator/OperatorProblemReviewPage.tsx').default;
let root, container, client;
beforeEach(() => {
  session = {
    account: { email: 'reviewer@test' },
    operatorContests: [],
    operatorSession: {
      accessToken: 'token',
      staff: {
        email: 'reviewer@test',
        contest_scopes: { contest: ['contest.*'] },
        is_service_master: false,
      },
    },
  };
  creates = [];
  waits = [];
  problemReads = [];
  assetReads = [];
  rejectCreate = false;
  rejectWait = false;
  document.body.innerHTML = '';
  window.localStorage.clear();
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
function Observer() {
  currentLocation = useLocation();
  return null;
}
async function render(url = '/operator/contests/contest/problem-review') {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [url] },
          h(Observer),
          h(
            Routes,
            null,
            h(Route, {
              path: '/operator/contests/:contestId/problem-review',
              element: h(Page),
            }),
          ),
        ),
      ),
    ),
  );
  await flush();
}
async function flush() {
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
  );
}
function button(text) {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text,
  );
}
function problemButton(title) {
  return [
    ...container.querySelectorAll('aside[aria-label="문제 목록"] button'),
  ].find((b) => b.textContent.includes(title));
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}
async function input(element, value) {
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
const editor = () =>
  container.querySelector('textarea[aria-label="검수 코드"]');
const result = () =>
  container.querySelector('section[aria-label="검수 채점 결과"]');
const submission = (id, status = 'waiting') => ({
  submission_id: id,
  problem_id: id === 'a-submit' ? 'a1' : 'b1',
  status,
  language: 'cpp17',
  submitted_at: new Date().toISOString(),
});

test('problem viewers read and navigate statements without review or editorial controls', async () => {
  session.operatorSession.staff.contest_scopes.contest = [
    'contest.view',
    'contest.problem.view',
  ];
  await render();
  assert.ok(problemButton('두 수의 합'));
  assert.match(
    container.querySelector('[aria-label="문제 본문"]').textContent,
    /일반부 문제 본문/,
  );
  assert.ok(assetReads.length > 0);
  assert.equal(editor(), null);
  assert.equal(button('테스트 제출'), undefined);
  assert.doesNotMatch(
    container.textContent,
    /검수 코드 제출|해설 확인|일반부 풀이/,
  );
  assert.equal(creates.length, 0);
  await click(problemButton('경로 찾기'));
  assert.match(
    container.querySelector('[aria-label="문제 본문"]').textContent,
    /고등부 문제 본문/,
  );
});

test('legacy review scopes still include reading and allow review submissions', async () => {
  session.operatorSession.staff.contest_scopes.contest = [
    'contest.view',
    'contest.problem.review',
    'contest.problem.test',
  ];
  await render();
  assert.ok(editor());
  assert.doesNotMatch(container.textContent, /해설 확인/);
  await input(editor(), 'code');
  await click(button('테스트 제출'));
  assert.equal(creates.length, 1);
});

test('review tab lists all divisions, filters and links to a problem while keeping editorial collapsed', async () => {
  await render();
  assert.ok(
    [...container.querySelectorAll('a')].some(
      (a) =>
        a.textContent === '문제 모아보기' && a.href.endsWith('/problem-review'),
    ),
  );
  assert.ok(problemButton('두 수의 합'));
  assert.ok(problemButton('경로 찾기'));
  assert.match(
    container.querySelector('[aria-label="문제 본문"]').textContent,
    /일반부 문제 본문/,
  );
  assert.equal(
    [...container.querySelectorAll('details')].find((d) =>
      d.textContent.includes('일반부 풀이'),
    ).open,
    false,
  );
  const filter = container.querySelector('select');
  await input(filter, 'b');
  assert.equal(problemButton('두 수의 합'), undefined);
  assert.match(
    container.querySelector('[aria-label="문제 본문"]').textContent,
    /고등부 문제 본문/,
  );
  await click(problemButton('경로 찾기'));
  assert.match(currentLocation.search, /problemId=b1/);
  await input(container.querySelector('input[type="search"]'), '없는문제');
  assert.match(container.textContent, /조건에 맞는 문제가 없습니다/);
  await click(button('전체 문제 보기'));
  assert.ok(problemButton('두 수의 합'));
  assert.ok(problemButton('경로 찾기'));
  assert.ok(assetReads.some((read) => read.problemId === 'a1'));
  assert.ok(assetReads.some((read) => read.problemId === 'b1'));
});

test('problem drafts and concurrent submissions stay isolated when switching problems', async () => {
  await render();
  await input(editor(), 'int main(){return 0;}');
  await click(button('테스트 제출'));
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].body, {
    language: 'cpp17',
    source_code: 'int main(){return 0;}',
  });
  assert.match(result().textContent, /제출 중/);
  assert.equal(button('채점 진행 중').disabled, true);
  await act(async () => creates[0].gate.resolve(submission('a-submit')));
  await flush();
  await click(problemButton('경로 찾기'));
  assert.equal(editor().value, '');
  const language = container.querySelectorAll('select')[1];
  await input(language, 'python311');
  await input(editor(), 'print(6)');
  await click(button('테스트 제출'));
  assert.equal(creates.length, 2);
  assert.equal(creates[1].problemId, 'b1');
  assert.equal(creates[1].body.language, 'python311');
  await act(async () =>
    creates[1].gate.resolve(submission('b-submit', 'accepted')),
  );
  await flush();
  assert.match(result().textContent, /맞았습니다/);
  await act(async () =>
    waits[0].gate.resolve(submission('a-submit', 'wrong_answer')),
  );
  await flush();
  assert.match(result().textContent, /맞았습니다/);
  assert.doesNotMatch(result().textContent, /틀렸습니다/);
  await click(problemButton('두 수의 합'));
  assert.equal(editor().value, 'int main(){return 0;}');
  assert.equal(container.querySelectorAll('select')[1].value, 'cpp17');
  assert.match(result().textContent, /틀렸습니다/);
  await click(problemButton('경로 찾기'));
  assert.equal(editor().value, 'print(6)');
  assert.match(result().textContent, /맞았습니다/);
});

test('polling recovery checks the same submission and preserves failure output whitespace', async () => {
  await render();
  await input(editor(), 'bad code');
  rejectWait = true;
  await click(button('테스트 제출'));
  await act(async () => creates[0].gate.resolve(submission('a-submit')));
  await flush();
  assert.match(result().textContent, /요청 오류/);
  rejectWait = false;
  await click(button('상태 다시 확인'));
  assert.equal(creates.length, 1);
  assert.equal(waits.length, 2);
  assert.equal(waits[1].submissionId, 'a-submit');
  await act(async () =>
    waits[1].gate.resolve({
      ...submission('a-submit', 'wrong_answer'),
      failed_testcase_order: 2,
      judge_message:
        'testcase #2: wrong answer\n[input]\n1  2\n[expected]\n3 \n[actual]\n4\n',
    }),
  );
  await flush();
  assert.match(result().textContent, /실패 테스트케이스 #2/);
  const details = [...result().querySelectorAll('details')].find((d) =>
    d.textContent.includes('출력 비교'),
  );
  assert.equal(details.open, false);
  assert.deepEqual(
    [...details.querySelectorAll('pre')].map((p) => p.textContent),
    ['1  2', '3 ', '4\n'],
  );
});

test('a failed create retains the draft and retry adds an independent attempt', async () => {
  await render();
  await input(editor(), 'draft');
  rejectCreate = true;
  await click(button('테스트 제출'));
  assert.equal(editor().value, 'draft');
  assert.match(result().textContent, /요청 오류/);
  rejectCreate = false;
  await click(button('테스트 제출'));
  assert.equal(creates.length, 2);
  await act(async () =>
    creates[1].gate.resolve({
      ...submission('a-submit', 'compile_error'),
      compile_message: 'line 1: missing semicolon',
    }),
  );
  await flush();
  assert.match(result().textContent, /컴파일 에러/);
  assert.match(result().textContent, /missing semicolon/);
  assert.match(container.textContent, /제출 이력 2건/);
});

test('drafts survive remounts but do not leak to a different reviewer', async () => {
  await render();
  await input(editor(), 'private draft');
  await act(async () => root.render(null));
  await render();
  assert.equal(editor().value, 'private draft');
  await act(async () => root.render(null));
  session.operatorSession.staff.email = 'another@test';
  session.account.email = 'another@test';
  session.operatorSession.accessToken = 'another-token';
  await render();
  assert.equal(editor().value, '');
});

test('problem view permission is required and unmount stops further polling', async () => {
  session.operatorSession.staff.contest_scopes.contest = [
    'contest.notice.view',
  ];
  await render();
  assert.match(container.textContent, /권한/);
  assert.equal(problemReads.length, 0);
  assert.equal(editor(), null);
  await act(async () => root.render(null));
  session.operatorSession.staff.contest_scopes.contest = ['contest.*'];
  await render();
  await input(editor(), 'code');
  await click(button('테스트 제출'));
  await act(async () => creates[0].gate.resolve(submission('a-submit')));
  await flush();
  assert.equal(waits.length, 1);
  await act(async () => root.render(null));
  await act(async () =>
    waits[0].gate.resolve(submission('a-submit', 'judging')),
  );
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 280)),
  );
  assert.equal(waits.length, 1);
});
