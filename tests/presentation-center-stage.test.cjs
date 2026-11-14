const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/presentation/contests/contest',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const sourceRoot = path.resolve(__dirname, '../src');
const cache = new Map();
let payload, client, calls, root, host, now, scoreMotion, focusClock;
const cues = [];
const sound = {
  play: (cue) => cues.push(cue),
  enabled: true,
  volume: 0.8,
  supported: true,
  unlocked: true,
  setVolume() {},
  enable() {},
  disable() {},
  test() {},
};
const mocks = {
  '@/domains/submissionScoreboard/api': {
    getOperatorPresentationScoreboard: async () => {
      calls.push('operator');
      return global.structuredClone(payload);
    },
  },
  '@/domains/presentationAccess/api': {
    getPresentationScoreboard: async () => {
      calls.push('display');
      return global.structuredClone(payload);
    },
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'test-auth-scope',
  },
  '@/domains/submissionScoreboard/presentationSync': {
    subscribeScoreboardUpdates: () => () => {},
  },
  '@/domains/submissionScoreboard/usePresentationAnnouncements': {
    usePresentationAnnouncements: () => ({
      activeAnnouncement: null,
      dismiss() {},
    }),
  },
  '@/domains/submissionScoreboard/presentationSound': {
    usePresentationSound: () => sound,
  },
  '@/domains/presentationAccess/session': {
    usePresentationSession: {
      getState: () => ({ session: null, setSession() {} }),
    },
  },
  '@/components/operator/OperatorShell': {
    OperatorAccessGate: ({ children }) => children({ accessToken: 'token' }),
  },
};
function source(relative) {
  const filename = path.resolve(sourceRoot, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (mocks[id]) return mocks[id];
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const target = id.startsWith('@/')
      ? path.resolve(sourceRoot, id.slice(2))
      : path.resolve(path.dirname(filename), id);
    const resolved = [target, `${target}.ts`, `${target}.tsx`].find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    assert.ok(resolved, `Cannot resolve ${id}`);
    return source(path.relative(sourceRoot, resolved));
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Center = source(
  'components/presentation/PresentationCenterStage.tsx',
).default;
const Header = source(
  'components/presentation/PresentationStageHeader.tsx',
).default;
const { OperatorScoreboardPresentationContent: Page } = source(
  'pages/operator/OperatorScoreboardPresentationPage.tsx',
);
const { PRESENTATION_FOCUS_DURATION, PRESENTATION_SUSPENSE_DURATION } = source(
  'domains/submissionScoreboard/presentationReleaseMotion.ts',
);
const originalNow = Date.now;

function controlFocus() {
  const nativeTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const timers = new Map();
  let nextId = 0;
  window.setTimeout = (callback, delay, ...args) => {
    if (
      [PRESENTATION_FOCUS_DURATION, PRESENTATION_SUSPENSE_DURATION].includes(
        delay,
      )
    ) {
      const id = --nextId;
      timers.set(id, { at: now + delay, callback: () => callback(...args) });
      return id;
    }
    return nativeTimeout.call(window, callback, delay, ...args);
  };
  window.clearTimeout = (id) => {
    if (!timers.delete(id)) nativeClearTimeout.call(window, id);
  };
  return {
    async advance() {
      assert.equal(
        timers.size,
        1,
        'The result must wait for its focus transition',
      );
      const [id, timer] = [...timers][0];
      timers.delete(id);
      now = timer.at;
      await act(() => timer.callback());
    },
    restore() {
      assert.equal(timers.size, 0);
      window.setTimeout = nativeTimeout;
      window.clearTimeout = nativeClearTimeout;
    },
  };
}

function row(id, rank, total = 321.25) {
  return {
    team_id: id,
    team_name: id,
    rank,
    solved: 5,
    total_score: total,
    max_score: 800,
    penalty: 272,
    submission_count: 8,
    is_revealed: true,
    problem_scores: [
      {
        problem_id: 'problem',
        problem_code: 'A10',
        attempts: 2,
        wrong_attempts: 1,
        solved: false,
        score: 42.75,
        max_score: 100,
        best_status: 'time_limit_exceeded',
      },
    ],
  };
}
function reveal({
  mode = 'ioi',
  kind = 'resolver',
  status = 'time_limit_exceeded',
  from = 25,
  to = 42.75,
  team = '한양대학교 ERICA 알고리즘 연구회와 전국의 친구들이 함께 만든 아주 긴 이름의 팀',
  title = '구간 합의 범위를 넘어 수십억 개의 원소에서 조건을 만족하는 모든 최적 경계를 찾아내는 아주 긴 문제 이름',
} = {}) {
  const previousTeam = row('team', 7, 303.5);
  previousTeam.team_name = team;
  previousTeam.problem_scores[0].score = from;
  const nextTeam = row('team', 3);
  nextTeam.team_name = team;
  nextTeam.problem_scores[0].score = to;
  const make = (teamRow) => ({
    division: { division_id: 'division', name: '대학생 · 일반부' },
    scoring_mode: mode,
    frozen: true,
    problems: [{ problem_id: 'problem', problem_code: 'A10', title }],
    rows: [teamRow],
    release: {
      strategy: 'resolver',
      mode: 'partial',
      total_count: 16,
      revealed_count: 0,
      ranks: [],
      resolver: {
        step: 1,
        total_steps: 8,
        pending_count: 7,
        last_event: {
          team_id: 'team',
          team_name: team,
          problem_code: 'A10',
          status,
          from_score: from,
          to_score: to,
          score_delta: to - from,
          from_rank: 7,
          to_rank: 3,
        },
      },
    },
  });
  return {
    key: 'event',
    kind,
    divisionId: 'division',
    previous: make(previousTeam),
    section: make(nextTeam),
    teams: [nextTeam],
  };
}
async function render(element) {
  await act(() => root.render(element));
}
async function center(value, stage = 'result') {
  await render(
    h(Center, {
      reveal: value,
      stage,
      contestTitle:
        '2026 ZOAC · 긴 대회 이름도 빠짐없이 읽을 수 있어야 하는 프레젠테이션 스코어보드',
    }),
  );
  return host.querySelector('.presentation-center-stage');
}
beforeEach(() => {
  now = Date.parse('2026-11-14T01:00:00Z');
  Date.now = () => now;
  calls = [];
  scoreMotion = undefined;
  focusClock = undefined;
  cues.length = 0;
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: null,
  });
  dom.window.HTMLElement.prototype.requestFullscreen = async function () {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: this,
    });
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  document.exitFullscreen = async () => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  focusClock?.restore();
  if (scoreMotion) {
    assert.equal(
      scoreMotion.timers.size,
      0,
      'unmount must clear the score entrance delay',
    );
    assert.equal(
      scoreMotion.frames.size,
      0,
      'unmount must cancel score interpolation',
    );
    assert.equal(
      scoreMotion.listeners.size,
      0,
      'unmount must remove reduced motion listeners',
    );
    scoreMotion.restore();
  }
  client?.clear();
  client = undefined;
  host.remove();
  Date.now = originalNow;
});
after(() => dom.window.close());

