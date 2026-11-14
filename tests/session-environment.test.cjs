const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setTimeout: pause } = require('node:timers/promises');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://judge.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
let root, host, client;
const windows = {
  browser: 'Chrome',
  os: 'Windows',
  device: 'desktop',
  label: 'Chrome · Windows',
};
const iphone = {
  browser: 'Safari',
  os: 'iOS',
  device: 'mobile',
  label: 'Safari · iOS · 모바일',
};
function description(environment = iphone, extra = {}) {
  return {
    scope: 'general',
    issued_at: '2026-11-10T00:00:00Z',
    last_seen_at: '2026-11-10T01:00:00Z',
    expires_at: '2026-11-11T00:00:00Z',
    environment,
    ...extra,
  };
}
const user = {
  email: 'stored@example.com',
  display_name: '사용자',
  names: ['사용자'],
  roles: ['general'],
  has_password: true,
  password_updated_at: null,
  account_created_at: null,
  participant_contest_count: 0,
  participations: [],
  operator_contests: [],
  sessions: [
    description(windows),
    description(iphone, { scope: 'participant', contest_id: 'contest' }),
  ],
};
const mocks = {
  '@/shared/ui/ModalDialog': {
    __esModule: true,
    default: ({ title, children, footer }) =>
      h('section', { role: 'dialog' }, h('h2', null, title), children, footer),
    ModalButton: ({ children, ...props }) => h('button', props, children),
  },
  '@/components/admin/AdminShell': {
    AdminAccessGate: ({ children }) => children({ accessToken: 'admin-token' }),
    AdminLayout: ({ children }) => h('main', null, children),
    AdminPanel: ({ title, children }) =>
      h('section', null, h('h2', null, title), children),
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'admin',
  },
  '@/domains/identityAccess/adminUsers': {
    adminUserSortKeys: ['email'],
    listAdminUsers: async () => ({
      data: [],
      page: { total_count: 0, next_cursor: null, limit: 25 },
    }),
    getAdminUserDetail: async () => user,
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
    if (id.endsWith('.css')) return {};
    if (mocks[id]) return mocks[id];
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
    ts.transpileModule(
      fs
        .readFileSync(filename, 'utf8')
        .replace('import.meta.env.VITE_API_BASE_URL', 'undefined'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    filename,
  );
  return loaded.exports;
}
const { sessionEnvironmentLabel, readSessionDescriptions } = source(
  'shared/lib/sessionEnvironment.ts',
);
const { SessionDescriptionList } = source('shared/ui/SessionEnvironment.tsx');
const Member = source('components/operator/ParticipantMemberCard.tsx').default;
const AccessLogs = source('components/audit/AccessLogTable.tsx').default;
const OperationalLogs = source(
  'components/audit/OperationalAuditLogTable.tsx',
).default;
const AdminUsers = source('pages/admin/AdminUsersPage.tsx').default;
async function mount(element, entry = '/') {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: [entry] }, element),
      ),
    );
    await pause(10);
  });
  await act(async () => {
    await pause(10);
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  client?.clear();
  root = host = client = null;
});
after(() => dom.window.close());

test('stored browser and OS labels cover desktop, iOS, Android, and unknown metadata without guessing hardware', () => {
  for (const item of [
    windows,
    iphone,
    {
      browser: 'Chrome',
      os: 'Android',
      device: 'mobile',
      label: 'Chrome · Android · 모바일',
    },
    {
      browser: 'Safari',
      os: 'iPadOS',
      device: 'tablet',
      label: 'Safari · iPadOS · 태블릿',
    },
    {
      browser: 'Firefox',
      os: 'macOS',
      device: 'desktop',
      label: 'Firefox · macOS',
    },
  ])
    assert.equal(sessionEnvironmentLabel(item), item.label);
  assert.equal(sessionEnvironmentLabel(), '환경 정보 없음');
  assert.equal(
    sessionEnvironmentLabel({
      browser: 'Unknown',
      os: 'Unknown',
      device: 'unknown',
      label: '',
    }),
    '환경 정보 없음',
  );
  assert.equal(
    sessionEnvironmentLabel({ ...windows, label: '' }),
    'Chrome · Windows',
  );
  assert.equal(
    sessionEnvironmentLabel({ ...iphone, label: '' }),
    'Safari · iOS · 모바일',
  );
});

