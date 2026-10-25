const { test, after, afterEach } = require('node:test');
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
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
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
const {
  operatorContestStatus: status,
  countdownParts,
  formatOperatorMoment,
} = source('domains/contestAdministration/operatorStatus.ts');
const StatusPanel = source(
  'components/operator/OperatorContestStatus.tsx',
).default;
const contest = {
  contest_id: 'c',
  status: 'open',
  start_at: '2026-10-01T01:00:00Z',
  freeze_at: '2026-10-01T04:00:00Z',
  end_at: '2026-10-01T05:00:00Z',
};
const start = Date.parse(contest.start_at),
  freeze = Date.parse(contest.freeze_at),
  end = Date.parse(contest.end_at);

test('scheduled transitions match start, freeze and end boundaries without waiting for a refetch', () => {
  const hidden = { ...contest, status: 'scheduled' };
  assert.equal(status(hidden, start - 1).phase, 'before');
  assert.equal(status(hidden, start - 1).visibility, '운영자만 열람');
  assert.equal(status(hidden, start).phase, 'running');
  assert.equal(status(hidden, start).submissionLabel, '제출 가능');
  assert.equal(status(hidden, start).visibility, '대회 목록 공개');
  assert.equal(status(contest, freeze - 1).freezeActive, false);
  assert.equal(status(contest, freeze - 1).freezeRemaining, 1);
  assert.equal(status(contest, freeze).freezeActive, true);
  assert.equal(status(contest, freeze).submissionLabel, '제출 가능');
  assert.equal(status(contest, freeze).progress, 75);
  assert.equal(status(contest, freeze).freezeProgress, 75);
  assert.equal(status(contest, end).phase, 'ended');
  assert.equal(status(contest, end).submissionLabel, '제출 마감');
  assert.equal(status(contest, end).remaining, null);
  assert.equal(status(contest, end).progress, 100);
});

test('freeze markers use the contest time scale and omit timestamps outside it', () => {
  assert.equal(
    status({ ...contest, freeze_at: contest.start_at }, start).freezeProgress,
    0,
  );
  assert.equal(
    status({ ...contest, freeze_at: contest.end_at }, start).freezeProgress,
    100,
  );
  for (const freeze_at of [
    'invalid',
    new Date(start - 1).toISOString(),
    new Date(end + 1).toISOString(),
  ]) {
    assert.equal(status({ ...contest, freeze_at }, start).freezeProgress, null);
  }
  assert.equal(
    status({ ...contest, end_at: 'invalid' }, start).freezeProgress,
    null,
  );
});

test('drafts and explicitly ended contests override timestamps', () => {
  for (const value of ['draft', 'schedule_tbd']) {
    const draft = status({ ...contest, status: value }, end + 86400000);
    assert.equal(draft.phase, 'draft');
    assert.equal(draft.remaining, null);
    assert.equal(draft.showSchedule, false);
  }
  for (const value of ['ended', 'finalized', 'archived']) {
    assert.equal(
      status({ ...contest, status: value }, start + 1000).phase,
      'ended',
    );
  }
  assert.equal(
    status({ ...contest, status: 'running' }, start - 1000).phase,
    'before',
  );
});

test('manual freeze and live overrides stay separate from submission availability and post-contest release', () => {
  const live = status(
    { ...contest, scoreboard_freeze_mode: 'live' },
    freeze + 1000,
  );
  assert.equal(live.freezeActive, false);
  assert.equal(live.freezeRemaining, null);
  assert.match(live.scoreboard.label, /실시간/);
  const frozen = status(
    { ...contest, scoreboard_freeze_mode: 'frozen' },
    start + 1000,
  );
  assert.equal(frozen.freezeActive, true);
  assert.equal(frozen.submissionLabel, '제출 가능');
  assert.match(frozen.scoreboard.label, /수동/);
  for (const [mode, label] of [
    ['manual', '순위별 공개'],
    ['immediate', '종료 즉시 전체 공개'],
    ['resolver', '결과 순차 공개 (리졸버)'],
  ]) {
    assert.equal(
      status({ ...contest, scoreboard_release_mode: mode }, end).scoreboard
        .label,
      label,
    );
  }
});

test('visibility switches independently after ending and invalid schedules never display a running countdown', () => {
  const privateContest = {
    ...contest,
    visibility: 'private',
    visibility_after_end: 'public',
  };
  assert.equal(
    status(privateContest, start).visibility,
    '등록 참가자·운영자만 열람',
  );
  assert.equal(status(privateContest, end).visibility, '대회 목록 공개');
  for (const end_at of ['invalid', contest.start_at]) {
    const result = status({ ...contest, end_at }, start + 1000);
    assert.equal(result.phase, 'unknown');
    assert.equal(result.remaining, null);
    assert.equal(result.showSchedule, false);
  }
});