for (const mode of ['icpc', 'ioi']) {
  test(`${mode} suspense shows only the team, problem and neutral question before revealing any verdict or score`, async () => {
    const value = reveal({ mode, status: 'accepted', from: 25, to: 85 });
    const pending = await center(value, 'suspense');
    assert.equal(pending.dataset.tone, 'pending');
    assert.match(
      pending.textContent,
      mode === 'ioi' ? /몇 점일까요/ : /결과는/,
    );
    assert.equal(
      pending.querySelector('h2').textContent,
      value.teams[0].team_name,
    );
    assert.equal(
      pending.querySelector('.presentation-center-problem-title').textContent,
      value.section.problems[0].title,
    );
    for (const selector of [
      '.presentation-center-verdict',
      '.presentation-center-score-value',
      '.presentation-center-score-detail',
      '.presentation-center-metrics',
    ]) {
      assert.equal(pending.querySelector(selector), null);
    }
    assert.doesNotMatch(
      pending.textContent,
      /85|321\.25|3위|정답입니다|만점|\+60/,
    );
    const result = await center(value, 'result');
    assert.equal(
      result,
      pending,
      'The stage remains mounted for the reveal transition',
    );
    assert.equal(result.querySelector('.presentation-center-suspense'), null);
    assert.ok(
      result.querySelector(
        mode === 'ioi'
          ? '.presentation-center-score-value'
          : '.presentation-center-verdict',
      ),
    );
    assert.ok(result.querySelector('.presentation-center-metrics'));
  });
}

