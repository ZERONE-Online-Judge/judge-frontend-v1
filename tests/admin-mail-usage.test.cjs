const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/admin/mail',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
global.cancelAnimationFrame = (timer) => window.clearTimeout(timer);
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');

let session, result, failure, pending, calls, root, host, client;
const cache = new Map();
const api = new Proxy(
  {
    getAdminMailUsage: async (token) => {
      calls.push({ method: 'getAdminMailUsage', token });
      if (pending) await pending;
      if (failure) throw failure;
      return JSON.parse(JSON.stringify(result));
    },
  },
  {
    get(target, key) {
      if (key in target) return target[key];
      return () => {
        calls.push({ method: String(key) });
        throw new Error('Mail usage must be read-only');
      };
    },
  },
);

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/domains/identityAccess/sessionStore')
      return {
        useSessionStore: (selector) => selector({ generalSession: session }),
      };
    if (id === '@/domains/identityAccess/queryIdentity')
      return {
        tokenQueryIdentity: () => session?.account.email ?? 'anonymous',
      };
    if (id === '@/shared/hooks/useDocumentVisibility')
      return { __esModule: true, default: () => true };
    if (id === '@/domains/auditMonitoring/api') return api;
    if (!id.startsWith('@/')) return native(id);
    const relativePath = ['.ts', '.tsx']
      .map((ext) => id.slice(2) + ext)
      .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
    assert.ok(relativePath, `Cannot resolve ${id}`);
    return source(relativePath);
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

function admin(email = 'master@judge.test', accessToken = 'master-token') {
  return {
    account: { email },
    operatorContests: [],
    participantContests: [],
    operatorSession: {
      accessToken,
      staff: {
        email,
        display_name: '서비스 관리자',
        is_service_master: true,
        contest_scopes: {},
      },
    },
  };
}

function usage() {
  return {
    provider: 'resend',
    generated_at: '2026-11-03T02:15:00Z',
    metrics_delay_minutes: 15,
    quota: {
      status: 'ok',
      daily: {
        sent: 2,
        received: 3,
        used: 5,
        limit: 100,
        resets_at: '2026-11-04T00:00:00Z',
      },
      monthly: {
        sent: 150,
        received: 20,
        used: 170,
        limit: 3000,
        resets_at: '2026-12-01T00:00:00Z',
      },
      message: null,
    },
    weekly: {
      status: 'ok',
      sent: 24,
      start_at: '2026-10-27T02:15:00Z',
      end_at: '2026-11-03T02:15:00Z',
      message: null,
    },
  };
}

beforeEach(() => {
  session = admin();
  result = usage();
  failure = null;
  pending = null;
  calls = [];
  document.body.innerHTML = '<div id="test"></div>';
  host = document.getElementById('test');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
});
after(() => dom.window.close());

async function flush() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await flush();
  }
  assert.ok(predicate(), 'Expected mail usage view to settle');
}

async function render() {
  const Page = source('pages/admin/AdminMailPage.tsx').default;
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: ['/admin/mail'] }, h(Page)),
      ),
    );
  });
  await flush();
}

function card(label) {
  const region = host.querySelector(`[aria-label="${label}"]`);
  assert.ok(region, `Expected accessible ${label} card`);
  return region;
}

function cardHas(label, text) {
  return host
    .querySelector(`[aria-label="${label}"]`)
    ?.textContent.includes(text);
}

function button(label) {
  return [...host.querySelectorAll('button')].find((element) =>
    element.textContent.includes(label),
  );
}

async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}

test('service master gets separate daily, rolling weekly and monthly Resend figures', async () => {
  await render();
  await until(() => cardHas('일간 발송량', '100'));
  const daily = card('일간 발송량').textContent;
  const weekly = card('주간 발송량').textContent;
  const monthly = card('월간 발송량').textContent;
  assert.match(daily, /발송\s*2\s*건/);
  assert.match(daily, /사용량\s*5\s*(?:건|\/)/);
  assert.match(daily, /100/);
  assert.equal(
    card('일간 발송량')
      .querySelector('[role="meter"]')
      .getAttribute('aria-valuenow'),
    '5',
  );
  assert.match(weekly, /24\s*건/);
  assert.match(weekly, /별도 주간 한도 없음/);
  assert.match(monthly, /150\s*건/);
  assert.match(monthly, /3,?000/);
  assert.match(host.textContent, /15\s*분/);
  assert.equal(
    host.querySelector('a[href="/admin/mail"][aria-current="page"]')
      .textContent,
    '메일 발송량',
  );
  assert.deepEqual(calls, [
    { method: 'getAdminMailUsage', token: 'master-token' },
  ]);
});

test('an explicitly unlimited quota differs from missing quota data', async () => {
  result.quota.daily.limit = null;
  result.quota.monthly = null;
  await render();
  await until(() => cardHas('일간 발송량', '2'));
  assert.match(card('일간 발송량').textContent, /무제한|한도 없음/);
  assert.doesNotMatch(
    card('월간 발송량').textContent,
    /무제한|한도 없음|0\s*건/,
  );
  assert.match(card('월간 발송량').textContent, /확인|조회|정보/);
});

test('a successful zero-sent report remains a valid count', async () => {
  result.quota.daily.sent = 0;
  result.quota.daily.received = 0;
  result.quota.daily.used = 0;
  result.weekly.sent = 0;
  await render();
  await until(() => cardHas('일간 발송량', '100'));
  assert.match(card('일간 발송량').textContent, /발송\s*0\s*건/);
  assert.match(card('주간 발송량').textContent, /0\s*건/);
  assert.doesNotMatch(card('주간 발송량').textContent, /실패|확인할 수 없/);
});