test('countdown keeps days and hours and KST dates are independent of the browser timezone', () => {
  assert.deepEqual(countdownParts(90061000), {
    days: 1,
    hours: '01',
    minutes: '01',
    seconds: '01',
  });
  assert.equal(countdownParts(1).seconds, '01');
  assert.equal(countdownParts(-1000).seconds, '00');
  assert.match(
    formatOperatorMoment('2026-09-30T15:00:00Z'),
    /2026년 10월 1일.*00:00/,
  );
  assert.equal(formatOperatorMoment('invalid'), '일정 확인 필요');
});

let root, container;
const realNow = Date.now,
  realInterval = window.setInterval,
  realClear = window.clearInterval;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  container?.remove();
  Date.now = realNow;
  window.setInterval = realInterval;
  window.clearInterval = realClear;
});
after(() => dom.window.close());
test('operator clock crosses countdown, notice, freeze and end with settings permissions intact', async () => {
  let now = start - 60_000;
  Date.now = () => now;
  const ticks = new Map();
  window.setInterval = (callback) => {
    ticks.set(1, callback);
    return 1;
  };
  window.clearInterval = (id) => ticks.delete(id);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const render = async (props = {}) => {
    await act(async () =>
      root.render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(StatusPanel, { contest, ...props }),
        ),
      ),
    );
    await act(
      async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
    );
  };
  const tick = async (time) => {
    now = time;
    await act(async () => ticks.forEach((callback) => callback()));
  };
  await render();
  assert.match(container.textContent, /대회 시작 전/);
  assert.deepEqual(
    [...container.querySelectorAll('.contest-clock-moment')].map((moment) => [
      moment.dataset.kind,
      moment.dataset.compact,
    ]),
    [
      ['start', 'false'],
      ['freeze', 'false'],
      ['end', 'false'],
    ],
  );
  const timeline = container.querySelector('.contest-clock-timeline');
  assert.equal(timeline.style.getPropertyValue('--clock-freeze'), '145px');
  assert.equal(container.querySelector('[role="progressbar"]'), null);
  await tick(start - 1000);
  assert.equal(
    container.querySelector('[role="timer"]').getAttribute('aria-label'),
    '대회 시작까지 1초',
  );
  assert.equal(container.querySelector('a'), null);
  await tick(start);
  assert.match(container.textContent, /대회가 시작되었습니다/);
  await tick(start + 1999);
  assert.match(container.textContent, /대회가 시작되었습니다/);
  await tick(start + 2000);
  assert.equal(
    container.querySelector('.contest-clock-timer').getAttribute('aria-label'),
    '대회 종료까지',
  );
  assert.equal(
    container
      .querySelector('[role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '0',
  );
  assert.equal(container.querySelectorAll('.contest-clock-moment').length, 3);
  assert.equal(
    container.querySelector('[data-kind=end]').dataset.compact,
    'true',
  );
  await tick(freeze);
  assert.match(container.textContent, /프리즈 적용 중/);
  assert.equal(
    container
      .querySelector('[role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '75',
  );
  assert.equal(
    container.querySelector('[data-kind=start]').dataset.compact,
    'true',
  );
  assert.equal(
    container.querySelector('[data-kind=end]').dataset.compact,
    'false',
  );
  await tick(end - 10_000);
  assert.equal(
    container.querySelector('[role="timer"]').getAttribute('aria-label'),
    '대회 종료까지 10초',
  );
  assert.equal(container.querySelector('.contest-clock-timeline'), null);
  await tick(end);
  assert.match(container.textContent, /대회가 종료되었습니다/);
  assert.equal(container.querySelector('[role="timer"]'), null);
  await render({ canManageSettings: true, stale: true });
  assert.equal(
    container.querySelector('a').getAttribute('href'),
    '/operator/contests/c/settings',
  );
  assert.match(container.textContent, /마지막으로 확인한 일정/);
  await act(async () => root.unmount());
  root = null;
  assert.equal(ticks.size, 0);
});

