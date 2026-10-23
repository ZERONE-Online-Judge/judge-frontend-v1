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
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;

// These fixtures are the expanded scopes returned by the server role contract.
const roleScopes = {
  settings_manager: [
    'contest.settings.manage',
    'contest.update_organization',
    'contest.update_overview',
    'contest.update_rule',
    'contest.update_schedule',
  ],
  participants_manager: [
    'contest.participant.view',
    'contest.participant.manage',
    'contest.participant.create',
    'contest.participant.update',
    'contest.participant.remove',
    'contest.participant.bulk_create',
    'contest.access_log.view',
  ],
  posts_manager: [
    'contest.board.question.view',
    'contest.board.question.manage',
    'contest.board.answer.create',
  ],
  notices_manager: [
    'contest.notice.view',
    'contest.notice.manage',
    'contest.notice.create',
    'contest.notice.update',
    'contest.notice.delete',
    'contest.notice.emergency_publish',
  ],
  staff_manager: ['contest.staff.view', 'contest.staff.manage'],
  problems_viewer: ['contest.problem.view'],
  submissions_viewer: [
    'contest.submission.view',
    'contest.submission.source.view',
  ],
  scoreboard_viewer: ['contest.scoreboard.view'],
  scoreboard_manager: [
    'contest.scoreboard.view',
    'contest.scoreboard.manage',
    'contest.scoreboard.freeze',
    'contest.scoreboard.unfreeze',
    'contest.scoreboard.setting',
  ],
  audit_viewer: ['contest.audit.view', 'contest.access_log.view'],
  problem_author: [
    'contest.problem.view',
    'contest.problem.manage',
    'contest.problem.review',
    'contest.problem.test',
    'contest.problem.create',
    'contest.problem.update',
    'contest.problem.delete',
    'contest.problem.reorder',
    'contest.problem.resource.view',
    'contest.problem.resource.manage',
    'contest.testcase.view',
    'contest.testcase.manage',
    'contest.generator.view',
    'contest.generator.manage',
  ],
  problem_reviewer: [
    'contest.problem.view',
    'contest.problem.review',
    'contest.problem.test',
  ],
  participant_preview: ['contest.view', 'contest.participant.preview'],
};
const roleTabs = {
  settings_manager: ['', 'settings'],
  participants_manager: ['', 'participants', 'audit-logs'],
  posts_manager: ['', 'board'],
  notices_manager: ['', 'notices'],
  staff_manager: ['', 'operators'],
  problems_viewer: ['problem-review'],
  submissions_viewer: ['', 'submissions'],
  scoreboard_viewer: ['', 'scoreboard'],
  scoreboard_manager: ['', 'scoreboard'],
  audit_viewer: ['', 'audit-logs'],
  problem_author: ['', 'problems', 'problem-review'],
  problem_reviewer: ['problem-review'],
  participant_preview: [''],
};
let session, reads, contestStatus;
function staffWith(scopes, contestId = 'contest') {
  return {
    email: 'staff@test',
    display_name: '운영진',
    is_service_master: false,
    contest_scopes: { [contestId]: scopes },
  };
}
function generalWith(scopes) {
  return {
    account: { email: 'staff@test', display_name: '운영진' },
    accessToken: 'general-token',
    operatorContests: [],
    operatorSession: { accessToken: 'staff-token', staff: staffWith(scopes) },
  };
}
function forRoles(...roles) {
  return generalWith([
    ...['contest.view'],
    ...new Set(roles.flatMap((role) => roleScopes[role])),
  ]);
}
const mocks = {
  '@/utils/Icons': { SvgIcon: () => null },
  '@/domains/identityAccess/sessionStore': {
    useSessionStore: (selector) => selector({ generalSession: session }),
  },
  '@/domains/contestAdministration/api': {
    createContestShareLink: async () => ({ code: 'shortCode01' }),
    getOperatorContestDashboard: async () => {
      reads.push('dashboard');
      return { participant_count: 0, contest: { status: contestStatus } };
    },
  },
  '@/domains/problemManagement/api': {
    getOperatorProblems: async () => {
      reads.push('problems');
      return [];
    },
  },
  '@/domains/serviceCommunication/api': {
    listOperatorContestNotices: async () => {
      reads.push('notices');
      return [];
    },
    listOperatorContestQuestions: async () => {
      reads.push('questions');
      return [];
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
const {
  hasContestPermission,
  hasContestAccess,
  isContestMaster,
  isServiceMaster,
  contestScopesFor,
} = source('domains/identityAccess/permissions.ts');
const {
  CONTEST_ROLES,
  contestRoleTitle,
  contestRoleTitleForScopes,
  contestRoleTitleForAccount,
  contestRolesForAccount,
  isAssignedContestMaster,
} = source('domains/identityAccess/contestRoles.ts');
const { OperatorAccessGate, OperatorTabs } = source(
  'components/operator/OperatorShell.tsx',
);
const {
  mapStaffSession,
  mapGeneralSession,
  saveGeneralSession,
  loadStoredGeneralSession,
} = source('domains/identityAccess/sessionStorage.ts');
let root, container, client;
beforeEach(() => {
  session = null;
  reads = [];
  contestStatus = 'draft';
  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
after(() => dom.window.close());
async function render(element = h(OperatorTabs, { contestId: 'contest' })) {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: ['/operator/contests/contest'] },
          element,
        ),
      ),
    ),
  );
  await act(
    async () => new Promise((resolve) => global.setTimeout(resolve, 10)),
  );
}
function tabs() {
  return [...container.querySelectorAll('nav[aria-label="운영자 메뉴"] a')].map(
    (link) =>
      link
        .getAttribute('href')
        .replace('/operator/contests/contest', '')
        .replace(/^\//, ''),
  );
}

test('operators share the participant URL without preview flags or credentials', async () => {
  session = forRoles('participants_manager');
  const copied = [];
  const original = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (value) => copied.push(value) } },
  });
  try {
    await render();
    await act(async () =>
      container.querySelector('[aria-label="대회 링크 공유"]').click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    const dialog = document.querySelector('dialog');
    assert.ok(dialog?.open);
    const input = dialog.querySelector('input');
    assert.equal(input.value, 'https://judge.test/share/shortCode01');
    assert.equal(input.readOnly, true);
    const open = dialog.querySelector('a');
    assert.equal(open.href, input.value);
    assert.equal(open.target, '_blank');
    assert.equal(open.rel, 'noopener noreferrer');
    const copy = [...dialog.querySelectorAll('button')].find(
      (node) => node.textContent === '링크 복사',
    );
    await act(async () => copy.click());
    assert.deepEqual(copied, [input.value]);
    assert.match(
      dialog.querySelector('[role="status"]').textContent,
      /복사했습니다/,
    );
    await act(async () => dialog.querySelector('[aria-label="닫기"]').click());
    assert.equal(document.querySelector('dialog'), null);
  } finally {
    if (original) Object.defineProperty(global, 'navigator', original);
    else delete global.navigator;
  }
});

