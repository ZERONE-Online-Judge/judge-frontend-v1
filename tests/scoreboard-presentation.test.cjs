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
global.Node = dom.window.Node;
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
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;

const contest = {
  contest_id: 'contest',
  title: 'ZOAC Test',
  status: 'ended',
  start_at: '2020-01-01T00:00:00Z',
  freeze_at: '2020-01-01T01:00:00Z',
  end_at: '2020-01-01T02:00:00Z',
};
const divisions = [
  { division_id: 'a', name: 'A 유형' },
  { division_id: 'b', name: 'B 유형' },
];
let releases,
  updateCalls,
  presentationReads,
  releaseReads,
  rejectUpdate,
  customBoards,
  undoHistory,
  pendingPresentationRead,
  operatorScopes,
  presentationAccountReads,
  presentationAccountValue;

function board(divisionId) {
  if (customBoards[divisionId]) return customBoards[divisionId];
  return {
    division: divisions.find((item) => item.division_id === divisionId),
    release: releases[divisionId],
    frozen: releases[divisionId].mode !== 'all',
    problems: [],
    rows: releases[divisionId].ranks.map(({ rank, revealed }) => ({
      rank,
      team_id: `${divisionId}-${rank}`,
      team_name: revealed ? `${divisionId}-team-${rank}` : '',
      solved: 1,
      penalty: 30,
      problem_scores: [],
      is_revealed: revealed,
    })),
  };
}
let displayReads = 0;
const mocks = {
  '@/shared/api/client': { API_BASE_URL: '/api' },
  '@/domains/presentationAccess/api': {
    getPresentationAccount: async () => {
      presentationAccountReads++;
      return presentationAccountValue;
    },
    getPresentationScoreboard: async () => {
      displayReads++;
      return {
        contest,
        sections: divisions.map((d) => board(d.division_id)),
        available_divisions: divisions,
      };
    },
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'test-session',
  },
  '@/components/operator/OperatorShell': {
    OperatorAccessGate: ({ children }) =>
      children({
        accessToken: 'token',
        staff: {
          email: 'master@example.test',
          display_name: '마스터',
          is_service_master: false,
          contest_scopes: { contest: operatorScopes },
        },
      }),
    OperatorPanel: ({ title, description, actions, children }) =>
      h('section', null, h('h2', null, title), description, actions, children),
    OperatorTabs: () => null,
    ScoreboardIcon: () => null,
  },
  '@/components/contest/scoreboard/ContestScoreboardTable': {
    __esModule: true,
    default: () => null,
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => ({ contest, divisions }),
  },
  '@/domains/problemManagement/api': { getOperatorProblems: async () => [] },
  '@/domains/submissionScoreboard/api': {
    getOperatorDivisionScoreboard: async () => ({
      rows: [],
      problem_stats: [],
      frozen_public_view: true,
    }),
    getOperatorPresentationScoreboard: async () => {
      presentationReads += 1;
      if (pendingPresentationRead) await pendingPresentationRead;
      return global.structuredClone({
        contest,
        sections: divisions.map(({ division_id }) => board(division_id)),
        available_divisions: divisions,
      });
    },
    getScoreboardRelease: async (_contestId, divisionId) => {
      releaseReads += 1;
      return global.structuredClone(releases[divisionId]);
    },
    updateScoreboardRelease: async (contestId, divisionId, token, body) => {
      updateCalls.push({ contestId, divisionId, token, body });
      if (rejectUpdate) throw new Error('save failed');
      const release = releases[divisionId];
      if (
        body.expected_revision !== undefined &&
        body.expected_revision !== release.revision
      )
        throw new Error('stale revision');
      if (body.action === 'undo') {
        const previous = undoHistory[divisionId].pop();
        releases[divisionId] = { ...previous, revision: release.revision + 1 };
        return global.structuredClone(releases[divisionId]);
      }
      undoHistory[divisionId].push(global.structuredClone(release));
      if (release.revision !== undefined) release.revision++;
      release.undo = {
        action: body.action,
        ...(body.rank ? { rank: body.rank } : {}),
      };
      release.ranks = release.ranks.map((item) => ({
        ...item,
        revealed:
          item.revealed || body.action === 'all' || item.rank === body.rank,
      }));
      release.revealed_count = release.ranks.filter(
        (item) => item.revealed,
      ).length;
      release.mode =
        release.revealed_count === release.total_count ? 'all' : 'partial';
      return global.structuredClone(release);
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
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (mocks[id]) return mocks[id];
    if (id.startsWith('.')) {
      const resolved = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find((file) => fs.existsSync(file));
      if (resolved)
        return source(
          path.relative(path.resolve(__dirname, '../src'), resolved),
        );
    }
    if (!id.startsWith('@/')) return nativeRequire(id);
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
const Presentation = source(
  'pages/operator/OperatorScoreboardPresentationPage.tsx',
).default;
const { PRESENTATION_RESULT_MAX_DURATION } = source(
  'domains/submissionScoreboard/presentationReleaseMotion.ts',
);
const OperatorPage = source(
  'pages/operator/OperatorScoreboardPage.tsx',
).default;
const { notifyScoreboardUpdate } = source(
  'domains/submissionScoreboard/presentationSync.ts',
);
let roots, clients;

beforeEach(() => {
  roots = [];
  clients = [];
  releases = Object.fromEntries(
    divisions.map(({ division_id }) => [
      division_id,
      {
        mode: 'partial',
        revealed_count: 0,
        total_count: 2,
        ranks: [1, 2].map((rank) => ({ rank, revealed: false, team_count: 1 })),
      },
    ]),
  );
  updateCalls = [];
  presentationReads = 0;
  displayReads = 0;
  releaseReads = 0;
  rejectUpdate = false;
  pendingPresentationRead = null;
  operatorScopes = ['contest.*'];
  presentationAccountReads = 0;
  presentationAccountValue = null;
  customBoards = {};
  undoHistory = { a: [], b: [] };
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.body.innerHTML = '';
});
afterEach(async () => {
  await act(async () => roots.forEach((root) => root.unmount()));
  clients.forEach((client) => client.clear());
});
after(() => dom.window.close());

async function flush() {
  await act(async () => new Promise((done) => global.setTimeout(done, 10)));
}
async function renderPage(Component, url) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  roots.push(root);
  clients.push(client);
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: [url] },
          h(
            Routes,
            null,
            h(Route, {
              path: '/operator/contests/:contestId/scoreboard/*',
              element: h(Component),
            }),
          ),
        ),
      ),
    ),
  );
  await flush();
  return container;
}
function button(container, text) {
  return [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
}
function assertDisplayPreferencesOnly(container) {
  const controls = [...container.querySelectorAll('button, select, input')];
  assert.ok(container.querySelector('.presentation-settings-trigger'));
  assert.ok(
    controls.every((control) =>
      control.closest('.presentation-display-settings'),
    ),
    'Presentation controls may change display preferences, never contest results',
  );
}

async function dispatchUpdate(contestId = 'contest') {
  const key = `zoj.scoreboard.updated.${contestId}`;
  await act(async () =>
    window.dispatchEvent(
      new dom.window.StorageEvent('storage', {
        key,
        newValue: window.localStorage.getItem(key) ?? 'external-update',
      }),
    ),
  );
  await flush();
  await flush();
  await flush();
}

function presentationMotionClock() {
  const nativeTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const nativeNow = Date.now;
  let now = nativeNow();
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay, ...args) => {
    // Scheduling the effect can itself consume part of the deadline under a
    // parallel test load, so capture the remaining delay rather than requiring
    // it to equal the full stage duration.
    if (delay >= 0 && delay <= PRESENTATION_RESULT_MAX_DURATION) {
      const id = --nextId;
      timers.set(id, {
        at: Math.max(now, nativeNow()) + delay,
        callback: () => callback(...args),
      });
      return id;
    }
    return nativeTimeout.call(window, callback, delay, ...args);
  };
  window.clearTimeout = (id) => {
    if (!timers.delete(id)) nativeClearTimeout.call(window, id);
  };
  return {
    async advance() {
      const [id, timer] =
        [...timers].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      assert.ok(timer, 'The current presentation stage owns a timer');
      timers.delete(id);
      now = timer.at;
      Date.now = () => now;
      try {
        await act(async () => timer.callback());
      } finally {
        Date.now = nativeNow;
      }
    },
    restore() {
      timers.clear();
      window.setTimeout = nativeTimeout;
      window.clearTimeout = nativeClearTimeout;
      Date.now = nativeNow;
    },
  };
}