test('selected-rank suspense keeps unpublished team identities, points and placement out of the DOM', async () => {
  const value = reveal({ kind: 'rank', team: '아직 비밀인 팀 이름' });
  const element = await center(value, 'suspense');
  assert.match(element.textContent, /어떤 팀일까요/);
  assert.doesNotMatch(element.textContent, /아직 비밀인 팀 이름|321\.25|3위/);
  assert.equal(element.querySelector('.presentation-center-place'), null);
  assert.equal(element.querySelector('.presentation-center-teams'), null);
});

test('resolver presents the exact long team name and problem title with its distinct problem code', async () => {
  const value = reveal();
  const element = await center(value);
  assert.equal(
    element.querySelector('h2').textContent,
    value.teams[0].team_name,
  );
  assert.equal(
    element.querySelector('.presentation-center-problem-title').textContent,
    value.section.problems[0].title,
  );
  assert.equal(
    element.querySelector('.presentation-center-problem-code').textContent,
    'A10',
  );
  assert.equal(element.getAttribute('role'), 'status');
  assert.equal(element.getAttribute('aria-atomic'), 'true');
  assert.equal(element.querySelectorAll('button,input,select').length, 0);
});

test('IOI TLE with a positive partial score shows score gain, never an ICPC failure or a false AC', async () => {
  const element = await center(reveal());
  assert.equal(element.dataset.tone, 'partial');
  assert.equal(
    element.querySelector('.presentation-center-score-before').textContent,
    '25',
  );
  assert.equal(
    element.querySelector('.presentation-center-score-change > strong')
      .textContent,
    '42.75',
  );
  assert.match(element.textContent, /\+17\.75점/);
  assert.equal(
    element.querySelector('.presentation-center-unit').textContent,
    '/ 100점',
  );
  assert.match(element.textContent, /팀 총점321\.25/);
  assert.doesNotMatch(element.textContent, /시간 초과|맞았습니다|페널티/);
  assert.match(element.textContent, /7 → 3위/);
});

test('IOI full marks depend on the problem maximum, while a no-gain accepted raw verdict stays neutral', async () => {
  const full = reveal({ from: 40, to: 70 });
  full.section.rows[0].problem_scores[0].max_score = 70;
  let element = await center(full);
  assert.equal(element.dataset.tone, 'success');
  assert.equal(
    element.querySelector('.presentation-center-score-detail > span')
      .textContent,
    '만점',
  );
  assert.equal(
    element.querySelector('.presentation-center-unit').textContent,
    '/ 70점',
  );
  assert.match(element.textContent, /\+30점/);
  element = await center(
    reveal({ from: 42.75, to: 42.75, status: 'accepted' }),
  );
  assert.equal(element.dataset.tone, 'unchanged');
  assert.match(element.textContent, /점수 변화 없음/);
  assert.doesNotMatch(element.textContent, /맞았습니다|\+0점/);
});

test('IOI missing event score fields use the corresponding published problem cells rather than the team total', async () => {
  const value = reveal();
  const event = value.section.release.resolver.last_event;
  delete event.from_score;
  delete event.to_score;
  delete event.score_delta;
  const element = await center(value);
  assert.equal(
    element.querySelector('.presentation-center-score-before').textContent,
    '25',
  );
  assert.equal(
    element.querySelector('.presentation-center-score-change > strong')
      .textContent,
    '42.75',
  );
  assert.match(element.textContent, /\+17\.75점/);
});