test('a rejected clipboard permission keeps a selectable participant URL available', async () => {
  session = forRoles('problem_reviewer');
  const original = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    },
  });
  try {
    await render();
    await act(async () =>
      container.querySelector('[aria-label="대회 링크 공유"]').click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    const dialog = document.querySelector('dialog');
    await act(async () =>
      [...dialog.querySelectorAll('button')]
        .find((node) => node.textContent === '링크 복사')
        .click(),
    );
    assert.match(dialog.textContent, /직접 복사해 주세요/);
    const input = dialog.querySelector('input');
    await act(async () => input.focus());
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, input.value.length);
  } finally {
    if (original) Object.defineProperty(global, 'navigator', original);
    else delete global.navigator;
  }
});

test('a contest master is never promoted to service administrator and has no access to another contest', async () => {
  for (const masterScope of ['master', 'contest.*', '*']) {
    const general = {
      account: { email: 'master@test' },
      accessToken: 'token',
      operatorContests: [
        { contest: { contest_id: 'contest' }, scopes: [masterScope] },
      ],
    };
    assert.equal(isServiceMaster(general), false);
    assert.equal(isContestMaster(general, 'contest'), true);
    assert.equal(
      hasContestPermission(general, 'contest', 'contest.staff.manage'),
      true,
    );
    assert.equal(isContestMaster(general, 'other'), false);
    assert.equal(hasContestAccess(general, 'other'), false);
    assert.equal(
      hasContestPermission(general, 'other', 'contest.staff.manage'),
      false,
    );
    const staff = { accessToken: 'token', staff: staffWith([masterScope]) };
    assert.equal(isServiceMaster(staff), false);
    assert.equal(hasContestPermission(staff, 'other', 'contest.view'), false);
  }
  session = {
    account: { email: 'master@test' },
    accessToken: 'token',
    operatorContests: [
      { contest: { contest_id: 'contest' }, scopes: ['master'] },
    ],
  };
  await render(
    h(
      OperatorAccessGate,
      { contestId: 'contest', permission: 'contest.staff.manage' },
      (staffSession) =>
        h(
          'p',
          {
            'data-service-master': String(staffSession.staff.is_service_master),
          },
          '대회 마스터 접근',
        ),
    ),
  );
  assert.equal(
    container.querySelector('[data-service-master]').dataset.serviceMaster,
    'false',
  );
  await render(
    h(
      OperatorAccessGate,
      { contestId: 'other', permission: 'contest.staff.manage' },
      () => h('p', { 'data-protected': true }, '금지된 접근'),
    ),
  );
  assert.equal(container.querySelector('[data-protected]'), null);
});