test('presentation problem columns use natural code order despite conflicting display orders', async () => {
  customBoards.a = {
    division: divisions[0],
    release: { mode: 'all' },
    frozen: false,
    rows: [],
    problems: ['A2', 'A10', 'A1'].map((code, index) => ({
      problem_id: code,
      problem_code: code,
      display_order: index,
    })),
  };
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.deepEqual(
    [...display.querySelectorAll('thead th')]
      .map((el) => el.textContent)
      .filter((code) => /^A\d+$/.test(code)),
    ['A1', 'A2', 'A10'],
  );
});

test('ended presentation displays the selected division without any release controls', async () => {
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.match(display.textContent, /A 유형/);
  assert.doesNotMatch(
    display.textContent,
    /B 유형|공개할 유형|공개 컨트롤|개별 순위 공개 시작/,
  );
  assertDisplayPreferencesOnly(display);
  assert.equal(releaseReads, 0);
  assert.equal(updateCalls.length, 0);
  assert.equal(
    display.querySelectorAll('[aria-label="미공개 참가팀"]').length,
    2,
  );
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);
});

test('operator rank release refreshes a separate presentation client and leaves other ranks hidden', async () => {
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  assert.match(operator.textContent, /A 유형.*순위별 공개/);
  const displayTitle = display.querySelector('h1');
  const readsBeforeRelease = presentationReads;
  await act(async () => button(operator, '2위 공개').click());
  await flush();
  assert.deepEqual(updateCalls[0], {
    contestId: 'contest',
    divisionId: 'a',
    token: 'token',
    body: { action: 'rank', rank: 2 },
  });
  assert.equal(button(operator, '2위 공개 완료').disabled, true);
  assert.ok(window.localStorage.getItem('zoj.scoreboard.updated.contest'));
  // Browser storage events arrive in the other window, whose query cache is separate.
  await dispatchUpdate();
  assert.ok(presentationReads > readsBeforeRelease);
  assert.match(display.textContent, /a-team-2/);
  assert.doesNotMatch(display.textContent, /a-team-1|b-team/);
  assert.equal(
    display.querySelectorAll('[aria-label="미공개 참가팀"]').length,
    1,
  );
  assert.equal(display.querySelector('h1'), displayTitle);
  assertDisplayPreferencesOnly(display);
  assert.equal(releases.b.revealed_count, 0);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);
});

