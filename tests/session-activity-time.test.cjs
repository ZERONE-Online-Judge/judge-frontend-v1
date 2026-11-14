const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
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
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find((file) => fs.existsSync(file));
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
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
const Activity = source('shared/ui/SessionActivityTime.tsx').default;
const { SessionDescriptionList } = source('shared/ui/SessionEnvironment.tsx');
const Member = source('components/operator/ParticipantMemberCard.tsx').default;
const Transfer = source('components/auth/SessionTransferDialog.tsx').default;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const NOW = Date.parse('2026-11-14T05:00:00Z');
const iso = (milliseconds) => new Date(NOW + milliseconds).toISOString();
const minute = 60_000;
let now, root, host, intervals, counter, hidden;
const originalNow = Date.now;
const originalInterval = window.setInterval;
const originalClear = window.clearInterval;
beforeEach(() => {
  now = NOW;
  Date.now = () => now;
  intervals = new Map();
  counter = 0;
  hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  window.setInterval = (callback, delay) => {
    intervals.set(++counter, { callback, delay });
    return counter;
  };
  window.clearInterval = (id) => intervals.delete(id);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  assert.equal(intervals.size, 0, 'The last timestamp releases its clock');
  host.remove();
  Date.now = originalNow;
  window.setInterval = originalInterval;
  window.clearInterval = originalClear;
  delete document.hidden;
});
after(() => dom.window.close());
async function render(element) {
  await act(async () => root.render(element));
}
async function tick(milliseconds) {
  await act(async () => {
    now += milliseconds;
    [...intervals.values()].forEach(({ callback }) => callback());
  });
}

test('activity keeps the KST absolute date beside minute, hour and day age', async () => {
  await render(
    h(
      'div',
      null,
      h(Activity, { value: iso(-11 * minute), compact: true }),
      h(Activity, { value: iso(-61 * minute) }),
      h(Activity, { value: iso(-2 * 24 * 60 * minute) }),
    ),
  );
  const times = host.querySelectorAll('time');
  assert.equal(times[0].textContent, '오늘 13:49');
  assert.equal(times[0].dateTime, iso(-11 * minute));
  assert.match(times[0].title, /KST/);
  assert.match(host.textContent, /\(11분 전\)/);
  assert.match(host.textContent, /\(1시간 전\)/);
  assert.match(host.textContent, /\(2일 전\)/);
});

test('recent and future activity never shows a negative age; invalid data stays unknown', async () => {
  await render(
    h(
      'div',
      null,
      h(Activity, { value: iso(-20_000) }),
      h(Activity, { value: iso(5 * minute) }),
      h(Activity, { value: 'invalid', emptyText: '활동 시간 정보 없음' }),
      h(Activity, { value: Infinity }),
      h(Activity, { value: null }),
    ),
  );
  assert.equal(host.querySelectorAll('time').length, 2);
  assert.equal(host.textContent.match(/방금 전/g).length, 2);
  assert.match(host.textContent, /활동 시간 정보 없음/);
  assert.equal(host.textContent.match(/시각 정보 없음/g).length, 2);
  assert.doesNotMatch(host.textContent, /NaN|Invalid|\(-\d/);
});

test('many timestamps share one 30-second clock and advance without remounting disclosures', async () => {
  await render(
    h(
      'details',
      null,
      h('summary', null, '세션 상세'),
      ...Array.from({ length: 40 }, (_, key) =>
        h(Activity, {
          key,
          value: iso(-59_000),
        }),
      ),
    ),
  );
  assert.equal(intervals.size, 1);
  assert.equal([...intervals.values()][0].delay, 30_000);
  const details = host.querySelector('details');
  details.open = true;
  const original = host.querySelector('time');
  assert.match(host.textContent, /방금 전/);
  await tick(30_000);
  assert.equal(host.textContent.match(/1분 전/g).length, 40);
  assert.equal(host.querySelector('time'), original);
  assert.equal(details.open, true);
  assert.equal(intervals.size, 1);
  await tick(60 * minute);
  assert.equal(host.textContent.match(/1시간 전/g).length, 40);
});

test('the shared clock pauses in background and updates immediately on return', async () => {
  await render(h(Activity, { value: iso(-minute) }));
  assert.match(host.textContent, /1분 전/);
  await act(async () => {
    hidden = true;
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  assert.equal(intervals.size, 0);
  now += 2 * 60 * minute;
  await act(async () => {
    hidden = false;
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  assert.equal(intervals.size, 1);
  assert.match(host.textContent, /2시간 전/);
});

test('shared session descriptions and operator team members both show activity age', async () => {
  const session = {
    scope: 'participant',
    issued_at: iso(-60 * minute),
    last_seen_at: iso(-11 * minute),
    expires_at: iso(60 * minute),
    environment: {
      browser: 'Chrome',
      os: 'Windows',
      device: 'desktop',
      label: 'Chrome · Windows',
    },
  };
  await render(
    h(
      'div',
      null,
      h(SessionDescriptionList, { sessions: [session] }),
      h(
        'ul',
        null,
        h(Member, {
          member: {
            team_member_id: 'member',
            name: '팀장',
            email: 'qa@example.invalid',
            role: 'leader',
            active_sessions: 1,
            last_session_seen_at: session.last_seen_at,
            sessions: [session],
          },
          pending: false,
        }),
      ),
    ),
  );
  assert.equal(host.textContent.match(/11분 전/g).length, 2);
  const details = host.querySelector('details');
  assert.equal(details.open, false);
  details.open = true;
  assert.ok(host.textContent.includes('Chrome · Windows'));
  assert.equal(host.querySelectorAll('button').length, 0);
  assert.equal(intervals.size, 1);
});

test('login transfer pairs each device with its own absolute and relative activity', async () => {
  const session = (last_seen_at, label) => ({
    scope: 'general',
    issued_at: iso(-120 * minute),
    last_seen_at,
    expires_at: iso(60 * minute),
    environment: { browser: 'Chrome', os: 'Windows', device: 'desktop', label },
  });
  await render(
    h(Transfer, {
      sessions: [
        session(iso(-61 * minute), '이전 PC'),
        session(iso(-11 * minute), '최근 PC'),
      ],
      activeSessionCount: 2,
      lastSeenAt: iso(-minute),
      pending: false,
      onCancel: () => {},
      onConfirm: () => {},
    }),
  );
  const activity = document.querySelector('.session-transfer-activity');
  assert.match(
    document.querySelector('.session-transfer-device').textContent,
    /최근 PC/,
  );
  assert.match(activity.textContent, /오늘 13:49/);
  assert.match(activity.textContent, /11분 전/);
  assert.doesNotMatch(activity.textContent, /\(1분 전\)/);
  const other = document.querySelector('.session-transfer-others');
  assert.equal(other.open, false);
  assert.match(other.textContent, /이전 PC/);
  assert.match(other.textContent, /1시간 전/);
  assert.equal(intervals.size, 1);
});
