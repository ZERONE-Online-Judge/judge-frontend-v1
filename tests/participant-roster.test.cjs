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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
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
const AccessDialog = source(
  'components/operator/ParticipantAccessDialog.tsx',
).default;
const WithdrawalDialog = source(
  'components/operator/ParticipantWithdrawalDialog.tsx',
).default;
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

test('team and individual access controls remain independent and keep the leader first', async () => {
  const data = team();
  data.access_blocked = true;
  data.access_block_reason = '팀 확인 중';
  data.members[0].access_blocked = true;
  data.members[0].access_block_reason = '개인 확인 중';
  let selected;
  let teamSelected = 0;
  await render(
    h(
      Roster,
      rosterProps({
        team: data,
        onTeamAccess: () => teamSelected++,
        onMemberAccess: (value) => (selected = value),
      }),
    ),
  );
  assert.match(host.textContent, /팀 전체 차단/);
  assert.match(host.textContent, /팀 확인 중/);
  const members = [...host.querySelectorAll('li')];
  assert.match(members[0].textContent, /활성 팀장.*팀 차단 적용/);
  assert.match(members[1].textContent, /첫 번째 팀원.*개인·팀 차단/);
  await click(button(/^팀 차단 해제$/));
  assert.equal(teamSelected, 1);
  await click(host.querySelector('[aria-label="첫 번째 팀원 개인 차단 해제"]'));
  assert.equal(selected.team_member_id, 'first-member');
  assert.equal(host.querySelector('details').open, false);
});

test('read-only and pending rosters cannot change individual or team access', async () => {
  const deny = () => assert.fail('Access mutation must not be available');
  const props = rosterProps({ onTeamAccess: deny, onMemberAccess: deny });
  await render(h(Roster, { ...props, canManage: false }));
  assert.equal(host.querySelectorAll('button').length, 0);
  await render(h(Roster, { ...props, pending: true }));
  for (const access of host.querySelectorAll(
    '.participant-member-access-actions button',
  )) {
    assert.equal(access.disabled, true);
    await click(access);
  }
  assert.equal(button(/^팀 전체 차단$/).disabled, true);
  await click(button(/^팀 전체 차단$/));
});

test('access confirmation identifies the whole team, explains effects and submits a trimmed optional reason', async () => {
  let submitted;
  await render(
    h(AccessDialog, {
      target: { team: team() },
      pending: false,
      onClose: () => {},
      onConfirm: (value) => (submitted = value),
    }),
  );
  const dialog = document.querySelector('dialog');
  assert.ok(dialog.open);
  assert.match(dialog.textContent, /팀 전체 접근 차단/);
  assert.match(dialog.textContent, /첫 번째 팀원.*활성 팀장.*두 번째 팀원/);
  assert.match(dialog.textContent, /기존 제출·순위는 유지/);
  assert.match(dialog.textContent, /다른 대회에는 영향을 주지 않습니다/);
  const reason = dialog.querySelector('textarea');
  assert.equal(reason.maxLength, 1000);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    ).set;
    setter.call(reason, '  운영진 확인 중  ');
    reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    dialog
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(submitted, '운영진 확인 중');
});