test('presentation without a division filter displays all divisions and ignores other contests', async () => {
  releases.a.ranks[0].revealed = true;
  releases.a.revealed_count = 1;
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation',
  );
  assert.match(display.textContent, /A 유형/);
  assert.match(display.textContent, /B 유형/);
  const readsBeforeUpdate = presentationReads;
  await dispatchUpdate('another-contest');
  assert.equal(presentationReads, readsBeforeUpdate);
  assertDisplayPreferencesOnly(display);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);
});

test('failed release does not broadcast or reveal ranks', async () => {
  rejectUpdate = true;
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  await act(async () => button(operator, '2위 공개').click());
  await flush();
  assert.match(
    operator.querySelector('[role="alert"]').textContent,
    /순위 공개 상태를 변경하지 못했습니다/,
  );
  assert.equal(
    window.localStorage.getItem('zoj.scoreboard.updated.contest'),
    null,
  );
  assert.equal(releases.a.revealed_count, 0);
});

test('unavailable browser storage does not fail a successful release', async () => {
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => {
    throw new Error('storage blocked');
  };
  try {
    assert.doesNotThrow(() => notifyScoreboardUpdate('contest'));
    const operator = await renderPage(
      OperatorPage,
      '/operator/contests/contest/scoreboard',
    );
    await flush();
    await act(async () => button(operator, '2위 공개').click());
    await flush();
    assert.equal(releases.a.revealed_count, 1);
    assert.equal(operator.querySelector('[role="alert"]'), null);
  } finally {
    dom.window.Storage.prototype.setItem = original;
  }
});

test('publishing all ranks waits for confirmation and cancel preserves release state', async () => {
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  await act(async () => button(operator, '이 유형 전체 공개').click());
  assert.equal(updateCalls.length, 0);
  assert.match(document.querySelector('dialog').textContent, /순위 공개 확인/);
  await act(async () =>
    button(document.querySelector('dialog'), '취소').click(),
  );
  assert.equal(updateCalls.length, 0);
  await act(async () => button(operator, '이 유형 전체 공개').click());
  await act(async () =>
    button(document.querySelector('dialog'), '공개').click(),
  );
  await flush();
  assert.deepEqual(updateCalls[0].body, { action: 'all' });
  assert.equal(releases.a.revealed_count, 2);
  assert.equal(releases.b.revealed_count, 0);
});

test('blocked presentation popup keeps operator controls available and offers a new tab', async () => {
  const original = window.open;
  window.open = () => null;
  try {
    const operator = await renderPage(
      OperatorPage,
      '/operator/contests/contest/scoreboard',
    );
    await flush();
    await act(async () => button(operator, '프레젠테이션 팝업').click());
    assert.match(document.querySelector('dialog').textContent, /표시할 유형/);
    await act(async () =>
      button(document.querySelector('dialog'), '선택한 유형으로 열기').click(),
    );
    const link = operator.querySelector('a[target="_blank"]');
    assert.match(link.href, /presentation\?divisionId=a$/);
    assert.match(operator.textContent, /팝업이 차단/);
    assert.ok(button(operator, '2위 공개'));
  } finally {
    window.open = original;
  }
});

test('presentation launch selects multiple divisions, remembers them and rejects an empty selection', async () => {
  const original = window.open;
  const opened = [];
  window.open = (url) => {
    opened.push(url);
    return { focus() {} };
  };
  try {
    const operator = await renderPage(
      OperatorPage,
      '/operator/contests/contest/scoreboard',
    );
    await flush();
    await act(async () => button(operator, '프레젠테이션 팝업').click());
    let dialog = document.querySelector('dialog');
    assert.equal(opened.length, 0);
    assert.deepEqual(
      [...dialog.querySelectorAll('input[type="checkbox"]')].map(
        (input) => input.checked,
      ),
      [true, false],
    );
    await act(async () =>
      dialog.querySelectorAll('input[type="checkbox"]')[1].click(),
    );
    await act(async () => button(dialog, '선택한 유형으로 열기').click());
    assert.deepEqual(
      new window.URL(opened[0], 'https://zoj.kr').searchParams.getAll(
        'divisionId',
      ),
      ['a', 'b'],
    );
    await act(async () => button(operator, '프레젠테이션 팝업').click());
    dialog = document.querySelector('dialog');
    assert.deepEqual(
      [...dialog.querySelectorAll('input[type="checkbox"]')].map(
        (input) => input.checked,
      ),
      [true, true],
    );
    await act(async () => button(dialog, '전체 해제').click());
    assert.equal(button(dialog, '선택한 유형으로 열기').disabled, true);
    await act(async () => button(dialog, '취소').click());
    assert.equal(opened.length, 1);
  } finally {
    window.open = original;
  }
});

test('presentation displays exactly the requested divisions, including multiple and missing selections', async () => {
  const multi = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a&divisionId=b',
  );
  assert.match(multi.textContent, /A 유형/);
  assert.match(multi.textContent, /B 유형/);
  const missing = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=missing',
  );
  assert.doesNotMatch(missing.textContent, /A 유형|B 유형/);
  assert.match(missing.textContent, /표시할 유형이 없습니다/);
});

