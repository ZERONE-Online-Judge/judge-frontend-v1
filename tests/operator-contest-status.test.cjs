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
  assert.equal(status(contest, end).phase, 'ended');
  assert.equal(status(contest, end).submissionLabel, '제출 마감');
  assert.equal(status(contest, end).remaining, null);
  assert.equal(status(contest, end).progress, 100);
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
test('mounted status counts down, changes phase without reload, preserves settings permissions and clears its clock', async () => {
  let now = start - 1000;
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
  const render = async (props) => {
    await act(async () =>
      root.render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(StatusPanel, {
            contest,
            canManageSettings: false,
            ...props,
          }),
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
  assert.match(container.querySelector('[role="timer"]').textContent, /01초/);
  assert.equal(container.querySelector('a'), null);
  await tick(start);
  assert.match(container.textContent, /대회 진행 중/);
  assert.match(container.textContent, /제출 가능/);
  assert.equal(container.querySelector('progress').value, 0);
  await tick(freeze);
  assert.match(container.textContent, /프리즈 적용 중/);
  assert.equal(container.querySelector('progress').value, 75);
  await tick(end);
  assert.match(container.textContent, /마감되었습니다/);
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

test('participant progress follows the same phase, freeze and countdown boundaries without operator controls', async () => {
  const ParticipantStatus = source(
    'components/contest/ContestProgressStatus.tsx',
  ).default;
  let now = start - 1000;
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
  const tick = async (time) => {
    now = time;
    await act(async () => ticks.forEach((callback) => callback()));
  };
  await render();
  assert.equal(container.querySelector('progress').value, 0);
  assert.match(container.textContent, /대회 시작까지/);
  assert.equal(container.querySelector('a'), null);
  assert.doesNotMatch(
    container.textContent,
    /운영자만|대회 목록|후속 운영|15초/,
  );
  await tick(start + (end - start) / 2);
  assert.equal(container.querySelector('progress').value, 50);
  assert.match(container.textContent, /대회 종료까지/);
  assert.match(container.textContent, /제출 가능/);
  assert.equal(container.querySelectorAll('time').length, 3);
  await tick(freeze);
  assert.equal(container.querySelector('progress').value, 75);
  assert.match(container.textContent, /프리즈 적용 중/);
  await render({ scoreboard_freeze_mode: 'live' });
  assert.doesNotMatch(container.textContent, /프리즈 적용 중/);
  assert.match(container.textContent, /프리즈 해제/);
  await tick(end);
  assert.equal(container.querySelector('progress').value, 100);
  assert.equal(container.querySelector('[role="timer"]'), null);
  assert.match(container.textContent, /제출이 마감되었습니다/);
});
