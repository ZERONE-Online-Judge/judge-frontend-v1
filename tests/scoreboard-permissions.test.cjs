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
let session, contest, reads, changes, release, rejectNext;
const division = { division_id: 'division', name: '일반부' };
const row = {
  rank: 1,
  team_id: 'team',
  team_name: '확인할 팀',
  solved: 1,
  penalty: 15,
  submission_count: 1,
  problem_scores: [
    {
      problem_id: 'problem',
      problem_code: 'A',
      attempts: 1,
      wrong_attempts: 0,
      solved: true,
      penalty: 15,
      best_status: 'accepted',
    },
  ],
};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const mocks = {
  '@/shared/api/client': { API_BASE_URL: '/api' },
  '@/domains/presentationAccess/api': {
    getPresentationAccount: async () => null,
    issuePresentationAccount: async () => ({
      email: 'abcd2345@score.zoj.kr',
      active: true,
      expires_at: '2099-01-01T00:00:00Z',
    }),
    revokePresentationAccount: async () => ({ revoked: true }),
  },
  '@/utils/Icons': { SvgIcon: () => null },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => 'identity:' + token,
  },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) => selector({ generalSession: session }),
  },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => {
      reads.dashboard += 1;
      return { contest, divisions: [division] };
    },
    updateContestSettings: async (contestId, token, body) => {
      changes.push({ kind: 'settings', contestId, token, body });
      contest = { ...contest, ...body };
      return contest;
    },
  },
  '@/domains/problemManagement/api': {
    getOperatorProblems: async () => {
      reads.problems += 1;
      return [
        {
          problem_id: 'problem',
          division_id: 'division',
          problem_code: 'A',
          title: '두 수의 합',
        },
      ];
    },
  },
  '@/domains/serviceCommunication/api': {
    listOperatorContestNotices: async () => [],
    listOperatorContestQuestions: async () => [],
  },
  '@/domains/submissionScoreboard/api': {
    getOperatorDivisionScoreboard: async () => {
      reads.scoreboard += 1;
      return {
        rows: [row],
        frozen_public_view: true,
        problem_stats: [
          {
            problem_id: 'problem',
            problem_code: 'A',
            total_submissions: 1,
            accepted_submissions: 1,
            accepted_team_count: 1,
            total_team_count: 1,
            acceptance_rate: 100,
          },
        ],
      };
    },
    getScoreboardRelease: async () => {
      reads.release += 1;
      return release;
    },
    updateScoreboardRelease: async (contestId, divisionId, token, body) => {
      changes.push({ kind: 'release', contestId, divisionId, token, body });
      if (release.strategy === 'immediate') {
        release = {
          ...release,
          revision: release.revision + 1,
          mode: body.action === 'undo' ? 'partial' : 'all',
          undo: body.action === 'undo' ? null : { action: 'all' },
        };
        return release;
      }
      if (release.strategy === 'resolver') {
        if (body.action === 'next' && rejectNext) {
          release = { ...release, resolver: { ...release.resolver, step: 1 } };
          throw new Error('another operator advanced');
        }
        release = {
          ...release,
          mode: body.action === 'next' ? 'all' : 'partial',
          resolver: {
            ...release.resolver,
            step: body.action === 'next' ? 1 : 0,
            pending_count: body.action === 'next' ? 0 : 1,
            last_event:
              body.action === 'next'
                ? {
                    team_id: 'team',
                    team_name: '확인할 팀',
                    problem_code: 'A',
                    status: 'accepted',
                    from_rank: 2,
                    to_rank: 1,
                  }
                : null,
          },
        };
        return release;
      }
      release = {
        ...release,
        mode: 'partial',
        ranks: [{ rank: 1, team_count: 1, revealed: body.action === 'rank' }],
        revealed_count: body.action === 'rank' ? 1 : 0,
      };
      return release;
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
const Page = source('pages/operator/OperatorScoreboardPage.tsx').default;
let root, container, client;
beforeEach(() => {
  session = {
    account: { email: 'staff@test' },
    operatorContests: [],
    operatorSession: {
      accessToken: 'token',
      staff: {
        email: 'staff@test',
        is_service_master: false,
        contest_scopes: { contest: ['contest.scoreboard.view'] },
      },
    },
  };
  contest = {
    contest_id: 'contest',
    title: '권한 대회',
    status: 'running',
    start_at: '2020-01-01T00:00:00Z',
    end_at: '2099-01-01T00:00:00Z',
    freeze_at: '2020-01-01T01:00:00Z',
    scoreboard_freeze_mode: 'auto',
  };
  reads = { dashboard: 0, problems: 0, scoreboard: 0, release: 0 };
  changes = [];
  rejectNext = false;
  release = {
    mode: 'not_started',
    ranks: [],
    revealed_count: 0,
    total_count: 1,
  };
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
async function render() {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: ['/operator/contests/contest/scoreboard'] },
          h(
            Routes,
            null,
            h(Route, {
              path: '/operator/contests/:contestId/scoreboard',
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
    async () => new Promise((resolve) => global.setTimeout(resolve, 20)),
  );
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
function manage() {
  session.operatorSession.staff.contest_scopes.contest.push(
    'contest.scoreboard.manage',
  );
}

test('scoreboard viewers see results and presentation without problem or management requests', async () => {
  await render();
  assert.match(container.textContent, /확인할 팀/);
  assert.match(container.textContent, /문제별 제출 통계/);
  assert.match(container.textContent, /표시 모드: 오토/);
  assert.ok(button('프레젠테이션 팝업'));
  for (const label of ['오토', '라이브', '프리즈', '개별 순위 공개 시작'])
    assert.equal(button(label), undefined);
  assert.ok(reads.dashboard > 0 && reads.scoreboard > 0);
  assert.equal(reads.problems, 0);
  assert.equal(reads.release, 0);
  assert.deepEqual(changes, []);
});

test('scoreboard viewers cannot begin or advance rank release after the contest ends', async () => {
  contest.status = 'ended';
  await render();
  assert.match(container.textContent, /확인할 팀/);
  assert.equal(button('개별 순위 공개 시작'), undefined);
  assert.equal(button('이 유형 전체 공개'), undefined);
  assert.equal(reads.release, 0);
  assert.deepEqual(changes, []);
});

test('scoreboard managers can change freeze mode without contest settings or problem permission', async () => {
  manage();
  await render();
  await click(button('프리즈'));
  assert.deepEqual(changes, []);
  assert.match(
    document.querySelector('dialog').textContent,
    /참가자 스코어보드와 모든 프레젠테이션/,
  );
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '내용 확인',
    ),
  );
  assert.deepEqual(changes, []);
  assert.match(
    document.querySelector('dialog').textContent,
    /정말 실행하시겠습니까/,
  );
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '프리즈로 전환',
    ),
  );
  assert.deepEqual(changes, [
    {
      kind: 'settings',
      contestId: 'contest',
      token: 'token',
      body: { scoreboard_freeze_mode: 'frozen' },
    },
  ]);
  assert.equal(reads.problems, 0);
});

test('scoreboard managers can start and advance rank release', async () => {
  manage();
  contest.status = 'ended';
  await render();
  await flush();
  await click(button('개별 순위 공개 시작'));
  await click(button('1위 공개'));
  assert.deepEqual(
    changes.map((change) => change.body),
    [{ action: 'start' }, { action: 'rank', rank: 1 }],
  );
  assert.equal(reads.problems, 0);
});

test('staff without scoreboard view cannot load scoreboard data', async () => {
  session.operatorSession.staff.contest_scopes.contest = [
    'contest.participant.view',
  ];
  await render();
  assert.equal(reads.dashboard, 0);
  assert.equal(reads.scoreboard, 0);
  assert.equal(button('프레젠테이션 팝업'), undefined);
});

test('viewers see the selected release flow before and after end without management requests', async () => {
  contest.scoreboard_release_mode = 'resolver';
  await render();
  const summary = container.querySelector(
    '[aria-label="종료 후 순위 공개 방식"]',
  );
  assert.match(summary.textContent, /결과 순차 공개 \(리졸버\)/);
  assert.match(summary.textContent, /대회가 종료되면/);
  assert.equal(summary.querySelectorAll('li').length, 3);
  contest = { ...contest, status: 'ended' };
  await act(async () =>
    client.invalidateQueries({ queryKey: ['operator', 'dashboard'] }),
  );
  await flush();
  assert.match(summary.textContent, /관리 권한이 있는 운영자/);
  assert.equal(button('결과 순차 공개 시작'), undefined);
  assert.equal(reads.release, 0);
});

test('immediate release can undo automatic publication and explicitly resume it', async () => {
  manage();
  contest.status = 'ended';
  contest.scoreboard_release_mode = 'immediate';
  release = {
    ...release,
    strategy: 'immediate',
    mode: 'all',
    revision: 0,
    undo: { action: 'automatic' },
  };
  await render();
  assert.match(container.textContent, /종료 즉시 전체 공개/);
  assert.match(container.textContent, /남은 채점과 재채점 결과/);
  assert.equal(button('개별 순위 공개 시작'), undefined);
  assert.equal(button('결과 순차 공개 시작'), undefined);
  assert.equal(button('이 유형 전체 공개'), undefined);
  assert.ok(reads.release > 0);
  assert.deepEqual(changes, []);
  await click(button('되돌리기 (Undo)'));
  assert.match(
    document.querySelector('dialog').textContent,
    /다시 전체 공개할 때까지 유지/,
  );
  await act(async () =>
    [...document.querySelectorAll('dialog button')]
      .find((b) => b.textContent === '되돌리기')
      .click(),
  );
  await flush();
  assert.deepEqual(changes[0].body, { action: 'undo', expected_revision: 0 });
  assert.match(container.textContent, /프리즈 표 유지 중/);
  assert.equal(button('되돌리기 (Undo)').disabled, true);
  await click(button('다시 전체 공개'));
  await act(async () =>
    [...document.querySelectorAll('dialog button')]
      .find((b) => b.textContent === '공개')
      .click(),
  );
  await flush();
  assert.deepEqual(changes[1].body, { action: 'all', expected_revision: 1 });
  assert.match(container.textContent, /전체 성적 공개 중/);
  assert.equal(button('되돌리기 (Undo)').disabled, false);
});

test('resolver starts then advances with the expected step and displays the revealed outcome', async () => {
  manage();
  contest.status = 'ended';
  contest.scoreboard_release_mode = 'resolver';
  release.strategy = 'resolver';
  release.resolver = {
    step: 0,
    total_steps: 1,
    pending_count: 1,
    last_event: null,
  };
  await render();
  await click(button('결과 순차 공개 시작'));
  assert.equal(button('1위 공개'), undefined);
  await click(button('다음 결과 공개'));
  assert.deepEqual(
    changes.map((change) => change.body),
    [{ action: 'start' }, { action: 'next', expected_step: 0 }],
  );
  assert.match(container.textContent, /A번 맞았습니다/);
  assert.match(container.textContent, /2위 → 1위/);
  assert.equal(container.querySelector('progress').value, 1);
  assert.equal(button('다음 결과 공개'), undefined);
});

test('resolver conflict refreshes the current step before the next attempt', async () => {
  manage();
  contest.status = 'ended';
  contest.scoreboard_release_mode = 'resolver';
  release = {
    ...release,
    strategy: 'resolver',
    mode: 'partial',
    resolver: {
      step: 0,
      total_steps: 2,
      pending_count: 1,
      last_event: null,
    },
  };
  rejectNext = true;
  await render();
  const initialReads = reads.release;
  await click(button('다음 결과 공개'));
  assert.ok(reads.release > initialReads);
  assert.ok(container.querySelector('[role="alert"]'));
  rejectNext = false;
  await click(button('다음 결과 공개'));
  assert.equal(changes[1].body.expected_step, 1);
});

test('live freeze override warns managers preparing a gradual presentation', async () => {
  manage();
  contest.scoreboard_release_mode = 'resolver';
  contest.scoreboard_freeze_mode = 'live';
  await render();
  assert.match(container.textContent, /프리즈 이후 성적도 이미 공개됩니다/);
});

test('manual release explains that live scores remain visible until reveal starts after end', async () => {
  contest.status = 'ended';
  contest.scoreboard_freeze_mode = 'live';
  contest.scoreboard_release_mode = 'manual';
  await render();
  assert.match(
    container.textContent,
    /공개 시작 전까지 프리즈 없이 최신 성적이 표시/,
  );
  assert.equal(button('개별 순위 공개 시작'), undefined);
});

test('reaching the scheduled end reveals presentation controls without a page refresh', async () => {
  manage();
  contest.end_at = new Date(Date.now() + 250).toISOString();
  const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
  try {
    await render();
    assert.equal(button('개별 순위 공개 시작'), undefined);
    await act(
      async () => new Promise((resolve) => global.setTimeout(resolve, 1050)),
    );
    await flush();
    assert.ok(button('개별 순위 공개 시작'));
  } finally {
    if (originalHidden)
      Object.defineProperty(document, 'hidden', originalHidden);
    else delete document.hidden;
  }
});

test('cancelling either freeze confirmation never changes the public mode', async () => {
  manage();
  await render();
  await click(button('라이브'));
  assert.match(
    document.querySelector('dialog').textContent,
    /최신 채점 결과와 순위를 즉시 공개/,
  );
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '취소',
    ),
  );
  assert.deepEqual(changes, []);
  await click(button('라이브'));
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '내용 확인',
    ),
  );
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '취소',
    ),
  );
  assert.deepEqual(changes, []);
  assert.equal(button('오토').disabled, true);
});

test('only scoreboard managers see the temporary presentation account card', async () => {
  await render();
  assert.equal(button('전용 계정 만들기'), undefined);
  manage();
  await render();
  assert.ok(button('전용 계정 만들기'));
});