test('resolver presentation focuses the old board, announces its result, then moves the same rows after returning', async (t) => {
  const clock = presentationMotionClock();
  t.after(clock.restore);
  const baseRow = {
    division: 'A 유형',
    submission_count: 1,
    penalty: 40,
    problem_scores: [
      {
        problem_code: 'A',
        solved: false,
        attempts: 0,
        wrong_attempts: 0,
        pending_attempts: 1,
        best_status: null,
      },
    ],
  };
  customBoards.a = {
    division: divisions[0],
    problems: [],
    frozen: true,
    release: {
      strategy: 'resolver',
      mode: 'partial',
      ranks: [],
      revealed_count: 0,
      total_count: 2,
      resolver: { step: 0, total_steps: 1, pending_count: 1, last_event: null },
    },
    rows: [
      {
        ...baseRow,
        team_id: 'alpha',
        team_name: 'Alpha',
        rank: 1,
        is_finalized: true,
        is_revealed: true,
        solved: 1,
        problem_scores: [],
      },
      { ...baseRow, team_id: 'beta', team_name: 'Beta', rank: 2, solved: 0 },
    ],
  };
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.match(display.textContent, /Alpha/);
  assert.match(display.textContent, /Beta/);
  assert.match(display.textContent, /\?1/);
  assert.equal(display.querySelector('[role="status"]'), null);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);
  assert.doesNotMatch(display.textContent, /공개 대기|아직 공개되지 않은 순위/);
  assertDisplayPreferencesOnly(display);
  const beta = display.querySelector('[data-scoreboard-row="beta"]');
  customBoards.a.rows = [
    {
      ...baseRow,
      team_id: 'beta',
      team_name: 'Beta',
      rank: 1,
      solved: 2,
      problem_scores: [
        {
          ...baseRow.problem_scores[0],
          solved: true,
          pending_attempts: 0,
          best_status: 'accepted',
        },
      ],
    },
    {
      ...baseRow,
      team_id: 'alpha',
      team_name: 'Alpha',
      rank: 2,
      solved: 1,
      problem_scores: [],
    },
  ];
  customBoards.a.frozen = false;
  customBoards.a.release.mode = 'all';
  customBoards.a.release.resolver = {
    step: 1,
    total_steps: 1,
    pending_count: 0,
    last_event: {
      team_id: 'beta',
      team_name: 'Beta',
      problem_code: 'A',
      status: 'accepted',
      from_rank: 2,
      to_rank: 1,
    },
  };
  await dispatchUpdate();
  assert.equal(
    display.querySelector('.presentation-stage-boards').dataset.revealStage,
    'focusing',
  );
  assert.equal(
    display.querySelector('tbody tr').dataset.scoreboardRow,
    'alpha',
  );
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  await clock.advance();
  const spotlight = display.querySelector('.presentation-center-stage');
  assert.ok(spotlight);
  assert.equal(spotlight.dataset.kind, 'resolver');
  assert.equal(spotlight.dataset.stage, 'suspense');
  assert.equal(spotlight.dataset.tone, 'pending');
  assert.match(spotlight.textContent, /결과는/);
  assert.equal(spotlight.querySelector('.presentation-center-verdict'), null);
  assert.equal(spotlight.querySelector('.presentation-center-metrics'), null);
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  await clock.advance();
  assert.equal(spotlight.dataset.stage, 'result');
  assert.match(spotlight.textContent, /Beta/);
  assert.match(spotlight.textContent, /정답입니다/);
  assert.equal(
    display.querySelector('tbody tr').dataset.scoreboardRow,
    'alpha',
  );
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  await clock.advance();
  assert.equal(spotlight.dataset.stage, 'returning');
  assert.equal(
    display.querySelector('tbody tr').dataset.scoreboardRow,
    'alpha',
  );
  await clock.advance();
  assert.equal(display.querySelector('.presentation-center-stage'), null);
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  assert.equal(
    display.querySelector('.presentation-stage-boards').dataset.revealStage,
    'holding',
  );
  assert.equal(
    display.querySelector('tbody tr').dataset.scoreboardRow,
    'alpha',
  );
  assert.equal(display.querySelector('[data-rank-moving="true"]'), null);
  await clock.advance();
  assert.equal(
    display.querySelector('.presentation-stage-boards').dataset.revealStage,
    'highlighting',
  );
  assert.equal(
    display.querySelector('tbody tr').dataset.scoreboardRow,
    'alpha',
  );
  assert.deepEqual(
    [...display.querySelectorAll('[data-rank-moving="true"]')],
    [beta],
  );
  await clock.advance();
  assert.equal(
    display.querySelector('.presentation-stage-boards').dataset.revealStage,
    'moving',
  );
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  assert.equal(display.querySelector('tbody tr').dataset.scoreboardRow, 'beta');
  assert.deepEqual(
    [...display.querySelectorAll('[data-rank-moving="true"]')],
    [beta],
  );
  await clock.advance();
  assert.equal(
    display.querySelector('.presentation-stage-boards').dataset.revealStage,
    'board',
  );
  assert.equal(display.querySelector('[data-rank-moving="true"]'), null);
  assert.equal(display.querySelector('[data-active-team="true"]'), null);
  assert.doesNotMatch(
    display.textContent,
    /2위 → 1위|모든 결과 공개 완료|Beta · A번/,
  );
  assert.equal(display.querySelector('[role="status"]'), null);
  assert.equal(
    beta.querySelector('svg[role="img"]').getAttribute('aria-label'),
    '1위 금메달',
  );
  assert.equal(
    display
      .querySelector('[data-scoreboard-row="alpha"] svg[role="img"]')
      .getAttribute('aria-label'),
    '2위 은메달',
  );
  assert.doesNotMatch(display.textContent, /\?1/);
  await clock.advance();
  assertDisplayPreferencesOnly(display);
  assert.equal(updateCalls.length, 0);
});