test('service administrator access is derived only from the explicit service flag', () => {
  session = generalWith([]);
  session.operatorSession.staff.is_service_master = true;
  for (const representation of [session, session.operatorSession]) {
    assert.equal(isServiceMaster(representation), true);
    assert.equal(isContestMaster(representation, 'unassigned'), true);
    assert.equal(
      hasContestPermission(
        representation,
        'unassigned',
        'contest.staff.manage',
      ),
      true,
    );
  }
  for (const absent of [null, undefined]) {
    assert.equal(isServiceMaster(absent), false);
    assert.equal(hasContestAccess(absent, 'contest'), false);
    assert.equal(
      hasContestPermission(absent, 'contest', 'contest.view'),
      false,
    );
  }
});

for (const [role, expectedTabs] of Object.entries(roleTabs)) {
  test(`${role} exposes only its authorized tabs and badge requests`, async () => {
    session = forRoles(role);
    await render();
    assert.deepEqual(tabs(), [
      '',
      ...[
        'settings',
        'operators',
        'notices',
        'board',
        'participants',
        'problems',
        'problem-review',
        'submissions',
        'scoreboard',
        'audit-logs',
      ].filter(
        (tab) =>
          ['notices', 'board'].includes(tab) || expectedTabs.includes(tab),
      ),
      'guide',
    ]);
    const expectedReads = [
      'dashboard',
      'notices',
      'questions',
      ...(['problem_author', 'problem_reviewer', 'problems_viewer'].includes(
        role,
      )
        ? ['problems']
        : []),
    ];
    assert.deepEqual(reads.sort(), expectedReads.sort());
    for (const permission of [
      'contest.settings.manage',
      'contest.staff.manage',
      'contest.participant.manage',
      'contest.notice.manage',
      'contest.board.question.manage',
      'contest.submission.view',
      'contest.submission.source.view',
      'contest.scoreboard.view',
      'contest.scoreboard.manage',
      'contest.problem.manage',
      'contest.problem.view',
      'contest.problem.review',
      'contest.problem.test',
      'contest.problem.resource.manage',
      'contest.testcase.manage',
      'contest.audit.view',
      'contest.access_log.view',
    ]) {
      assert.equal(
        hasContestPermission(session, 'contest', permission),
        roleScopes[role].includes(permission),
        `${role}: ${permission}`,
      );
      assert.equal(hasContestPermission(session, 'other', permission), false);
    }
    assert.equal(isContestMaster(session, 'contest'), false);
    assert.equal(isServiceMaster(session), false);
    const title =
      role === 'problem_author'
        ? '출제진'
        : role === 'problem_reviewer'
          ? '검수진'
          : '운영진';
    assert.equal(
      container.querySelector('.operator-context__identity').textContent,
      `운영진${title}`,
    );
  });
}