test('ICPC verdicts remain distinct, without showing IOI score metadata sent with the event', async () => {
  for (const [status, text, tone] of [
    ['accepted', '정답입니다', 'success'],
    ['wrong_answer', '틀렸습니다', 'failure'],
    ['time_limit_exceeded', '시간 초과', 'failure'],
  ]) {
    const element = await center(reveal({ mode: 'icpc', status }));
    assert.equal(element.dataset.tone, tone);
    assert.equal(
      element.querySelector('.presentation-center-verdict > strong')
        .textContent,
      text,
    );
    assert.equal(
      element.querySelector('.presentation-center-score-change'),
      null,
    );
    assert.match(element.textContent, /해결 문제5문제/);
    assert.doesNotMatch(element.textContent, /페널티/);
  }
});

test('selected final-rank publication stays at fifth place regardless of the old frozen position', async () => {
  const value = reveal({ kind: 'rank' });
  value.previous.rows[0].rank = 2;
  value.section.rows[0].rank = 5;
  const element = await center(value);
  assert.equal(
    element.querySelector('.presentation-center-place > strong').textContent,
    '5',
  );
  assert.equal(element.querySelector('.presentation-center-footline'), null);
  assert.doesNotMatch(
    element.textContent,
    /발표한 최종 순위는 유지됩니다|잠시 후 순위표에 반영합니다|순위표로 돌아갑니다/,
  );
  assert.equal(element.querySelector('.presentation-center-problem'), null);
  assert.doesNotMatch(element.textContent, /7 → 3위/);
});

test('tied final ranks present each public team with its own IOI score and never expose a masked team name', async () => {
  const value = reveal({ kind: 'rank' });
  value.teams = [
    row('첫 번째 공동 순위 팀', 2, 312.75),
    row('두 번째 공동 순위 팀', 2, 312.75),
  ];
  value.section.rows = value.teams;
  const element = await center(value);
  assert.equal(
    element.querySelector('.presentation-center-place > strong').textContent,
    '2',
  );
  assert.match(
    element.querySelector('.presentation-center-place').textContent,
    /공동/,
  );
  assert.deepEqual(
    [...element.querySelectorAll('.presentation-center-ranked-team')].map(
      (team) => team.textContent,
    ),
    ['첫 번째 공동 순위 팀312.75점', '두 번째 공동 순위 팀312.75점'],
  );
  assert.match(element.textContent, /2팀이 같은 순위/);
  value.teams.push({
    ...row('절대로 공개하면 안 되는 팀명', 2),
    is_revealed: false,
  });
  await center(value);
  assert.doesNotMatch(host.textContent, /절대로 공개하면 안 되는 팀명/);
});

test('batch reveal ignores a residual resolver event, and masked resolver rows never render its event-supplied name', async () => {
  const value = reveal({ kind: 'all', team: '잔여 이벤트의 비밀 팀명' });
  value.section.release.mode = 'all';
  let element = await center(value);
  assert.match(element.textContent, /모든 결과를 공개합니다/);
  assert.match(element.textContent, /16팀의 최종 순위/);
  assert.doesNotMatch(
    element.textContent,
    /잔여 이벤트의 비밀 팀명|42\.75|문제 결과/,
  );
  const hidden = reveal({ team: '마스킹된 실제 팀명' });
  hidden.section.rows[0].is_revealed = false;
  hidden.teams[0].is_revealed = false;
  element = await center(hidden);
  assert.doesNotMatch(
    element.textContent,
    /마스킹된 실제 팀명|42\.75|17\.75|7 → 3위/,
  );
});