test('manual presentation keeps a published fifth place fixed and labels the remaining frozen ranking', async () => {
  const makeRow = (teamId, rank, final) => ({
    team_id: teamId,
    team_name: teamId,
    rank,
    rank_is_final: final,
    is_revealed: true,
    is_finalized: true,
    solved: final ? 4 : 1,
    penalty: final ? 300 : 30,
    submission_count: 5,
    problem_scores: [],
  });
  const fifth = makeRow('Final fifth', 5, true);
  const frozen = makeRow('Frozen first', 1, false);
  customBoards.a = {
    division: divisions[0],
    problems: [],
    frozen: true,
    release: {
      strategy: 'manual',
      mode: 'partial',
      ranks: [],
      revealed_count: 1,
      total_count: 5,
    },
    rows: [fifth, frozen],
  };
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.deepEqual(
    [...display.querySelectorAll('[data-scoreboard-rank-section]')].map(
      (item) => item.getAttribute('aria-label'),
    ),
    ['확정 순위', '미공개 · 프리즈 순위'],
  );
  const fifthElement = display.querySelector(
    '[data-scoreboard-row="Final fifth"]',
  );
  assert.equal(fifthElement.firstElementChild.textContent, '5');
  assert.equal(
    fifthElement
      .querySelector('[aria-label="확정 5위"]')
      .getAttribute('aria-label'),
    '확정 5위',
  );
  assert.equal(
    display
      .querySelector('[data-scoreboard-row="Frozen first"]')
      .querySelector('[aria-label="프리즈 1위"]')
      .getAttribute('aria-label'),
    '프리즈 1위',
  );
  assert.doesNotMatch(display.textContent, /결과 공개 완료/);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);

  customBoards.a.rows = [makeRow('Third place', 3, true), fifth, frozen];
  await dispatchUpdate();
  assert.equal(
    display.querySelector('[data-scoreboard-row="Final fifth"]'),
    fifthElement,
  );
  assert.equal(fifthElement.firstElementChild.textContent, '5');

  customBoards.a.rows = [frozen];
  await dispatchUpdate();
  assert.equal(
    display.querySelector('[data-scoreboard-rank-section="final"]'),
    null,
  );
  assert.equal(
    display
      .querySelector('[data-scoreboard-rank-section="frozen"]')
      .getAttribute('aria-label'),
    '미공개 · 프리즈 순위',
  );

  // Cached payloads that predate the metadata retain their ordinary table.
  const legacyRow = { ...frozen };
  delete legacyRow.rank_is_final;
  customBoards.a.rows = [legacyRow];
  await dispatchUpdate();
  assert.equal(display.querySelector('[data-scoreboard-rank-section]'), null);
  assert.equal(
    display.querySelector('[data-scoreboard-row]').firstElementChild
      .textContent,
    '1',
  );
});

test('selected division reports fully public even while another division is frozen', async () => {
  releases.a.mode = 'all';
  releases.a.ranks.forEach((item) => {
    item.revealed = true;
  });
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.equal(
    display.querySelectorAll('[aria-label="미공개 참가팀"]').length,
    0,
  );
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 2);
  assert.doesNotMatch(display.textContent, /프리즈 \/ 공개 진행/);
});

test('display-only session reads only the scoped presentation API and exposes no controls', async () => {
  const { OperatorScoreboardPresentationContent } = source(
    'pages/operator/OperatorScoreboardPresentationPage.tsx',
  );
  const Display = () =>
    h(OperatorScoreboardPresentationContent, {
      contestId: 'contest',
      token: 'display-token',
      now: Date.now(),
      displayOnly: true,
    });
  const container = await renderPage(
    Display,
    '/operator/contests/contest/scoreboard/presentation',
  );
  await flush();
  assert.ok(displayReads > 0);
  assert.equal(presentationReads, 0);
  assertDisplayPreferencesOnly(container);
  assert.equal(releaseReads, 0);
});

test('undo confirms the selected rank then restores a separate presentation without premature medals', async () => {
  releases.a.revision = 0;
  releases.a.undo = null;
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  assert.equal(button(operator, '되돌리기').disabled, true);
  await act(async () => button(operator, '2위 공개').click());
  await dispatchUpdate();
  assert.equal(display.querySelector('svg[aria-label="2위 은메달"]'), null);
  await act(async () => button(operator, '되돌리기').click());
  assert.match(document.querySelector('dialog').textContent, /2위 공개를 취소/);
  await act(async () =>
    button(document.querySelector('dialog'), '취소').click(),
  );
  assert.equal(updateCalls.length, 1);
  await act(async () => button(operator, '되돌리기').click());
  await act(async () =>
    button(document.querySelector('dialog'), '되돌리기').click(),
  );
  await flush();
  assert.deepEqual(updateCalls[1].body, {
    action: 'undo',
    expected_revision: 1,
  });
  await dispatchUpdate();
  assert.doesNotMatch(display.textContent, /a-team-2/);
  assert.equal(display.querySelector('svg[role="img"]'), null);
  assert.equal(button(operator, '2위 공개').disabled, false);
  assert.equal(button(operator, '되돌리기').disabled, true);
  assert.equal(releases.b.revealed_count, 0);
  assertDisplayPreferencesOnly(display);
});