test('multiple roles combine permissions and navigation without granting unrelated powers', async () => {
  session = forRoles(
    'participants_manager',
    'problem_reviewer',
    'scoreboard_viewer',
  );
  await render();
  assert.deepEqual(tabs(), [
    '',
    'notices',
    'board',
    'participants',
    'problem-review',
    'scoreboard',
    'audit-logs',
    'guide',
  ]);
  assert.deepEqual(reads.sort(), [
    'dashboard',
    'notices',
    'problems',
    'questions',
  ]);
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.problem.test'),
    true,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.scoreboard.manage'),
    false,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.problem.manage'),
    false,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.staff.manage'),
    false,
  );
  await render(h(OperatorTabs, { contestId: 'other' }));
  assert.equal(container.querySelectorAll('nav a').length, 0);
});

test('preview grants an operator entry and a new-tab link without granting other management powers', async () => {
  session = forRoles('participant_preview');
  assert.equal(hasContestPermission(session, 'contest', 'contest.view'), true);
  await render(h(OperatorTabs, { contestId: 'contest' }));
  const link = container.querySelector('a[target="_blank"]');
  assert.equal(link.getAttribute('href'), '/contests/contest?preview=1');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.match(link.textContent, /참가자 화면 미리보기/);
  assert.deepEqual(reads.sort(), ['dashboard', 'notices', 'questions']);
  for (const permission of ['contest.problem.review', 'contest.staff.manage']) {
    assert.equal(hasContestPermission(session, 'contest', permission), false);
    await render(
      h(OperatorAccessGate, { contestId: 'contest', permission }, () =>
        h('p', { 'data-protected': true }, '운영자 기능'),
      ),
    );
    assert.equal(container.querySelector('[data-protected]'), null);
  }
  assert.equal(contestRoleTitle(['participant_preview']), '운영진');
  assert.equal(
    contestRoleTitleForScopes(['contest.participant.preview']),
    '운영진',
  );
});

test('board and notice roles combine independent tabs without granting staff or audit powers', async () => {
  session = forRoles('posts_manager', 'notices_manager');
  await render();
  assert.deepEqual(tabs(), ['', 'notices', 'board', 'guide']);
  assert.deepEqual(reads.sort(), ['dashboard', 'notices', 'questions']);
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.staff.manage'),
    false,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.audit.view'),
    false,
  );
});

test('settings and staff roles expose separate tabs with operators immediately after settings', async () => {
  session = forRoles('settings_manager', 'staff_manager');
  await render();
  assert.deepEqual(tabs(), [
    '',
    'settings',
    'operators',
    'notices',
    'board',
    'guide',
  ]);
  assert.deepEqual(reads.sort(), ['dashboard', 'notices', 'questions']);
  const links = [
    ...container.querySelectorAll('nav[aria-label="운영자 메뉴"] a'),
  ];
  assert.equal(links[2].textContent.trim(), '운영자 추가');
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.settings.manage'),
    true,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.staff.manage'),
    true,
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.problem.manage'),
    false,
  );
});

test('permission arrays provide OR access in the helper and the real access gate', async () => {
  session = forRoles('staff_manager');
  const permissions = ['contest.settings.manage', 'contest.staff.manage'];
  assert.equal(hasContestPermission(session, 'contest', permissions), true);
  assert.equal(
    hasContestPermission(session, 'contest', [
      'contest.settings.manage',
      'contest.problem.manage',
    ]),
    false,
  );
  assert.equal(hasContestPermission(session, 'contest', []), false);
  assert.equal(hasContestPermission(session, 'other', permissions), false);
  await render(
    h(
      OperatorAccessGate,
      { contestId: 'contest', permission: permissions },
      () => h('p', { 'data-protected': true }, '운영자 관리'),
    ),
  );
  assert.ok(container.querySelector('[data-protected]'));
  await render(
    h(
      OperatorAccessGate,
      {
        contestId: 'contest',
        permission: ['contest.settings.manage', 'contest.problem.manage'],
      },
      () => h('p', { 'data-protected': true }, '허용되지 않은 관리'),
    ),
  );
  assert.equal(container.querySelector('[data-protected]'), null);
});