test('header preserves complete long titles and identifies before-start, live and ended states in each scoring mode', async () => {
  const title = '2026 ZOAC · 아주 긴 대회 제목 '.repeat(6);
  for (const [beforeStart, ended, mode, text] of [
    [true, false, 'ioi', '잠시 후 대회가 시작됩니다'],
    [false, false, 'icpc', '대회 진행 중'],
    [false, true, 'ioi', '대회 종료 · 결과 공개'],
  ]) {
    await render(
      h(Header, {
        title,
        beforeStart,
        ended,
        scoringMode: mode,
        timing: [
          {
            label: '프리즈',
            value: '공개 중',
            time: '2026. 11. 14. 오후 1:00',
          },
        ],
      }),
    );
    assert.equal(host.querySelector('h1').textContent, title.trim());
    assert.match(host.textContent, new RegExp(text));
    assert.doesNotMatch(host.textContent, /ICPC · 해결 문제 수|IOI · 점수제/);
    assert.equal(host.querySelector('.presentation-stage-eyebrow'), null);
    assert.equal(
      host.querySelector('.presentation-time-value').textContent,
      '공개 중',
    );
    assert.match(host.textContent, /오후 1:00/);
  }
});

async function mountPage(modeSource = 'response') {
  const initial = reveal();
  initial.section.release.resolver = {
    ...initial.section.release.resolver,
    step: 0,
    last_event: null,
  };
  initial.section.rows = global.structuredClone(initial.previous.rows);
  delete initial.section.scoring_mode;
  payload = {
    contest: {
      contest_id: 'contest',
      title: '검토용 IOI 대회',
      status: 'ended',
      start_at: '2026-11-13T00:00:00Z',
      freeze_at: '2026-11-13T01:00:00Z',
      end_at: '2026-11-13T02:00:00Z',
      ...(modeSource === 'contest' ? { scoring_mode: 'ioi' } : {}),
    },
    ...(modeSource === 'response' ? { scoring_mode: 'ioi' } : {}),
    sections: [initial.section],
    available_divisions: [initial.section.division],
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    h(
      React.StrictMode,
      null,
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          {
            initialEntries: [
              '/presentation/contests/contest?divisionId=division',
            ],
          },
          h(Page, {
            contestId: 'contest',
            token: 'only-scoped-display-token',
            now,
            displayOnly: true,
          }),
        ),
      ),
    ),
  );
  await act(() => new Promise((resolve) => global.setTimeout(resolve, 10)));
}