test('failed undo keeps the published scoreboard and refreshes the operator state', async () => {
  releases.a.revision = 0;
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  await act(async () => button(operator, '2위 공개').click());
  await flush();
  const readsBefore = releaseReads;
  rejectUpdate = true;
  await act(async () => button(operator, '되돌리기').click());
  await act(async () =>
    button(document.querySelector('dialog'), '되돌리기').click(),
  );
  await flush();
  assert.equal(releases.a.revealed_count, 1);
  assert.ok(operator.querySelector('[role="alert"]'));
  assert.ok(releaseReads > readsBefore);
});

test('undo does not silently cancel a newer reveal while its confirmation is open', async () => {
  releases.a.revision = 0;
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  await act(async () => button(operator, '2위 공개').click());
  await flush();
  await act(async () => button(operator, '되돌리기').click());
  releases.a.revision = 2;
  releases.a.undo = { action: 'all' };
  await act(async () =>
    Promise.all(
      clients.map((client) =>
        client.invalidateQueries({
          queryKey: ['operator', 'scoreboard-release'],
        }),
      ),
    ),
  );
  await flush();
  await act(async () =>
    button(document.querySelector('dialog'), '되돌리기').click(),
  );
  await flush();
  assert.equal(updateCalls.at(-1).body.expected_revision, 1);
  assert.equal(releases.a.revealed_count, 1);
  assert.ok(operator.querySelector('[role="alert"]'));
});

test('legacy release reset is explicitly named and explained before confirmation', async () => {
  releases.a.undo = { action: 'legacy' };
  releases.a.revision = 0;
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  await flush();
  await act(async () => button(operator, '공개 시작 전으로 되돌리기').click());
  assert.match(
    document.querySelector('dialog').textContent,
    /단계별 기록이 없어 모든 공개를 취소/,
  );
  await act(async () =>
    button(document.querySelector('dialog'), '취소').click(),
  );
  assert.equal(updateCalls.length, 0);
});

test('immediate undo presentation keeps the frozen table without medals or release controls', async () => {
  customBoards.a = {
    ...board('a'),
    frozen: true,
    release: {
      strategy: 'immediate',
      mode: 'partial',
      ranks: [],
      revealed_count: 0,
      total_count: 1,
    },
    rows: [
      {
        team_id: 'held',
        team_name: '프리즈 팀',
        rank: 1,
        solved: 1,
        submission_count: 1,
        penalty: 30,
        problem_scores: [],
      },
    ],
  };
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.match(display.textContent, /프리즈 팀/);
  assert.doesNotMatch(
    display.textContent,
    /순위 공개 중|결과 공개 중|최종 순위/,
  );
  assert.equal(display.querySelector('svg[role="img"]'), null);
  assertDisplayPreferencesOnly(display);
});

test('presentation replaces tables with start and final-minute countdowns then resumes selected rankings', async () => {
  const original = { ...contest };
  const start = Date.now() + 3600000,
    end = start + 4 * 3600000;
  Object.assign(contest, {
    status: 'open',
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    freeze_at: new Date(end - 3600000).toISOString(),
  });
  let setNow;
  const { OperatorScoreboardPresentationContent: Content } = source(
    'pages/operator/OperatorScoreboardPresentationPage.tsx',
  );
  function TimedPresentation() {
    const [now, update] = React.useState(start - 90000);
    setNow = update;
    return h(Content, {
      contestId: 'contest',
      token: 'display-token',
      displayOnly: true,
      now,
    });
  }
  try {
    const display = await renderPage(
      TimedPresentation,
      '/operator/contests/contest/scoreboard/presentation?divisionId=a',
    );
    assert.ok(display.querySelector('.presentation-contest-countdown'));
    assert.equal(display.querySelector('table'), null);
    assert.equal(
      display.querySelector('.contest-clock-timer').getAttribute('aria-label'),
      '대회 시작까지',
    );
    const tick = async (time) => act(async () => setNow(time));
    await tick(start - 10000);
    assert.equal(
      display.querySelector('.contest-clock-focus strong').textContent,
      '10',
    );
    await tick(start);
    assert.match(display.textContent, /대회가 시작되었습니다/);
    assert.equal(display.querySelector('table'), null);
    await tick(start + 2000);
    assert.equal(
      display.querySelector('.presentation-contest-countdown'),
      null,
    );
    assert.equal(display.querySelectorAll('table').length, 1);
    assert.match(display.textContent, /A 유형/);
    assert.doesNotMatch(display.textContent, /B 유형/);
    await tick(end - 60001);
    assert.ok(display.querySelector('table'));
    await tick(end - 60000);
    assert.equal(display.querySelector('table'), null);
    assert.equal(
      display.querySelector('.contest-clock-focus strong').textContent,
      '60',
    );
    assert.match(display.textContent, /대회 종료까지/);
    await tick(end - 1);
    assert.equal(
      display.querySelector('.contest-clock-focus strong').textContent,
      '1',
    );
    await tick(end);
    assert.match(display.textContent, /대회가 종료되었습니다/);
    await tick(end + 2000);
    assert.equal(display.querySelectorAll('table').length, 1);
    assertDisplayPreferencesOnly(display);
    assert.equal(presentationReads, 0);
  } finally {
    Object.assign(contest, original);
  }
});

