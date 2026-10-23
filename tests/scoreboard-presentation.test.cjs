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
  undoHistory;

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
    getPresentationAccount: async () => null,
    getPresentationScoreboard: async () => {
      displayReads++;
      return { contest, sections: divisions.map((d) => board(d.division_id)) };
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
          contest_scopes: { contest: ['contest.*'] },
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
      return global.structuredClone({
        contest,
        sections: divisions.map(({ division_id }) => board(division_id)),
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
    if (mocks[id]) return mocks[id];
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
  customBoards = {};
  undoHistory = { a: [], b: [] };
  window.localStorage.clear();
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
  assert.equal(display.querySelectorAll('button, select, input').length, 0);
  assert.equal(releaseReads, 0);
  assert.equal(updateCalls.length, 0);
  assert.match(display.textContent, /공개 대기/);
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
  assert.match(operator.textContent, /A 유형 · 종료 후 순위 공개/);
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
  assert.match(display.textContent, /공개 대기/);
  assert.equal(display.querySelector('h1'), displayTitle);
  assert.equal(display.querySelectorAll('button, select, input').length, 0);
  assert.equal(releases.b.revealed_count, 0);
  assert.equal(
    display.querySelector('svg[role="img"]').getAttribute('aria-label'),
    '2위 은메달',
  );
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 1);
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
  assert.equal(display.querySelectorAll('button, select, input').length, 0);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 1);
  assert.equal(
    display.querySelector('svg[role="img"]').closest('tr').dataset
      .scoreboardRow,
    'a-1',
  );
  assert.equal(
    display.querySelector('svg[role="img"]').getAttribute('aria-label'),
    '1위 금메달',
  );
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
      new URL(opened[0], 'https://zoj.kr').searchParams.getAll('divisionId'),
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

test('resolver presentation retains team names and moves existing rows as results arrive without controls', async () => {
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
  assert.doesNotMatch(display.textContent, /결과 공개 0 \/ 1/);
  assert.equal(display.querySelector('[role="status"]'), null);
  assert.equal(display.querySelectorAll('svg[role="img"]').length, 0);
  assert.doesNotMatch(display.textContent, /공개 대기|아직 공개되지 않은 순위/);
  assert.equal(display.querySelectorAll('button, input, select').length, 0);
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
  assert.equal(display.querySelector('[data-scoreboard-row="beta"]'), beta);
  assert.equal(display.querySelector('tbody tr').dataset.scoreboardRow, 'beta');
  assert.doesNotMatch(
    display.textContent,
    /2위 → 1위|모든 결과 공개 완료|Beta · A번/,
  );
  assert.equal(display.querySelector('[role="status"]'), null);
  assert.match(display.textContent, /최종 순위/);
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
  assert.equal(display.querySelectorAll('button, input, select').length, 0);
  assert.equal(updateCalls.length, 0);
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
  assert.match(display.textContent, /최종 순위/);
  assert.match(display.textContent, /공개됨/);
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
  assert.equal(container.querySelectorAll('button, input, select').length, 0);
  assert.equal(releaseReads, 0);
});

test('undo confirms the selected rank then updates a separate presentation and removes its medal', async () => {
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
  assert.equal(button(operator, '되돌리기 (Undo)').disabled, true);
  await act(async () => button(operator, '2위 공개').click());
  await dispatchUpdate();
  assert.ok(display.querySelector('svg[aria-label="2위 은메달"]'));
  await act(async () => button(operator, '되돌리기 (Undo)').click());
  assert.match(document.querySelector('dialog').textContent, /2위 공개를 취소/);
  await act(async () =>
    button(document.querySelector('dialog'), '취소').click(),
  );
  assert.equal(updateCalls.length, 1);
  await act(async () => button(operator, '되돌리기 (Undo)').click());
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
  assert.equal(button(operator, '되돌리기 (Undo)').disabled, true);
  assert.equal(releases.b.revealed_count, 0);
  assert.equal(display.querySelectorAll('button, select, input').length, 0);
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
  await act(async () => button(operator, '되돌리기 (Undo)').click());
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
  await act(async () => button(operator, '되돌리기 (Undo)').click());
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
  assert.match(display.textContent, /프리즈 유지/);
  assert.match(display.textContent, /프리즈 팀/);
  assert.doesNotMatch(
    display.textContent,
    /순위 공개 중|결과 공개 중|최종 순위/,
  );
  assert.equal(display.querySelector('svg[role="img"]'), null);
  assert.equal(display.querySelectorAll('button, select, input').length, 0);
});
