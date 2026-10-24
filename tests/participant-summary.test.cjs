const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://zoj.test/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const realNow = Date.now;
const now = Date.parse('2026-10-24T06:00:00Z');
let contest, session, board, problems, calls, root, client, container;
const division = { division_id: 'division', name: '일반부' };
const mocks = {
  '@/domains/contestRuntime/useContestParticipantSession': {
    useContestParticipantSession: () => session,
  },
  '@/shared/hooks/useDocumentVisibility': {
    __esModule: true,
    default: () => true,
  },
  '@/domains/submissionScoreboard/api': {
    getDivisionScoreboard: async (...args) => {
      calls.push(['public-board', ...args]);
      return structuredClone(board);
    },
  },
  '@/domains/problemManagement/api': {
    getDivisionProblems: async (...args) => {
      calls.push(['own-problems', ...args]);
      return structuredClone(problems);
    },
  },
};
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
        .find((p) => fs.existsSync(path.resolve(__dirname, '../src', p))),
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
const Summary = source(
  'components/contest/ContestParticipantSummary.tsx',
).default;
beforeEach(() => {
  Date.now = () => now;
  calls = [];
  contest = {
    contest_id: 'contest',
    status: 'open',
    start_at: '2026-10-24T04:00:00Z',
    freeze_at: '2026-10-24T05:00:00Z',
    end_at: '2026-10-24T08:00:00Z',
  };
  const active = {
    contestId: 'contest',
    accessToken: 'participant-token',
    division,
    team: { team_name: 'same name' },
    member: { name: 'member', email: 'member@example.test' },
  };
  session = {
    activeParticipantSession: active,
    participantContest: {
      contest: { contest_id: 'contest' },
      team: { participant_team_id: 'mine', team_name: 'same name' },
      member: active.member,
      division,
    },
    generalSession: null,
    divisionId: 'division',
    isPreview: false,
    ensureParticipantSession: async () => active,
  };
  board = {
    frozen: true,
    division,
    rows: [
      { team_id: 'other', team_name: 'same name', rank: 1 },
      {
        team_id: 'mine',
        team_name: 'same name',
        rank: 4,
        solved: 1,
        problem_scores: [],
      },
    ],
  };
  problems = [
    {
      problem_id: 'a',
      problem_code: 'A',
      title: 'Alpha',
      display_order: 1,
      solve_status: 'accepted',
    },
    {
      problem_id: 'b',
      problem_code: 'B',
      title: 'Beta',
      display_order: 2,
      solve_status: 'unsolved',
    },
    {
      problem_id: 'c',
      problem_code: 'C',
      title: 'Gamma',
      display_order: 3,
      solve_status: 'wrong',
    },
  ];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  Date.now = realNow;
});
after(() => dom.window.close());
async function render() {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, null, h(Summary, { contest })),
      ),
    ),
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    if (!container.textContent.includes('불러오는 중입니다')) break;
  }
}
function group(title) {
  return [...container.querySelectorAll('.contest-participant-problems')].find(
    (el) => el.querySelector('h2').textContent.startsWith(title),
  );
}
test('rank uses the server frozen board while private team solve statuses keep updating', async () => {
  await render();
  assert.match(
    container.querySelector('.contest-participant-rank').textContent,
    /4位|4위/,
  );
  assert.match(container.textContent, /프리즈 순위 기준/);
  assert.equal(group('푼 문제').querySelectorAll('a').length, 1);
  assert.equal(group('아직 못 푼 문제').querySelectorAll('a').length, 2);
  assert.equal(
    group('푼 문제').querySelector('a').getAttribute('href'),
    '/contests/contest/problems/a',
  );
  problems[1].solve_status = 'accepted';
  await act(async () => client.invalidateQueries());
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  assert.match(
    container.querySelector('.contest-participant-rank').textContent,
    /4위/,
  );
  assert.equal(group('푼 문제').querySelectorAll('a').length, 2);
  assert.equal(group('아직 못 푼 문제').querySelectorAll('a').length, 1);
  assert.ok(
    calls.every(
      (call) =>
        ['public-board', 'own-problems'].includes(call[0]) &&
        call[1] === 'contest' &&
        call[2] === 'division' &&
        call[3] === 'participant-token',
    ),
  );
});
test('start gate does not fetch ranks or problem statements early', async () => {
  contest.start_at = '2026-10-24T07:00:00Z';
  await render();
  assert.equal(calls.length, 0);
  assert.match(container.textContent, /대회 시작 후/);
  assert.equal(container.querySelectorAll('a').length, 0);
});
test('ended private resources cannot leak cached ranks or solved problem links', async () => {
  await render();
  contest = {
    ...contest,
    status: 'ended',
    scoreboard_access_after_end: 'private',
    problem_access_after_end: 'private',
  };
  const count = calls.length;
  await render();
  assert.equal(calls.length, count);
  assert.equal(container.querySelectorAll('a').length, 0);
  assert.doesNotMatch(
    container.querySelector('.contest-participant-rank').textContent,
    /4위/,
  );
});
test('hidden release rows do not disclose the final rank and published rank follows release', async () => {
  board.rows[1].is_revealed = false;
  await render();
  assert.doesNotMatch(
    container.querySelector('.contest-participant-rank').textContent,
    /4위/,
  );
  assert.match(container.textContent, /결과 공개 대기/);
  board.rows[1].is_revealed = true;
  board.rows[1].rank = 2;
  board.frozen = false;
  await act(async () => client.invalidateQueries());
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  assert.match(
    container.querySelector('.contest-participant-rank').textContent,
    /2위/,
  );
  assert.match(container.textContent, /공개 스코어보드 기준/);
});
test('preview never fetches a real rank and older participant sessions use team name', async () => {
  session.isPreview = true;
  session.activeParticipantSession.isPreview = true;
  await render();
  assert.ok(calls.every((call) => call[0] !== 'public-board'));
  assert.match(container.textContent, /미리보기에는 등수가 없습니다/);
});
test('participant-only session can match a uniquely named team without a general session', async () => {
  session.participantContest = null;
  session.activeParticipantSession.team.team_name = 'unique';
  board.rows[1].team_name = 'unique';
  await render();
  assert.match(
    container.querySelector('.contest-participant-rank').textContent,
    /4위/,
  );
});