for (const simultaneous of [false, true]) {
  test(`number-focused schedule alerts emphasize minutes${simultaneous ? ' for coincident milestones' : ''}`, async () => {
    const original = { ...contest };
    const at = Date.now() + 1000;
    Object.assign(contest, {
      status: 'open',
      start_at: new Date(at - 3600000).toISOString(),
      freeze_at: new Date(at + (simultaneous ? 10 : 20) * 60000).toISOString(),
      end_at: new Date(at + (simultaneous ? 30 : 90) * 60000).toISOString(),
    });
    let setNow;
    const { OperatorScoreboardPresentationContent: Content } = source(
      'pages/operator/OperatorScoreboardPresentationPage.tsx',
    );
    function TimedPresentation() {
      const [now, update] = React.useState(at - 250);
      setNow = update;
      return h(Content, {
        contestId: 'contest',
        token: 'display-token',
        displayOnly: true,
        now,
      });
    }
    try {
      const display = await renderPage(
        TimedPresentation,
        '/operator/contests/contest/scoreboard/presentation',
      );
      await act(async () => setNow(at + 10));
      const titles = [
        ...display.querySelectorAll('.presentation-announcement-title'),
      ];
      assert.equal(titles.length, simultaneous ? 2 : 1);
      assert.deepEqual(
        titles.map((title) => [
          title.querySelector('.presentation-announcement-event').textContent,
          title.querySelector('strong').textContent,
          title.querySelector('.presentation-announcement-time > span')
            .textContent,
          title.querySelector('.presentation-announcement-suffix').textContent,
        ]),
        simultaneous
          ? [
              ['스코어보드 프리즈까지', '10', '분', '남았습니다'],
              ['대회 종료까지', '30', '분', '남았습니다'],
            ]
          : [['스코어보드 프리즈까지', '20', '분', '남았습니다']],
      );
      assert.match(
        display.querySelector('.presentation-announcement-footer').textContent,
        /ZOAC Test잠시 후 순위표로 돌아갑니다/,
      );
      assert.equal(updateCalls.length, 0);
    } finally {
      Object.assign(contest, original);
    }
  });
}

for (const mode of ['auto', 'live', 'frozen']) {
  test(`presentation ${mode} freeze boundary preserves display preferences and selected rankings`, async () => {
    const original = { ...contest };
    const freeze = Date.now() + 60_000;
    Object.assign(contest, {
      status: 'running',
      start_at: new Date(freeze - 3600000).toISOString(),
      freeze_at: new Date(freeze).toISOString(),
      end_at: new Date(freeze + 3600000).toISOString(),
      scoreboard_freeze_mode: mode,
    });
    window.sessionStorage.setItem(
      'zoj.presentation.display-preferences.v1',
      JSON.stringify({ theme: 'light', fontScale: 3 }),
    );
    let setNow;
    const { OperatorScoreboardPresentationContent: Content } = source(
      'pages/operator/OperatorScoreboardPresentationPage.tsx',
    );
    function TimedPresentation() {
      const [now, update] = React.useState(freeze - 3001);
      setNow = update;
      return h(Content, {
        contestId: 'contest',
        token: 'display-token',
        displayOnly: true,
        now,
      });
    }
    try {
      const display = await renderPage(
        TimedPresentation,
        '/operator/contests/contest/scoreboard/presentation?divisionId=a',
      );
      const frame = display.querySelector('.presentation-display');
      assert.equal(display.querySelectorAll('table').length, 1);
      for (const seconds of [3, 2, 1]) {
        await act(async () => setNow(freeze - seconds * 1000));
        assert.equal(display.querySelector('.presentation-display'), frame);
        assert.equal(frame.dataset.presentationTheme, 'light');
        assert.equal(
          frame.style.getPropertyValue('--presentation-font-scale'),
          '3',
        );
        if (mode === 'auto') {
          assert.equal(display.querySelector('table'), null);
          assert.equal(
            display.querySelector('.contest-clock-focus strong').textContent,
            String(seconds),
          );
          assert.equal(
            display.querySelector('[role="timer"]').getAttribute('aria-label'),
            `스코어보드 프리즈까지 ${seconds}초`,
          );
        } else {
          assert.equal(display.querySelectorAll('table').length, 1);
          assert.equal(display.querySelector('.contest-clock-focus'), null);
        }
      }
      await act(async () => setNow(freeze));
      assert.equal(display.querySelector('.presentation-display'), frame);
      assert.equal(display.querySelector('.contest-clock-focus'), null);
      assert.equal(display.querySelectorAll('table').length, 1);
      assert.match(display.textContent, /A 유형/);
      assert.doesNotMatch(display.textContent, /B 유형/);
      assertDisplayPreferencesOnly(display);
      assert.equal(updateCalls.length, 0);
    } finally {
      Object.assign(contest, original);
      if (original.scoreboard_freeze_mode === undefined)
        delete contest.scoreboard_freeze_mode;
    }
  });
}

