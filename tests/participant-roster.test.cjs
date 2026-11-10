const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', { url: 'https://judge.test' });
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
        .map((extension) => base + extension)
        .find((file) => fs.existsSync(file));
      assert.ok(target, `Cannot resolve ${id} from ${relative}`);
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
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}

const Member = source('components/operator/ParticipantMemberCard.tsx').default;
const Roster = source('components/operator/ParticipantTeamRoster.tsx').default;
let root;
let host;
async function render(element) {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root.render(element));
}
async function click(element) {
  assert.ok(element, 'Expected an actionable element');
  await act(async () => element.click());
}
function button(pattern) {
  return [...host.querySelectorAll('button')].find((item) =>
    pattern.test(item.textContent.trim()),
  );
}
function session(os = 'Windows', issued_at = '2026-11-10T00:00:00Z') {
  return {
    scope: 'participant',
    issued_at,
    last_seen_at: '2026-11-10T01:00:00Z',
    expires_at: '2026-11-11T00:00:00Z',
    environment: {
      browser: 'Chrome',
      os,
      device: os === 'iOS' || os === 'Android' ? 'mobile' : 'desktop',
      label: `Chrome · ${os}`,
    },
  };
}
function member(overrides = {}) {
  return {
    team_member_id: 'member-leader',
    name: '활성 팀장',
    email: 'leader@example.test',
    role: 'leader',
    active_sessions: 1,
    last_session_seen_at: '2026-11-10T01:00:00Z',
    sessions: [session()],
    ...overrides,
  };
}
function team() {
  return {
    participant_team_id: 'team-one',
    contest_id: 'contest-one',
    division_id: 'division-one',
    team_name: 'Good Bye BOJ!',
    status: 'active',
    created_at: '2026-11-01T00:00:00Z',
    members: [
      member({
        team_member_id: 'first-member',
        name: '첫 번째 팀원',
        email: 'first@example.test',
        role: 'member',
        active_sessions: 0,
        sessions: [],
      }),
      member(),
      member({
        team_member_id: 'second-member',
        name: '두 번째 팀원',
        email: 'second@example.test',
        role: 'member',
        active_sessions: 0,
        sessions: [],
      }),
    ],
  };
}
function rosterProps(overrides = {}) {
  return {
    team: team(),
    divisionName: 'COSS',
    pending: false,
    canManage: true,
    onEdit: () => {},
    onDelete: () => {},
    onRevoke: () => {},
    ...overrides,
  };
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = host = undefined;
});
after(() => dom.window.close());

test('the team roster keeps identity and all members together, sorting the leader first without mutating input', async () => {
  const data = team();
  const originalIds = data.members.map((item) => item.team_member_id);
  Object.freeze(data.members);
  let edited = 0;
  let deleted = 0;
  await render(
    h(
      Roster,
      rosterProps({
        team: data,
        onEdit: () => edited++,
        onDelete: () => deleted++,
      }),
    ),
  );
  assert.ok(host.textContent.includes('Good Bye BOJ!'));
  assert.ok(host.textContent.includes('COSS'));
  assert.match(host.textContent, /3명/);
  assert.match(host.textContent, /등록/);
  const list = host.querySelector('ul');
  assert.ok(list, 'The roster is a semantic member list');
  assert.equal(list.children.length, 3);
  for (const child of list.children) assert.equal(child.tagName, 'LI');
  const labels = [...list.children].map((item) => item.textContent);
  assert.ok(labels[0].includes('활성 팀장'));
  assert.ok(labels[1].includes('첫 번째 팀원'));
  assert.ok(labels[2].includes('두 번째 팀원'));
  assert.deepEqual(
    data.members.map((item) => item.team_member_id),
    originalIds,
  );
  await click(button(/편집/));
  await click(button(/^삭제$/));
  assert.equal(edited, 1);
  assert.equal(deleted, 1);
});