test('scopes merge contest-list and staff-session access only for the requested contest', () => {
  session = forRoles('staff_manager');
  session.operatorContests = [
    {
      contest: { contest_id: 'contest' },
      scopes: ['contest.view', 'contest.scoreboard.view'],
    },
    { contest: { contest_id: 'other' }, scopes: ['contest.*'] },
  ];
  assert.deepEqual(
    contestScopesFor(session, 'contest').sort(),
    [
      'contest.view',
      'contest.staff.view',
      'contest.staff.manage',
      'contest.scoreboard.view',
    ].sort(),
  );
  assert.equal(
    hasContestPermission(session, 'contest', 'contest.settings.manage'),
    false,
  );
  assert.equal(isServiceMaster(session), false);
  assert.equal(isContestMaster(session, 'contest'), false);
  assert.equal(isContestMaster(session, 'other'), true);
});

test('role labels cover every supported role and preserve configured multi-role assignments', () => {
  assert.deepEqual(
    CONTEST_ROLES.map((role) => role.value),
    ['owner', 'master', ...Object.keys(roleScopes)],
  );
  for (const role of Object.keys(roleScopes)) {
    assert.deepEqual(
      contestRolesForAccount(
        staffWith(['contest.view', ...roleScopes[role]]),
        'contest',
      ),
      role === 'problem_author'
        ? ['problems_viewer', 'problem_author', 'problem_reviewer']
        : role === 'problem_reviewer'
          ? ['problems_viewer', 'problem_reviewer']
          : [role],
    );
  }
  const staff = {
    ...staffWith(['contest.*']),
    contest_roles: { contest: ['participants_manager', 'problem_reviewer'] },
  };
  assert.deepEqual(contestRolesForAccount(staff, 'contest'), [
    'participants_manager',
    'problem_reviewer',
    'problems_viewer',
  ]);
  assert.deepEqual(contestRolesForAccount(staff, 'other'), []);
  assert.deepEqual(
    contestRolesForAccount(staffWith(['contest.*']), 'contest'),
    ['master'],
  );
});

test('role titles use master, author, operator, reviewer priority for every role pair in either order', () => {
  const titles = {
    owner: '총괄',
    master: '마스터',
    problem_author: '출제진',
    settings_manager: '운영진',
    participants_manager: '운영진',
    posts_manager: '운영진',
    notices_manager: '운영진',
    staff_manager: '운영진',
    problems_viewer: '운영진',
    submissions_viewer: '운영진',
    scoreboard_viewer: '운영진',
    scoreboard_manager: '운영진',
    audit_viewer: '운영진',
    problem_reviewer: '검수진',
  };
  const priority = ['총괄', '마스터', '출제진', '검수진', '운영진'];
  for (const [left, leftTitle] of Object.entries(titles)) {
    assert.equal(contestRoleTitle([left]), leftTitle);
    for (const [right, rightTitle] of Object.entries(titles)) {
      const expected =
        priority[
          Math.min(priority.indexOf(leftTitle), priority.indexOf(rightTitle))
        ];
      assert.equal(
        contestRoleTitle([left, right]),
        expected,
        `${left} + ${right}`,
      );
    }
  }
  assert.equal(contestRoleTitle([]), null);
});

test('mixed role title is stable across all selection permutations', () => {
  function permutations(values) {
    return values.length
      ? values.flatMap((value, index) =>
          permutations(values.filter((_, i) => i !== index)).map(
            (remaining) => [value, ...remaining],
          ),
        )
      : [[]];
  }
  for (const [roles, expected] of [
    [
      ['problem_reviewer', 'notices_manager', 'problem_author', 'master'],
      '마스터',
    ],
    [
      ['audit_viewer', 'problem_reviewer', 'problem_author', 'posts_manager'],
      '출제진',
    ],
    [
      ['problem_reviewer', 'notices_manager', 'audit_viewer', 'posts_manager'],
      '검수진',
    ],
  ]) {
    for (const ordered of permutations(roles))
      assert.equal(contestRoleTitle(ordered), expected, ordered.join(' + '));
  }
});