for (const modeSource of ['response', 'contest'])
  test(`actual presentation normalizes ${modeSource} IOI scoring and retains saved theme, 300% size and fullscreen controls across the result`, async () => {
    const preferencesKey = 'zoj.presentation.display-preferences.v1';
    window.sessionStorage.setItem(
      preferencesKey,
      JSON.stringify({ theme: 'contrast', fontScale: 3 }),
    );
    await mountPage(modeSource);
    assert.ok(calls.length > 0 && calls.every((call) => call === 'display'));
    const display = host.querySelector('.presentation-display');
    assert.equal(display.dataset.presentationTheme, 'contrast');
    assert.equal(
      display.style.getPropertyValue('--presentation-font-scale'),
      '3',
    );
    assert.equal(
      host.querySelector('.presentation-stage-board').dataset.scoringMode,
      'ioi',
    );
    await act(() =>
      host.querySelector('.presentation-fullscreen-trigger').click(),
    );
    assert.equal(document.fullscreenElement, display);
    assert.equal(host.querySelector('.presentation-fullscreen-trigger'), null);
    assert.equal(host.querySelector('.presentation-settings-trigger'), null);
    focusClock = controlFocus();
    const next = reveal();
    delete next.section.scoring_mode;
    payload.sections = [next.section];
    now += 100;
    await act(() => client.invalidateQueries());
    await act(() => new Promise((resolve) => global.setTimeout(resolve, 10)));
    assert.equal(
      host.querySelector('.presentation-stage-boards').dataset.revealStage,
      'focusing',
    );
    assert.equal(host.querySelector('.presentation-center-stage'), null);
    assert.equal(
      host.querySelector('.presentation-stage-board[data-reveal-focused]')
        .dataset.scoringMode,
      'ioi',
    );
    const focusedRow = host.querySelector('[data-active-team="true"]');
    assert.equal(focusedRow.dataset.scoreboardRow, 'team');
    assert.equal(focusedRow.querySelectorAll('.is-active-problem').length, 1);
    assert.deepEqual(cues, []);
    await focusClock.advance();
    const suspense = host.querySelector('.presentation-center-stage');
    assert.equal(suspense.dataset.stage, 'suspense');
    assert.equal(suspense.dataset.tone, 'pending');
    assert.match(suspense.textContent, /몇 점일까요/);
    assert.equal(
      suspense.querySelector('.presentation-center-score-value'),
      null,
    );
    assert.equal(suspense.querySelector('.presentation-center-metrics'), null);
    assert.deepEqual(cues, []);
    await focusClock.advance();
    const spotlight = host.querySelector('.presentation-center-stage');
    assert.ok(spotlight);
    assert.equal(spotlight.dataset.tone, 'partial');
    assert.match(spotlight.textContent, /\+17\.75점/);
    assert.doesNotMatch(spotlight.textContent, /시간 초과|맞았습니다/);
    assert.equal(display.dataset.presentationTheme, 'contrast');
    assert.equal(
      display.style.getPropertyValue('--presentation-font-scale'),
      '3',
    );
    assert.equal(
      host
        .querySelector('.presentation-stage-boards')
        .getAttribute('aria-hidden'),
      'true',
    );
    assert.deepEqual(cues, ['accepted']);
    assert.equal(document.fullscreenElement, display);
    assert.equal(host.querySelector('.presentation-fullscreen-trigger'), null);
    assert.equal(host.querySelector('.presentation-settings-trigger'), null);
    assert.match(
      host.querySelector('.presentation-fullscreen-hint').textContent,
      /Esc/,
    );
    await act(() => document.exitFullscreen());
    assert.ok(host.querySelector('.presentation-settings-trigger'));
    assert.equal(
      display.style.getPropertyValue('--presentation-font-scale'),
      '3',
    );
    assert.equal(
      JSON.parse(window.sessionStorage.getItem(preferencesKey)).theme,
      'contrast',
    );
    assert.ok(calls.every((call) => call === 'display'));
  });

test('IOI resolver announces a shared destination rank when another public team has the same score and position', async () => {
  const value = reveal();
  value.section.rows.push(row('같은 점수를 얻은 다른 팀', 3));
  let element = await center(value);
  assert.match(
    element.querySelector('.presentation-center-metrics').textContent,
    /7\s*→\s*공동\s*3위/,
  );
  value.section.release.resolver.last_event.from_rank = 3;
  element = await center(value);
  assert.match(
    element.querySelector('.presentation-center-metrics').textContent,
    /공동\s*3위\s*유지/,
  );
});