test('participant clock shares the timeline and omits operator controls and disabled freeze', async () => {
  const ParticipantStatus = source(
    'components/contest/ContestProgressStatus.tsx',
  ).default;
  let now = start + (end - start) / 2;
  Date.now = () => now;
  let tick;
  window.setInterval = (callback) => {
    tick = callback;
    return 1;
  };
  window.clearInterval = () => {};
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const render = async (overrides = {}) => {
    await act(async () =>
      root.render(
        React.createElement(ParticipantStatus, {
          contest: { ...contest, ...overrides },
          canManageSettings: true,
        }),
      ),
    );
    await act(
      async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
    );
  };
  await render();
  assert.equal(
    container
      .querySelector('[role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '50',
  );
  assert.match(container.textContent, /대회 종료까지/);
  assert.equal(container.querySelector('a'), null);
  assert.doesNotMatch(container.textContent, /운영자만|후속 운영|15초/);
  assert.equal(container.querySelectorAll('time').length, 3);
  now = freeze;
  await act(async () => tick());
  assert.match(container.textContent, /프리즈 적용 중/);
  await render({ scoreboard_freeze_mode: 'live' });
  assert.doesNotMatch(container.textContent, /프리즈 적용 중/);
  assert.equal(container.querySelector('[data-kind=freeze]'), null);
  assert.equal(container.querySelectorAll('time').length, 2);
  await render({ freeze_at: 'invalid' });
  assert.equal(container.querySelector('[data-kind=freeze]'), null);
  await render();
  now = end;
  await act(async () => tick());
  assert.equal(container.querySelector('[role="timer"]'), null);
  assert.match(container.textContent, /제출이 마감되었습니다/);
});

const { contestTimerState: timerState } = source(
  'domains/contestAdministration/contestTimer.ts',
);
test('pre-start milestones have equal spacing regardless of the freeze time', () => {
  for (const freeze_at of [
    new Date(start + 1000).toISOString(),
    contest.freeze_at,
    new Date(end - 1000).toISOString(),
  ]) {
    const result = timerState({ ...contest, freeze_at }, start - 60_000);
    assert.equal(result.phase, 'before');
    assert.equal(
      result.anchors.freeze,
      (result.anchors.start + result.anchors.end) / 2,
    );
    assert.equal(result.current, result.anchors.start);
  }
});
test('shared timer has exact 10-second, 2-second and presentation 60-second boundaries', () => {
  for (const presentation of [false, true]) {
    assert.equal(
      timerState(contest, start - 10001, presentation).view,
      'waiting',
    );
    assert.equal(
      timerState(contest, start - 10000, presentation).view,
      'startCountdown',
    );
    assert.equal(
      timerState(contest, start - 1, presentation).view,
      'startCountdown',
    );
    assert.equal(timerState(contest, start, presentation).view, 'started');
    assert.equal(
      timerState(contest, start + 1999, presentation).view,
      'started',
    );
    assert.equal(
      timerState(contest, start + 2000, presentation).view,
      'running',
    );
    const threshold = presentation ? 60000 : 10000;
    assert.equal(
      timerState(contest, end - threshold - 1, presentation).view,
      'running',
    );
    assert.equal(
      timerState(contest, end - threshold, presentation).view,
      'endCountdown',
    );
    assert.equal(
      timerState(contest, end - 1, presentation).view,
      'endCountdown',
    );
    assert.equal(timerState(contest, end, presentation).view, 'ended');
  }
  assert.equal(
    timerState(contest, end + 1999, true).showPresentationCountdown,
    true,
  );
  assert.equal(
    timerState(contest, end + 2000, true).showPresentationCountdown,
    false,
  );
  assert.equal(
    timerState(contest, start - 86400000, true).showPresentationCountdown,
    true,
  );
});
test('timeline interpolates the current interval, compresses other milestones and tolerates absent freeze', () => {
  const pre = timerState(contest, start + (freeze - start) / 2);
  assert.equal(pre.current, (pre.anchors.start + pre.anchors.freeze) / 2);
  assert.equal(pre.afterFreeze, false);
  const at = timerState(contest, freeze);
  assert.equal(at.current, at.anchors.freeze);
  assert.equal(at.freezeActive, true);
  const post = timerState(contest, freeze + (end - freeze) / 2);
  assert.equal(post.current, (post.anchors.freeze + post.anchors.end) / 2);
  assert.equal(post.afterFreeze, true);
  for (const freeze_at of ['invalid', contest.start_at, contest.end_at]) {
    const result = timerState(
      { ...contest, freeze_at },
      start + (end - start) / 2,
    );
    assert.equal(result.hasFreeze, false);
    assert.equal(
      result.current,
      (result.anchors.start + result.anchors.end) / 2,
    );
  }
  assert.equal(
    timerState({ ...contest, scoreboard_freeze_mode: 'live' }, freeze)
      .hasFreeze,
    false,
  );
  const manual = timerState(
    { ...contest, scoreboard_freeze_mode: 'frozen' },
    start + 3000,
  );
  assert.equal(manual.freezeActive, true);
  assert.equal(manual.freezeRemaining, null);
});
test('draft, invalid, forced-ended and uninitialized clocks never run misleading countdowns', () => {
  for (const overrides of [
    { status: 'draft' },
    { status: 'schedule_tbd' },
    { start_at: 'invalid' },
    { end_at: contest.start_at },
    { status: 'ended' },
    { status: 'finalized' },
    { status: 'archived' },
  ]) {
    const result = timerState({ ...contest, ...overrides }, start - 5000, true);
    assert.equal(result.showPresentationCountdown, false);
    assert.equal(result.remaining, null);
  }
  assert.equal(timerState(contest, 0).view, 'unavailable');
  assert.equal(timerState(contest, NaN).view, 'unavailable');
});