test('legacy partial scopes derive titles without requiring modern role assignments', () => {
  for (const scope of ['master', '*', 'contest.*'])
    assert.equal(
      contestRoleTitleForScopes(['contest.problem.manage', scope]),
      '마스터',
    );
  for (const scope of [
    'contest.problem.manage',
    'contest.problem.create',
    'contest.problem.update',
    'contest.problem.delete',
    'contest.problem.reorder',
    'contest.problem.resource.view',
    'contest.problem.resource.manage',
    'contest.testcase.view',
    'contest.testcase.manage',
    'contest.generator.view',
    'contest.generator.manage',
  ])
    assert.equal(
      contestRoleTitleForScopes([
        'contest.notice.view',
        'contest.problem.review',
        scope,
      ]),
      '출제진',
      scope,
    );
  for (const scope of [
    'contest.view',
    'contest.problem.view',
    'contest.notice.view',
    'contest.notice.create',
    'contest.board.answer.create',
    'contest.access_log.view',
    'contest.audit.view',
    'contest.participant.update',
    'contest.update_schedule',
  ])
    assert.equal(contestRoleTitleForScopes([scope]), '운영진', scope);
  assert.equal(
    contestRoleTitleForScopes([
      'contest.view',
      'contest.problem.review',
      'contest.problem.test',
    ]),
    '검수진',
  );
  assert.equal(contestRoleTitleForScopes(['contest.problem.test']), '검수진');
  assert.equal(contestRoleTitleForScopes([]), null);
  assert.equal(contestRoleTitleForScopes(['service.logs.view']), null);
});

test('account role titles respect explicit assignments, legacy empty roles, and contest boundaries', () => {
  const account = {
    ...staffWith(['contest.*']),
    contest_roles: {
      contest: ['problem_reviewer', 'problem_author'],
      legacy: [],
    },
    contest_scopes: {
      contest: ['contest.*'],
      legacy: ['contest.notice.create'],
    },
  };
  assert.equal(contestRoleTitleForAccount(account, 'contest'), '출제진');
  assert.equal(contestRoleTitleForAccount(account, 'legacy'), '운영진');
  assert.equal(contestRoleTitleForAccount(account, 'unassigned'), null);
  assert.equal(
    contestRoleTitleForAccount(
      staffWith(['contest.problem.review']),
      'contest',
    ),
    '검수진',
  );
  assert.equal(
    contestRoleTitleForAccount(
      { ...account, is_service_master: true },
      'unassigned',
    ),
    '마스터',
  );
});

test('assigned contest master protection is explicit and scoped to the allocated contest', () => {
  const staff = {
    ...staffWith(['contest.*']),
    protected_master_contests: ['contest'],
  };
  assert.equal(isAssignedContestMaster(staff, 'contest'), true);
  assert.equal(isAssignedContestMaster(staff, 'other'), false);
  assert.equal(
    isAssignedContestMaster(staffWith(['contest.*']), 'contest'),
    false,
  );
  assert.equal(
    isAssignedContestMaster(
      { ...staff, protected_master_contests: [] },
      'contest',
    ),
    false,
  );
});

test('session mapping and storage preserve explicit roles and assigned master protection', () => {
  const staffApi = {
    access_token: 'staff-token',
    refresh_token: 'staff-refresh',
    default_redirect: '/operator',
    staff: {
      ...staffWith(['contest.*']),
      contest_roles: {
        contest: ['master'],
        other: ['participants_manager', 'problem_reviewer'],
      },
      protected_master_contests: ['contest'],
    },
  };
  const mappedStaff = mapStaffSession(staffApi);
  assert.deepEqual(
    mappedStaff.staff.contest_roles,
    staffApi.staff.contest_roles,
  );
  assert.deepEqual(mappedStaff.staff.protected_master_contests, ['contest']);
  const general = mapGeneralSession({
    access_token: 'general-token',
    account: { email: 'staff@test', display_name: '운영진' },
    participant_contests: [],
    operator_contests: [],
    operator_session: staffApi,
  });
  saveGeneralSession(general);
  const restored = loadStoredGeneralSession();
  assert.deepEqual(restored, general);
  assert.deepEqual(
    contestRolesForAccount(restored.operatorSession.staff, 'other'),
    ['participants_manager', 'problem_reviewer', 'problems_viewer'],
  );
  assert.equal(
    isAssignedContestMaster(restored.operatorSession.staff, 'contest'),
    true,
  );
  assert.equal(
    isAssignedContestMaster(restored.operatorSession.staff, 'other'),
    false,
  );
});