function controlledScoreMotion(initialReduced = false) {
  const native = {
    timeout: window.setTimeout,
    clear: window.clearTimeout,
    raf: window.requestAnimationFrame,
    cancel: window.cancelAnimationFrame,
    media: window.matchMedia,
  };
  const timers = new Map();
  const frames = new Map();
  const listeners = new Set();
  let nextId = 0;
  let reduced = initialReduced;
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const media = {
    get matches() {
      return reduced;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  window.matchMedia = () => media;
  scoreMotion = {
    timers,
    frames,
    listeners,
    async entrance() {
      const [id, timer] = [...timers][0] ?? [];
      assert.ok(timer, 'An animated score waits for its card entrance');
      assert.equal(timer.delay, 220);
      timers.delete(id);
      now += timer.delay;
      await act(() => timer.callback());
    },
    async frame(timestamp) {
      const pending = [...frames.values()];
      frames.clear();
      await act(() => pending.forEach((callback) => callback(timestamp)));
    },
    async reduce() {
      await act(() => {
        reduced = true;
        [...listeners].forEach((listener) => listener());
      });
    },
    restore() {
      window.setTimeout = native.timeout;
      window.clearTimeout = native.clear;
      window.requestAnimationFrame = native.raf;
      window.cancelAnimationFrame = native.cancel;
      window.matchMedia = native.media;
    },
  };
  return scoreMotion;
}
function scoreValue() {
  return host.querySelector('.presentation-center-score-value');
}
function displayedScore() {
  return Number(
    scoreValue()
      .querySelector('[data-display]')
      .getAttribute('data-display')
      .replaceAll(',', ''),
  );
}

test('score entrance interpolates only confirmed public values while accessible text exposes the final target immediately', async () => {
  const motion = controlledScoreMotion();
  await center(reveal());
  const value = scoreValue();
  const visual = value.querySelector('[data-display]');
  assert.ok(
    visual,
    'The animated display must be separate from the accessible target',
  );
  assert.equal(visual.getAttribute('aria-hidden'), 'true');
  assert.equal(
    value.querySelector('.sr-only').closest('[aria-hidden="true"]'),
    null,
  );
  assert.equal(value.textContent, '42.75');
  assert.equal(displayedScore(), 25);
  assert.equal(motion.frames.size, 0);
  await motion.entrance();
  assert.equal(value.textContent, '42.75');
  const values = [];
  for (const timestamp of [0, 110, 220, 330, 440]) {
    await motion.frame(timestamp);
    values.push(displayedScore());
    assert.equal(scoreValue(), value);
    assert.equal(value.textContent, '42.75');
  }
  assert.ok(values.some((value) => value > 25 && value < 42.75));
  assert.ok(
    values.every(
      (value, index) =>
        value >= 25 &&
        value <= 42.75 &&
        (index === 0 || value >= values[index - 1]),
    ),
  );
  assert.equal(values.at(-1), 42.75);
  assert.equal(motion.frames.size, 0);
});

test('reduced motion shows the exact final score without an entrance delay or animation frames', async () => {
  const motion = controlledScoreMotion(true);
  await center(reveal());
  assert.equal(scoreValue().textContent, '42.75');
  assert.equal(displayedScore(), 42.75);
  assert.equal(motion.timers.size, 0);
  assert.equal(motion.frames.size, 0);
});

test('enabling reduced motion during interpolation cancels outstanding frames and immediately settles the public target', async () => {
  const motion = controlledScoreMotion();
  await center(reveal());
  await motion.entrance();
  await motion.frame(0);
  await motion.frame(220);
  assert.ok(displayedScore() > 25 && displayedScore() < 42.75);
  assert.ok(motion.frames.size > 0);
  await motion.reduce();
  assert.equal(displayedScore(), 42.75);
  assert.equal(scoreValue().textContent, '42.75');
  assert.equal(motion.frames.size, 0);
  assert.equal(motion.timers.size, 0);
});

test('leaving a score card cancels both its pending entrance delay and an active interpolation', async () => {
  const motion = controlledScoreMotion();
  await center(reveal());
  assert.equal(motion.timers.size, 1);
  await render(null);
  assert.equal(motion.timers.size, 0);
  assert.equal(motion.frames.size, 0);
  assert.equal(motion.listeners.size, 0);
  await center(reveal());
  await motion.entrance();
  await motion.frame(0);
  assert.ok(motion.frames.size > 0);
  await render(null);
  assert.equal(motion.timers.size, 0);
  assert.equal(motion.frames.size, 0);
  assert.equal(motion.listeners.size, 0);
});

test('a new release resets its animated score to that event baseline and never continues the previous card frames', async () => {
  const motion = controlledScoreMotion();
  await center(reveal());
  await motion.entrance();
  await motion.frame(0);
  await motion.frame(220);
  const prior = scoreValue();
  const next = reveal({ from: 60, to: 76 });
  next.key = 'different-release-event';
  await center(next);
  assert.notEqual(scoreValue(), prior);
  assert.equal(displayedScore(), 60);
  assert.equal(scoreValue().textContent, '76');
  assert.equal(motion.frames.size, 0);
  assert.equal(motion.timers.size, 1);
  await motion.entrance();
  await motion.frame(0);
  await motion.frame(440);
  assert.equal(displayedScore(), 76);
});