test('active session details start closed, toggle natively, and retain account logout', async () => {
  const activeMember = member();
  let revoked;
  await render(
    h(Roster, rosterProps({ onRevoke: (value) => (revoked = value) })),
  );
  const details = host.querySelector('details');
  assert.ok(details);
  assert.equal(details.open, false);
  const summary = details.querySelector('summary');
  assert.equal(summary.title, '활성 팀장 세션 상세');
  assert.ok(summary.textContent.includes('활성 세션'));
  assert.doesNotMatch(summary.textContent, /세션\s*1\s*개/);
  assert.ok(summary.querySelector('svg[role="img"][aria-label="Windows PC"]'));
  await click(summary);
  assert.equal(details.open, true);
  assert.ok(details.textContent.includes('Chrome · Windows'));
  assert.match(details.textContent, /로그인/);
  await click(button(/계정 로그아웃/));
  assert.deepEqual(revoked, activeMember);
  await click(summary);
  assert.equal(details.open, false);
});

test('the session badge uses stored platform icons, including tablets and legacy unknown metadata', async () => {
  const platforms = [
    ['iOS', 'iOS'],
    ['iPadOS', 'iOS'],
    ['Android', 'Android'],
    ['Windows', 'Windows PC'],
    ['macOS', 'macOS'],
    ['Linux', 'Linux'],
    ['ChromeOS', 'PC'],
    ['Unknown', '기기 정보 없음'],
  ];
  for (const [os, label] of platforms) {
    await render(
      h(Member, {
        member: member({ sessions: [session(os)] }),
        pending: false,
        onRevoke: () => {},
      }),
    );
    const summary = host.querySelector('summary');
    assert.ok(summary, `Active ${os} session remains expandable`);
    assert.ok(
      summary.querySelector(`svg[role="img"][aria-label="${label}"]`),
      `${os} maps to ${label}`,
    );
    assert.equal(host.querySelector('details').open, false);
  }
  await render(
    h(Member, {
      member: member({ sessions: undefined }),
      pending: false,
      onRevoke: () => {},
    }),
  );
  assert.ok(
    host.querySelector('summary svg[role="img"][aria-label="기기 정보 없음"]'),
  );
  await click(host.querySelector('summary'));
  assert.ok(
    host.querySelector('details').textContent.includes('환경 정보 없음'),
  );
});

test('inactive members never expose stale session details, device icons, or logout controls', async () => {
  await render(
    h(Member, {
      member: member({ active_sessions: 0, sessions: [session('iOS')] }),
      pending: false,
      onRevoke: () => assert.fail('Inactive account cannot be revoked'),
    }),
  );
  assert.equal(host.querySelector('details'), null);
  assert.equal(host.querySelector('svg[role="img"]'), null);
  assert.equal(button(/계정 로그아웃/), undefined);
  assert.ok(host.textContent.includes('세션 없음'));
  assert.equal(host.textContent.includes('Chrome · iOS'), false);
});

test('an open session closes after replacement and disappears after revocation', async () => {
  const props = { pending: false, onRevoke: () => {} };
  await render(h(Member, { ...props, member: member() }));
  await click(host.querySelector('summary'));
  assert.equal(host.querySelector('details').open, true);
  await render(
    h(Member, {
      ...props,
      member: member({ sessions: [session('iOS', '2026-11-10T02:00:00Z')] }),
    }),
  );
  assert.equal(host.querySelector('details').open, false);
  await click(host.querySelector('summary'));
  assert.equal(host.querySelector('details').open, true);
  await render(
    h(Member, {
      ...props,
      member: member({ active_sessions: 0, sessions: [session('iOS')] }),
    }),
  );
  assert.equal(host.querySelector('details'), null);
  assert.equal(button(/계정 로그아웃/), undefined);
});

test('read-only operators can inspect session details but have no editing, deletion, or logout action', async () => {
  const denied = () => assert.fail('A read-only roster must not mutate data');
  await render(
    h(
      Roster,
      rosterProps({
        canManage: false,
        onEdit: denied,
        onDelete: denied,
        onRevoke: denied,
      }),
    ),
  );
  assert.equal(button(/편집/), undefined);
  assert.equal(button(/^삭제$/), undefined);
  await click(host.querySelector('summary'));
  assert.equal(host.querySelector('details').open, true);
  assert.ok(host.textContent.includes('Chrome · Windows'));
  assert.equal(button(/계정 로그아웃/), undefined);
});

test('pending session revocation disables repeated logout requests', async () => {
  await render(
    h(Member, {
      member: member(),
      pending: true,
      onRevoke: () => assert.fail('Pending revocation cannot be repeated'),
    }),
  );
  await click(host.querySelector('summary'));
  const revoke = button(/로그아웃/);
  assert.ok(revoke);
  assert.equal(revoke.disabled, true);
  await click(revoke);
});