test('explicit operator session revocation clears prior contest and service master privileges after storage reload', async () => {
  for (const wasServiceMaster of [false, true]) {
    const previous = generalWith(['contest.*']);
    previous.operatorSession.staff.is_service_master = wasServiceMaster;
    previous.operatorContests = [
      { contest: { contest_id: 'contest' }, scopes: ['master'] },
    ];
    saveGeneralSession(previous);
    const revoked = mapGeneralSession(
      {
        access_token: 'fresh-general-token',
        account: { email: 'staff@test', display_name: '운영진' },
        participant_contests: [],
        operator_contests: [],
        operator_session: null,
      },
      loadStoredGeneralSession(),
    );
    assert.equal(revoked.operatorSession, null);
    saveGeneralSession(revoked);
    session = loadStoredGeneralSession();
    assert.equal(isServiceMaster(session), false);
    assert.equal(isContestMaster(session, 'contest'), false);
    assert.equal(hasContestAccess(session, 'contest'), false);
    assert.equal(
      hasContestPermission(session, 'contest', 'contest.staff.manage'),
      false,
    );
    await render(
      h(
        OperatorAccessGate,
        { contestId: 'contest', permission: 'contest.staff.manage' },
        () => h('p', { 'data-protected': true }, '철회된 관리자'),
      ),
    );
    assert.equal(container.querySelector('[data-protected]'), null);
  }
});

test('owner scopes preserve full master access with a separate owner title', () => {
  const account = staffWith(['contest.*', 'contest.owner']);
  assert.deepEqual(contestRolesForAccount(account, 'contest'), ['owner']);
  assert.equal(
    contestRoleTitleForScopes(account.contest_scopes.contest),
    '총괄',
  );
  assert.equal(contestRoleTitleForAccount(account, 'contest'), '총괄');
});

test('running operators read problem statements without review, test or edit powers', async () => {
  session = forRoles('settings_manager');
  for (const status of ['draft', 'open', 'running', 'ended', 'archived']) {
    contestStatus = status;
    client.clear();
    await render(
      h(
        OperatorAccessGate,
        {
          contestId: 'contest',
          permission: ['contest.problem.view', 'contest.problem.review'],
        },
        () => h('p', { 'data-problems': true }, '문제 본문'),
      ),
    );
    assert.equal(
      Boolean(container.querySelector('[data-problems]')),
      status === 'running',
      status,
    );
    assert.equal(
      hasContestPermission(session, 'contest', 'contest.problem.view', status),
      status === 'running',
    );
    for (const scope of [
      'contest.problem.manage',
      'contest.problem.test',
      'contest.problem.review',
      'contest.problem.resource.view',
      'contest.notice.manage',
      'contest.board.question.manage',
    ])
      assert.equal(
        hasContestPermission(session, 'contest', scope, status),
        false,
        scope,
      );
    for (const scope of [
      'contest.problem.view',
      'contest.notice.view',
      'contest.board.question.view',
    ])
      assert.equal(
        hasContestPermission(session, 'other', scope, status),
        false,
      );
    await render();
    assert.equal(tabs().includes('problem-review'), status === 'running');
    assert.ok(tabs().includes('notices') && tabs().includes('board'));
  }
});

test('compact operator menu closes on Escape and navigation while preserving the active page', async () => {
  session = forRoles('settings_manager');
  await render();
  const trigger = container.querySelector('.operator-menu-trigger');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.ok(document.getElementById(trigger.getAttribute('aria-controls')));
  await act(async () => trigger.click());
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  await act(async () =>
    trigger.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, trigger);
  await act(async () => trigger.click());
  await act(async () =>
    container.querySelector('nav a[href$="/settings"]').click(),
  );
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.match(trigger.textContent, /설정/);
  assert.equal(
    container
      .querySelector('nav a[href$="/settings"]')
      .getAttribute('aria-current'),
    'page',
  );
});

test('participant preview appears in the top contest context, outside the collapsed menu', async () => {
  session = forRoles('participant_preview');
  await render();
  const preview = container.querySelector(
    '[aria-label="참가자 화면 미리보기"]',
  );
  assert.ok(preview);
  assert.ok(preview.closest('.operator-context'));
  assert.equal(preview.closest('.operator-menu-collapse'), null);
  assert.match(preview.getAttribute('href'), /preview=1/);
});