test('unblocking one scope warns about the other scope and preserves pending/error behavior', async () => {
  const data = team();
  data.access_blocked = true;
  data.members[0].access_blocked = true;
  await render(
    h(AccessDialog, {
      target: { team: data },
      pending: false,
      onClose: () => {},
      onConfirm: () => {},
    }),
  );
  assert.match(
    document.querySelector('dialog').textContent,
    /개인 차단된 1명은 계속 차단/,
  );
  await render(
    h(AccessDialog, {
      target: { team: data, member: data.members[0] },
      pending: true,
      error: new Error('다시 시도'),
      onClose: () => assert.fail('Pending dialog must remain open'),
      onConfirm: () => assert.fail('Pending access request cannot repeat'),
    }),
  );
  const dialog = document.querySelector('dialog');
  assert.match(
    dialog.textContent,
    /개인 차단을 해제해도 팀 차단을 해제하기 전까지 접근할 수 없습니다/,
  );
  assert.ok(dialog.querySelector('[role="alert"]'));
  assert.equal(dialog.querySelector('textarea'), null);
  await act(async () =>
    dialog
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  for (const item of dialog.querySelectorAll('footer button'))
    assert.equal(item.disabled, true);
});

test('withdrawal stays a team action and shows automatic access blocking separately from manual blocks', async () => {
  const data = team();
  data.withdrawn = true;
  data.withdrawal_reason = '현장 참가 포기';
  data.access_blocked = true;
  data.members[0].access_blocked = true;
  let restored = 0;
  await render(
    h(
      Roster,
      rosterProps({
        team: data,
        onWithdrawal: () => restored++,
        onTeamAccess: () => {},
        onMemberAccess: () => {},
      }),
    ),
  );
  assert.equal(
    host.querySelector('.participant-team-status').textContent,
    '기권',
  );
  assert.match(host.textContent, /스코어보드 제외 · 대회 접근 차단/);
  assert.match(host.textContent, /기권 사유: 현장 참가 포기/);
  assert.equal(
    host.querySelectorAll('.participant-access-badge.is-withdrawn').length,
    3,
  );
  assert.match(
    host.querySelector('li:first-child').textContent,
    /활성 팀장.*기권팀/,
  );
  assert.match(host.textContent, /팀 전체 차단/);
  assert.ok(button(/^팀 차단 해제$/));
  assert.equal(button(/^팀 기권$/), undefined);
  assert.equal(button(/개인 기권/), undefined);
  assert.equal(host.querySelector('details').open, false);
  await click(button(/^기권 취소$/));
  assert.equal(restored, 1);
});

test('withdrawal controls are unavailable to read-only operators and disabled while pending', async () => {
  const deny = () =>
    assert.fail('Withdrawal cannot run without permission or while pending');
  const props = rosterProps({ onWithdrawal: deny });
  await render(h(Roster, { ...props, canManage: false }));
  assert.equal(button(/기권/), undefined);
  await render(h(Roster, { ...props, pending: true }));
  assert.equal(button(/^팀 기권$/).disabled, true);
  await click(button(/^팀 기권$/));
});

test('withdrawal confirmation explains scoreboard exclusion, access blocking, preserved records and release reset', async () => {
  let submitted;
  await render(
    h(WithdrawalDialog, {
      team: team(),
      pending: false,
      onClose: () => {},
      onConfirm: (value) => {
        submitted = value;
      },
    }),
  );
  const dialog = document.querySelector('dialog');
  assert.ok(dialog.open);
  assert.match(dialog.textContent, /팀 기권 처리/);
  assert.match(dialog.textContent, /모든 팀원의 대회 접근이 차단/);
  assert.match(dialog.textContent, /스코어보드에서 제외/);
  assert.match(dialog.textContent, /기존 제출과 채점 기록은 보존/);
  assert.match(dialog.textContent, /공개 진행이 초기화/);
  assert.match(
    dialog.textContent,
    /모든 순위를 공개한 경우에는 공개 상태를 유지/,
  );
  const reason = dialog.querySelector('textarea');
  assert.equal(reason.maxLength, 1000);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(reason, '  참가 취소  ');
    reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    dialog
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(submitted, '참가 취소');
});

test('withdrawal cancellation restores existing results while explicitly preserving manual team and individual blocks', async () => {
  const data = team();
  data.withdrawn = true;
  data.withdrawal_reason = '이전 사유';
  data.access_blocked = true;
  data.members[0].access_blocked = true;
  await render(
    h(WithdrawalDialog, {
      team: data,
      pending: false,
      onClose: () => {},
      onConfirm: () => {},
    }),
  );
  const dialog = document.querySelector('dialog');
  assert.match(dialog.textContent, /팀 기권 취소/);
  assert.match(dialog.textContent, /팀의 기존 기록이 다시 반영/);
  assert.match(dialog.textContent, /기권으로 적용된 대회 접근 차단이 해제/);
  assert.match(dialog.textContent, /팀 전체 차단과 개인 차단 1명은 유지/);
  assert.match(dialog.textContent, /이전 사유/);
  assert.equal(dialog.querySelector('textarea'), null);
});

test('withdrawal pending and failure states preserve entered data and prevent duplicate actions', async () => {
  const deny = () =>
    assert.fail('Pending withdrawal must stay open and must not repeat');
  await render(
    h(WithdrawalDialog, {
      team: team(),
      pending: true,
      error: new Error('다시 시도해 주세요'),
      onClose: deny,
      onConfirm: deny,
    }),
  );
  const dialog = document.querySelector('dialog');
  assert.ok(dialog.querySelector('[role="alert"]'));
  assert.equal(dialog.querySelector('textarea').disabled, true);
  await act(async () =>
    dialog
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  for (const item of dialog.querySelectorAll('footer button')) {
    assert.equal(item.disabled, true);
    await click(item);
  }
});

test('manual unblocking clearly warns when withdrawal still blocks contest access', async () => {
  const data = team();
  data.withdrawn = true;
  data.access_blocked = true;
  await render(
    h(AccessDialog, {
      target: { team: data },
      pending: false,
      onClose: () => {},
      onConfirm: () => {},
    }),
  );
  assert.match(
    document.querySelector('dialog').textContent,
    /차단을 해제해도 기권을 취소하기 전까지 대회에 접근할 수 없습니다/,
  );
});
