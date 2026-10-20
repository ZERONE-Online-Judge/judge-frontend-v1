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
global.requestAnimationFrame = (callback) => global.setTimeout(callback, 0);
global.cancelAnimationFrame = (id) => global.clearTimeout(id);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useLocation,
} = require('react-router-dom');
let query, options, visible, location, navigate;
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
    if (id === '@tanstack/react-query')
      return {
        useQuery: (input) => {
          options = input;
          return query;
        },
      };
    if (id === '@/domains/serviceCommunication/api')
      return { getPublicServiceNotices: () => {} };
    if (id === '@/shared/hooks/useDocumentVisibility')
      return { __esModule: true, default: () => visible };
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
const NoticesPage = source('pages/public/NoticesPage.tsx').default;
const notices = Array.from({ length: 25 }, (_, i) => ({
  service_notice_id: `n${i + 1}`,
  title: `공지 ${i + 1}`,
  summary: `요약 ${i + 1}`,
  body: i === 24 ? '검색할 본문 needle' : `본문 ${i + 1}`,
  emergency: i === 24,
  published_at: new Date(Date.UTC(2026, 0, 25 - i)).toISOString(),
}));
let root, host;
function Observer() {
  location = useLocation();
  navigate = useNavigate();
  return null;
}
beforeEach(() => {
  visible = true;
  query = {
    data: notices,
    isError: false,
    isPending: false,
    isFetching: false,
  };
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
});
afterEach(async () => act(async () => root.unmount()));
after(() => dom.window.close());
async function render(url = '/notices') {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(Observer),
        h(
          Routes,
          null,
          h(Route, { path: '/notices', element: h(NoticesPage) }),
          h(Route, { path: '/notices/:noticeId', element: h(NoticesPage) }),
        ),
      ),
    ),
  );
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
}
function toggle(id) {
  return document.getElementById(`notice-toggle-${id}`);
}

test('emergency notices come first and page links keep the list bounded', async () => {
  await render();
  assert.equal(
    host.querySelector('.notices-row-toggle').id,
    'notice-toggle-n25',
  );
  assert.equal(host.querySelectorAll('.notices-row').length, 20);
  await click(host.querySelector('[aria-label="다음 페이지"]'));
  assert.equal(host.querySelectorAll('.notices-row').length, 5);
  assert.match(location.search, /page=2/);
});

test('a deep link opens the correct page and browser history restores the expanded notice', async () => {
  await render('/notices?noticeId=n24');
  assert.equal(toggle('n24').getAttribute('aria-expanded'), 'true');
  await click(toggle('n23'));
  assert.equal(toggle('n24').getAttribute('aria-expanded'), 'false');
  assert.equal(toggle('n23').getAttribute('aria-expanded'), 'true');
  await act(async () => navigate(-1));
  assert.equal(toggle('n24').getAttribute('aria-expanded'), 'true');
  assert.equal(toggle('n23').getAttribute('aria-expanded'), 'false');
});

test('body search and emergency filters work together and clamp invalid pages', async () => {
  await render('/notices?q=needle&filter=emergency&page=999');
  assert.equal(host.querySelectorAll('.notices-row').length, 1);
  assert.ok(toggle('n25'));
  assert.equal(host.querySelector('.notices-pagination'), null);
});

test('a requested notice hidden by a search can be recovered without losing its link', async () => {
  await render('/notices?q=missing&noticeId=n24');
  assert.match(host.textContent, /검색 조건에 포함되지/);
  await click(
    [...host.querySelectorAll('button')].find(
      (button) => button.textContent === '검색 초기화',
    ),
  );
  assert.equal(toggle('n24').getAttribute('aria-expanded'), 'true');
  assert.equal(location.pathname, '/notices/n24');
  assert.equal(location.search, '');
});

test('notice titles are crawlable permalink links and direct paths open the matching notice', async () => {
  await render('/notices/n24');
  const link = toggle('n24');
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('href'), '/notices/n24?page=2');
  assert.equal(link.getAttribute('aria-expanded'), 'true');
  assert.match(
    document.getElementById('notice-body-n24').textContent,
    /본문 24/,
  );
  await click(toggle('n23'));
  assert.equal(location.pathname, '/notices/n23');
  assert.equal(toggle('n23').getAttribute('aria-expanded'), 'true');
  await click(toggle('n23'));
  assert.equal(location.pathname, '/notices');
  assert.match(location.search, /page=2/);
  await act(async () => navigate(-1));
  assert.equal(location.pathname, '/notices/n23');
  assert.equal(toggle('n23').getAttribute('aria-expanded'), 'true');
});

test('failed notice loading is not represented as an empty collection', async () => {
  query = {
    data: undefined,
    isError: true,
    isPending: false,
    isFetching: false,
  };
  await render();
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /불러오지 못했습니다/,
  );
  assert.equal(host.querySelector('.notices-empty'), null);
});

test('public notices stop polling when the page is hidden', async () => {
  visible = false;
  await render();
  assert.equal(options.refetchInterval, false);
  assert.equal(options.refetchIntervalInBackground, false);
});