test('custom five-digit alert minutes remain separate and expose their responsive digit count', async () => {
  const original = { ...contest };
  const at = Date.now() + 1000;
  Object.assign(contest, {
    status: 'running',
    start_at: new Date(at - 3600000).toISOString(),
    freeze_at: new Date(at + 10070 * 60000).toISOString(),
    end_at: new Date(at + 10080 * 60000).toISOString(),
    presentation_freeze_alert_minutes: [10070],
    presentation_end_alert_minutes: [10080],
  });
  let setNow;
  const { OperatorScoreboardPresentationContent: Content } = source(
    'pages/operator/OperatorScoreboardPresentationPage.tsx',
  );
  function TimedPresentation() {
    const [now, update] = React.useState(at - 250);
    setNow = update;
    return h(Content, {
      contestId: 'contest',
      token: 'display-token',
      displayOnly: true,
      now,
    });
  }
  try {
    const display = await renderPage(
      TimedPresentation,
      '/operator/contests/contest/scoreboard/presentation',
    );
    await act(async () => setNow(at));
    const titles = [
      ...display.querySelectorAll('.presentation-announcement-title'),
    ];
    assert.deepEqual(
      titles.map((title) => ({
        minute: title.querySelector('strong').textContent,
        digits: title.style.getPropertyValue('--presentation-minute-digits'),
      })),
      [
        { minute: '10070', digits: '5' },
        { minute: '10080', digits: '5' },
      ],
    );
    assert.equal(updateCalls.length, 0);
  } finally {
    Object.assign(contest, original);
    delete contest.presentation_freeze_alert_minutes;
    delete contest.presentation_end_alert_minutes;
  }
});

test('display settings change local appearance and selected divisions without publishing results', async () => {
  const display = await renderPage(
    Presentation,
    '/operator/contests/contest/scoreboard/presentation?divisionId=a',
  );
  assert.equal(display.querySelector('[role="dialog"]'), null);
  await act(async () => button(display, '화면 설정').click());
  const settings = display.querySelector('[role="dialog"]');
  assert.ok(settings);
  await act(async () =>
    settings.querySelector('[data-swatch="light"]').click(),
  );
  assert.equal(
    display.querySelector('.presentation-display').dataset.presentationTheme,
    'light',
  );
  const inputs = settings.querySelectorAll('input[type="checkbox"]');
  assert.equal(inputs.length, 2);
  let completeRead;
  pendingPresentationRead = new Promise((resolve) => {
    completeRead = resolve;
  });
  try {
    await act(async () => inputs[1].click());
    await flush();
    assert.equal(settings.querySelectorAll('input[type="checkbox"]').length, 2);
    assert.equal(settings.querySelectorAll('input:checked').length, 2);
    assert.ok(display.contains(settings));
  } finally {
    completeRead();
    pendingPresentationRead = null;
    await flush();
  }
  assert.equal(display.querySelectorAll('.presentation-stage-board').length, 2);
  await act(async () =>
    settings.querySelectorAll('input[type="checkbox"]')[0].click(),
  );
  await flush();
  assert.equal(display.querySelectorAll('.presentation-stage-board').length, 1);
  assert.match(
    display.querySelector('.presentation-stage-board__title').textContent,
    /B 유형/,
  );
  assert.equal(updateCalls.length, 0);
  assert.equal(releaseReads, 0);
  assertDisplayPreferencesOnly(display);
});

test('presentation view card contains the only popup action above rankings for view-only operators', async () => {
  operatorScopes = ['contest.scoreboard.view'];
  presentationAccountValue = {
    email: 'hidden@display.zoj.kr',
    active: true,
    expires_at: '2099-01-01T00:00:00Z',
  };
  const operator = await renderPage(
    OperatorPage,
    '/operator/contests/contest/scoreboard',
  );
  const card = [...operator.querySelectorAll('[data-edit-card]')].find(
    (item) => item.querySelector('h2')?.textContent === '프레젠테이션 뷰',
  );
  assert.ok(card);
  assert.ok(button(card, '프레젠테이션 팝업'));
  assert.equal(
    [...operator.querySelectorAll('button')].filter(
      (item) => item.textContent === '프레젠테이션 팝업',
    ).length,
    1,
  );
  const rankings = [...operator.querySelectorAll('h2')]
    .find((item) => item.textContent === '순위표')
    .closest('section');
  assert.ok(
    card.compareDocumentPosition(rankings) &
      window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
  assert.equal(button(rankings, '프레젠테이션 팝업'), undefined);
  assert.equal(presentationAccountReads, 0);
  assert.doesNotMatch(
    operator.textContent,
    /hidden@display|전용 계정 만들기|자동 로그인 링크 복사/,
  );
});

test('popup blocking fallback stays inside the presentation view card with the launched division', async () => {
  const original = window.open;
  window.open = () => null;
  try {
    const operator = await renderPage(
      OperatorPage,
      '/operator/contests/contest/scoreboard',
    );
    const card = [...operator.querySelectorAll('[data-edit-card]')].find(
      (item) => item.querySelector('h2')?.textContent === '프레젠테이션 뷰',
    );
    await act(async () => button(card, '프레젠테이션 팝업').click());
    const dialog = document.querySelector('dialog');
    await act(async () => button(dialog, '선택한 유형으로 열기').click());
    const fallback = card.querySelector('a[target="_blank"]');
    assert.ok(fallback);
    assert.equal(
      fallback.getAttribute('href'),
      '/operator/contests/contest/scoreboard/presentation?divisionId=a',
    );
    assert.match(card.textContent, /팝업이 차단/);
    const rankings = [...operator.querySelectorAll('h2')]
      .find((item) => item.textContent === '순위표')
      .closest('section');
    assert.doesNotMatch(rankings.textContent, /팝업이 차단/);
  } finally {
    window.open = original;
  }
});
