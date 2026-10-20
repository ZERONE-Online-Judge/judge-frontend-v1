const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://judge.test/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
let session, publicQuery, operatorQuery, visible, options;
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
    if (id.endsWith('.png')) return { __esModule: true, default: 'logo.png' };
    if (id === '@tanstack/react-query')
      return {
        useQuery: (input) => {
          options.push(input);
          return input.queryKey[0] === 'public-contests'
            ? publicQuery
            : operatorQuery;
        },
      };
    if (id === '@/domains/contestAdministration/api')
      return { getPublicContests: async (token) => token };
    if (id === '@/domains/identityAccess/sessionStore')
      return {
        useSessionStore: (selector) => selector({ generalSession: session }),
      };
    if (id === '@/domains/identityAccess/useRefreshGeneralSession')
      return { useRefreshGeneralSession: () => {} };
    if (id === '@/shared/hooks/useDocumentVisibility')
      return { __esModule: true, default: () => visible };
    if (id === '@/components/contest/ContestAccessDeniedModal')
      return {
        __esModule: true,
        default: () => h('div', { role: 'dialog' }, '접근 권한 없음'),
      };
    if (id === '@/utils/Icons') return { SvgIcon: () => null };
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
const Page = source('pages/public/ContestsPage.tsx').default;
const Footer = source('components/layout/Footer.tsx').default;
function contest(id, start, end, status = 'open') {
  return {
    contest_id: id,
    title: id,
    organization_name: 'ZERONE',
    start_at: new Date(Date.now() + start).toISOString(),
    end_at: new Date(Date.now() + end).toISOString(),
    status,
  };
}
const day = 86400000;
let root, host;
beforeEach(() => {
  session = null;
  visible = true;
  options = [];
  publicQuery = {
    data: [
      contest('later', day * 3, day * 4),
      contest('running', -day, day),
      contest('soon', day, day * 2),
      contest('past', -day * 3, -day * 2, 'ended'),
    ],
    isLoading: false,
    isError: false,
  };
  operatorQuery = { data: undefined, isLoading: false, isError: false };
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
});
afterEach(async () => act(async () => root.unmount()));
after(() => dom.window.close());
async function render(Component = Page) {
  await act(async () => root.render(h(MemoryRouter, null, h(Component))));
}
async function clickButton(name) {
  const button = [...host.querySelectorAll('button')].find((el) =>
    el.textContent.startsWith(name),
  );
  assert.ok(button);
  await act(async () => button.click());
}
function titles() {
  return [...host.querySelectorAll('.directory-card h3')].map(
    (el) => el.textContent,
  );
}
test('contests group by current phase and upcoming events show nearest first', async () => {
  await render();
  assert.deepEqual(titles(), ['running', 'soon', 'later', 'past']);
  await clickButton('시작 예정');
  assert.deepEqual(titles(), ['soon', 'later']);
});
test('anonymous mine filter explains sign in and does not show public contests as personal', async () => {
  await render();
  await clickButton('내 대회');
  assert.deepEqual(titles(), []);
  assert.match(host.querySelector('.directory-empty').textContent, /로그인/);
  assert.equal(
    host.querySelector('.directory-empty a').getAttribute('href'),
    '/login?moveTo=%2Fcontests',
  );
});
test('mine includes preview assignments as operators and opens management', async () => {
  const hidden = contest('preview', day, day * 2, 'draft');
  session = {
    account: {},
    participantContests: [{ contest: publicQuery.data[1] }],
    operatorContests: [
      { contest: hidden, scopes: ['contest.participant.preview'] },
    ],
    operatorSession: null,
  };
  await render();
  await clickButton('내 대회');
  assert.deepEqual(titles(), ['running', 'preview']);
  const cards = [...host.querySelectorAll('.directory-card')];
  assert.equal(
    cards[1].querySelector('a').getAttribute('href'),
    '/operator/contests/preview',
  );
  assert.match(cards[1].textContent, /운영/);
  assert.match(cards[1].textContent, /비공개/);
  assert.match(cards[1].textContent, /일정 준비 중/);
});
test('operator assignments lead to management and participants to contestant workspace', async () => {
  session = {
    account: {},
    participantContests: [{ contest: publicQuery.data[1] }],
    operatorContests: [
      { contest: publicQuery.data[0], scopes: ['contest.settings.manage'] },
    ],
    operatorSession: null,
  };
  await render();
  await clickButton('내 대회');
  assert.deepEqual(
    [...host.querySelectorAll('.directory-card a')].map((el) =>
      el.getAttribute('href'),
    ),
    ['/contests/running', '/operator/contests/later'],
  );
});
test('failed loading stays distinct from empty state and invisible pages stop polling', async () => {
  visible = false;
  publicQuery = { data: undefined, isError: true, isLoading: false };
  await render();
  assert.match(
    host.querySelector('[role=alert]').textContent,
    /불러오지 못했어요/,
  );
  assert.equal(host.querySelector('.directory-empty'), null);
  assert.ok(options.every((item) => item.refetchInterval === false));
});
test('footer preserves team contacts, links to supported help tab, and honors reduced motion when returning to top', async () => {
  let scrolled;
  window.matchMedia = () => ({ matches: true });
  window.scrollTo = (options) => {
    scrolled = options;
  };
  await render(Footer);
  assert.equal(host.querySelector('details').open, false);
  assert.equal(host.querySelectorAll('details a[href^="mailto:"]').length, 4);
  assert.ok(host.querySelector('a[href="/support/help"]'));
  assert.ok(host.querySelector('a[href="/notices"]'));
  await clickButton('맨 위로');
  assert.deepEqual(scrolled, { top: 0, behavior: 'auto' });
});

test('directory requests and caches are scoped to the authenticated account and reset on logout', async () => {
  session = {
    accessToken: 'member-a',
    account: {},
    participantContests: [],
    operatorContests: [],
  };
  await render();
  const first = options
    .filter((item) => item.queryKey[0] === 'public-contests')
    .at(-1);
  assert.equal(await first.queryFn(), 'member-a');
  session = { ...session, accessToken: 'member-b' };
  await render();
  const second = options
    .filter((item) => item.queryKey[0] === 'public-contests')
    .at(-1);
  assert.equal(await second.queryFn(), 'member-b');
  assert.notDeepEqual(first.queryKey, second.queryKey);
  session = null;
  await render();
  const anonymous = options
    .filter((item) => item.queryKey[0] === 'public-contests')
    .at(-1);
  assert.equal(await anonymous.queryFn(), undefined);
  assert.notDeepEqual(second.queryKey, anonymous.queryKey);
});