test('conflict metadata accepts only session descriptions and never copies credentials or the viewer environment', () => {
  const rows = readSessionDescriptions([
    null,
    {},
    { scope: 'general' },
    {
      ...description(iphone),
      token: 'secret',
      user_agent: 'Viewer Browser',
      session_id: 'private-session-id',
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].environment.label, 'Safari · iOS · 모바일');
  assert.equal(JSON.stringify(rows).includes('secret'), false);
  assert.equal(JSON.stringify(rows).includes('Viewer Browser'), false);
  assert.equal(JSON.stringify(rows).includes('private-session-id'), false);
  assert.deepEqual(readSessionDescriptions('not-an-array'), []);
  assert.equal(
    readSessionDescriptions(Array.from({ length: 30 }, () => description()))
      .length,
    20,
  );
});

test('session descriptions retain timestamps, handle unknown legacy data, and wrap long labels', async () => {
  const label = 'Chrome · Windows · ' + '긴 접속 환경'.repeat(50);
  await mount(
    h(SessionDescriptionList, {
      sessions: [
        description({ ...windows, label }),
        description(null, { issued_at: 'invalid', last_seen_at: 'invalid' }),
      ],
      showExpiry: true,
    }),
  );
  const list = host.querySelector('ul');
  assert.ok(list.textContent.includes(label));
  assert.ok(list.textContent.includes('환경 정보 없음'));
  assert.ok(list.textContent.includes('시각 정보 없음'));
  assert.ok(list.textContent.includes('마지막 사용'));
  assert.ok(list.textContent.includes('로그인'));
  assert.ok(list.textContent.includes('만료'));
  assert.ok(
    list.querySelector('li').className.includes('[overflow-wrap:anywhere]'),
  );
});

test('operator member cards show session environments without account logout controls', async () => {
  await mount(
    h(Member, {
      member: {
        team_member_id: 'member',
        name: '팀장',
        email: 'person@example.com',
        role: 'leader',
        active_sessions: 2,
        sessions: [
          description(windows, { scope: 'participant' }),
          description(iphone, { scope: 'participant' }),
        ],
      },
      pending: false,
    }),
  );
  const disclosure = host.querySelector('details');
  assert.equal(disclosure.open, false);
  assert.ok(host.querySelector('summary').textContent.includes('활성 세션'));
  assert.equal(
    host.querySelector('summary').textContent.includes('2개'),
    false,
  );
  await act(async () => host.querySelector('summary').click());
  assert.equal(disclosure.open, true);
  assert.ok(host.textContent.includes('Chrome · Windows'));
  assert.ok(host.textContent.includes('Safari · iOS · 모바일'));
  assert.equal(
    [...host.querySelectorAll('button')].some((item) =>
      item.textContent.includes('로그아웃'),
    ),
    false,
  );
});

test('active legacy member sessions show unknown and inactive members do not display stale metadata', async () => {
  const member = {
    name: '팀장',
    email: 'person@example.com',
    role: 'leader',
    active_sessions: 1,
  };
  await mount(h(Member, { member, pending: false }));
  assert.ok(host.textContent.includes('환경 정보 없음'));
  await act(async () =>
    root.render(
      h(Member, {
        member: {
          ...member,
          active_sessions: 0,
          sessions: [description(iphone)],
        },
        pending: false,
      }),
    ),
  );
  assert.ok(host.textContent.includes('세션 없음'));
  assert.equal(host.textContent.includes('Safari · iOS'), false);
});

test('access log mobile and desktop rows and details use each recorded environment while keeping IP and original UA', async () => {
  await mount(
    h(AccessLogs, {
      logs: [
        {
          access_log_id: 'one',
          event_type: 'general_login',
          account_scope: 'general',
          email: 'iphone@example.com',
          client_ip: '192.0.2.1',
          user_agent: 'Stored Safari UA',
          environment: iphone,
          created_at: '2026-11-10T01:00:00Z',
        },
        {
          access_log_id: 'two',
          event_type: 'general_login',
          account_scope: 'general',
          email: 'unknown@example.com',
          client_ip: '192.0.2.2',
          environment: null,
          created_at: '2026-11-10T02:00:00Z',
        },
      ],
    }),
  );
  assert.equal(host.textContent.split('Safari · iOS · 모바일').length - 1, 2);
  assert.equal(host.textContent.split('환경 정보 없음').length - 1, 2);
  await act(async () =>
    host
      .querySelector('button[aria-label="iphone@example.com 접속 상세 보기"]')
      .click(),
  );
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(dialog.textContent.includes('Safari · iOS · 모바일'));
  assert.ok(dialog.textContent.includes('192.0.2.1'));
  assert.ok(dialog.textContent.includes('원본 User-AgentStored Safari UA'));
});

test('operational audit rows and details show the recorded browser and OS', async () => {
  await mount(
    h(OperationalLogs, {
      logs: [
        {
          operational_audit_log_id: 'op',
          scope: 'admin',
          action: 'update',
          method: 'PATCH',
          path: '/api/admin/contests/contest',
          status_code: 200,
          actor_email: 'admin@example.com',
          client_ip: '192.0.2.10',
          user_agent: 'Stored Chrome UA',
          environment: windows,
          created_at: '2026-11-10T01:00:00Z',
          details: {},
        },
      ],
    }),
  );
  assert.equal(host.textContent.split('Chrome · Windows').length - 1, 2);
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((item) => item.textContent === '상세 기록 보기')
      .click(),
  );
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(dialog.textContent.includes('접속 환경: Chrome · Windows'));
  assert.ok(dialog.textContent.includes('IP: 192.0.2.10'));
  assert.ok(dialog.textContent.includes('원본 User-Agent: Stored Chrome UA'));
});

test('administrator user detail lists actual active sessions across account scopes', async () => {
  await mount(h(AdminUsers), '/admin/users?user=stored%40example.com');
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.ok(dialog.textContent.includes('활성 로그인 세션'));
  assert.ok(dialog.textContent.includes('Chrome · Windows'));
  assert.ok(dialog.textContent.includes('Safari · iOS · 모바일'));
  assert.ok(dialog.textContent.includes('만료'));
  assert.equal(
    dialog.querySelectorAll('ul[aria-label="활성 로그인 세션"] li').length,
    2,
  );
});