for (const status of ['error', 'not_configured', 'unsupported']) {
  test(`${status} quotas stay unknown rather than claiming zero or unlimited capacity`, async () => {
    const messages = {
      error: '메일 제공업체에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.',
      not_configured: 'Resend가 설정되어 있지 않습니다.',
      unsupported: '현재 메일 제공업체에서는 발송량 조회를 지원하지 않습니다.',
    };
    result.quota = {
      status,
      daily: null,
      monthly: null,
      message: messages[status],
    };
    await render();
    await until(() => calls.length === 1 && !client.isFetching());
    for (const label of ['일간 발송량', '월간 발송량']) {
      assert.doesNotMatch(card(label).textContent, /0\s*건|무제한|한도 없음/);
    }
    assert.match(card('주간 발송량').textContent, /24\s*건/);
    assert.ok(host.textContent.includes(messages[status]));
  });
}

test('weekly query failure leaves daily and monthly quotas readable', async () => {
  result.weekly = {
    status: 'error',
    sent: null,
    start_at: null,
    end_at: null,
    message:
      '최근 7일 발송량을 조회하지 못했습니다. 잠시 후 다시 확인해 주세요.',
  };
  await render();
  await until(() => cardHas('일간 발송량', '100'));
  assert.match(card('일간 발송량').textContent, /2\s*건/);
  assert.match(card('월간 발송량').textContent, /3,?000/);
  assert.doesNotMatch(card('주간 발송량').textContent, /0\s*건/);
  assert.match(card('주간 발송량').textContent, /확인|조회|실패/);
  assert.ok(host.textContent.includes(result.weekly.message));
});

test('pending request uses a loading state without invented zero counts', async () => {
  let resolve;
  pending = new Promise((done) => {
    resolve = done;
  });
  await render();
  assert.match(host.textContent, /불러오는|조회 중|확인 중/);
  assert.doesNotMatch(host.textContent, /0\s*건|무제한/);
  await act(async () => resolve());
  await until(() => cardHas('주간 발송량', '24'));
});

test('a failed request shows a safe retryable error, not a successful empty report', async () => {
  failure = new Error('https://api.resend.com/private?api_key=sk_live_private');
  await render();
  await until(() => host.querySelector('[role="alert"]'));
  assert.doesNotMatch(
    host.textContent,
    /sk_live_private|api\.resend\.com|0\s*건/,
  );
  failure = null;
  await click(button('다시 시도') ?? button('새로고침'));
  await until(() => cardHas('주간 발송량', '24'));
  assert.equal(calls.length, 2);
});

test('refresh only reads usage and updates returned values', async () => {
  await render();
  await until(() => cardHas('주간 발송량', '24'));
  result.weekly.sent = 29;
  await click(button('새로고침'));
  await until(() => cardHas('주간 발송량', '29'));
  assert.deepEqual(calls, [
    { method: 'getAdminMailUsage', token: 'master-token' },
    { method: 'getAdminMailUsage', token: 'master-token' },
  ]);
});

test('failed refresh clearly marks retained results as an earlier report', async () => {
  await render();
  await until(() => cardHas('주간 발송량', '24'));
  failure = new Error('provider transport failure sk_live_private');
  await click(button('새로고침'));
  await until(() => host.querySelector('[role="alert"]'));
  assert.match(host.querySelector('[role="alert"]').textContent, /이전 조회/);
  assert.match(card('주간 발송량').textContent, /24\s*건/);
  assert.match(card('일간 발송량').textContent, /2\s*건/);
  assert.doesNotMatch(host.textContent, /sk_live_private/);
});

test('usage cache is separated by account identity when the active master changes', async () => {
  await render();
  await until(() => cardHas('주간 발송량', '24'));
  session = admin('second@judge.test', 'second-token');
  result.weekly.sent = 47;
  let resolve;
  pending = new Promise((done) => {
    resolve = done;
  });
  await render();
  assert.doesNotMatch(host.textContent, /24\s*건/);
  await act(async () => resolve());
  await until(() => cardHas('주간 발송량', '47'));
  assert.deepEqual(
    calls.map((call) => call.token),
    ['master-token', 'second-token'],
  );
  const keys = client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey);
  assert.ok(keys.some((key) => key.includes('master@judge.test')));
  assert.ok(keys.some((key) => key.includes('second@judge.test')));
  assert.doesNotMatch(JSON.stringify(keys), /master-token|second-token/);
});

for (const role of ['anonymous', 'participant', 'operator']) {
  test(`${role} cannot query or view service-master mail usage`, async () => {
    if (role === 'anonymous') session = null;
    else if (role === 'participant') session.operatorSession = null;
    else session.operatorSession.staff.is_service_master = false;
    await render();
    assert.deepEqual(calls, []);
    assert.equal(host.querySelector('[aria-label="일간 발송량"]'), null);
    assert.equal(host.querySelector('[aria-label="관리자 메뉴"]'), null);
  });
}

test('revoked service-master access hides already cached report contents', async () => {
  await render();
  await until(() => cardHas('주간 발송량', '24'));
  session.operatorSession.staff.is_service_master = false;
  await render();
  assert.equal(calls.length, 1);
  assert.equal(host.querySelector('[aria-label="일간 발송량"]'), null);
  assert.equal(host.querySelector('[aria-label="관리자 메뉴"]'), null);
});
