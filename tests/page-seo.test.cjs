const { test, beforeEach, afterEach, after } = require('node:test');
const { setTimeout } = require('node:timers');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(
  '<!doctype html><html><head></head><body></body></html>',
  {
    url: 'https://zoj.kr/',
  },
);
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const h = React.createElement;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, useNavigate } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const requests = [];
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === '@/shared/api/client') {
      return {
        apiRequest: (url) =>
          new Promise((resolve, reject) =>
            requests.push({ url, resolve, reject }),
          ),
      };
    }
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((extension) => id.slice(2) + extension)
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
const PageSeo = source('shared/seo/PageSeo.tsx').default;
const { resolveSeoPath } = source('shared/seo/metadata.ts');
let root, client, navigate;
function Observer() {
  navigate = useNavigate();
  return null;
}
function metadata(pathname, overrides = {}) {
  return {
    path: pathname,
    title: `제목 ${pathname} | ZOJ`,
    description: `설명 ${pathname}`,
    canonical: `https://zoj.kr${pathname}`,
    robots: 'index, follow',
    structured_data: [
      { '@context': 'https://schema.org', '@type': 'WebPage', name: pathname },
    ],
    ...overrides,
  };
}
function bootstrap(data) {
  const element = document.createElement('script');
  element.id = 'zoj-seo-data';
  element.type = 'application/json';
  element.textContent = JSON.stringify(data);
  document.head.append(element);
}
function meta(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content;
}
function canonical() {
  return document.querySelector('link[rel="canonical"]')?.href;
}
beforeEach(() => {
  requests.length = 0;
  document.head.innerHTML = '';
  document.body.innerHTML = '<main></main>';
  root = createRoot(document.querySelector('main'));
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
after(() => dom.window.close());
async function mount(url = '/') {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: [url] }, h(Observer), h(PageSeo)),
      ),
    ),
  );
}
async function settle(request, value) {
  await act(async () => {
    request.resolve(value);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test('server metadata is reused and duplicate head tags are replaced in place', async () => {
  document.head.innerHTML =
    '<title>ZOJ</title><meta name="description" content="old"><meta name="description" content="duplicate"><link rel="canonical" href="https://zoj.kr/old"><link rel="canonical" href="https://zoj.kr/duplicate"><script id="zoj-structured-data" type="application/ld+json">[]</script>';
  const description = document.querySelector('meta[name="description"]');
  const verification = document.createElement('meta');
  verification.name = 'naver-site-verification';
  verification.content = 'f0eb853061d8ee0b88b9b2eb28cbaab6e0d4f473';
  document.head.append(verification);
  bootstrap(metadata('/about'));
  await mount('/about');
  assert.equal(
    requests.length,
    0,
    'fresh server data should not be fetched again',
  );
  assert.equal(document.title, '제목 /about | ZOJ');
  assert.equal(document.querySelector('meta[name="description"]'), description);
  assert.equal(document.querySelectorAll('meta[name="description"]').length, 1);
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(canonical(), 'https://zoj.kr/about');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('naver-site-verification'), verification.content);
  assert.match(
    fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'),
    /name="naver-site-verification"\s+content="f0eb853061d8ee0b88b9b2eb28cbaab6e0d4f473"/,
  );
  assert.equal(document.querySelectorAll('#zoj-structured-data').length, 1);
  assert.equal(
    JSON.parse(document.getElementById('zoj-structured-data').textContent)[0]
      .name,
    '/about',
  );
});

test('navigation updates public metadata immediately and removes the previous structured data', async () => {
  bootstrap(metadata('/'));
  await mount();
  await act(async () => navigate('/about?token=do-not-publish#private'));
  assert.equal(document.title, 'ZOJ 소개 | ZOJ');
  assert.equal(canonical(), 'https://zoj.kr/about');
  assert.equal(meta('robots'), 'index,follow');
  assert.equal(document.getElementById('zoj-structured-data'), null);
  assert.equal(document.getElementById('zoj-seo-data'), null);
  assert.equal(requests[0].url, '/public/seo?path=%2Fabout');
  await settle(requests[0], metadata('/about'));
  assert.equal(document.title, '제목 /about | ZOJ');
  assert.equal(canonical(), 'https://zoj.kr/about');
  assert.equal(
    document.querySelectorAll('meta[property="og:title"]').length,
    1,
  );
  assert.doesNotMatch(document.head.innerHTML, /do-not-publish|#private/);
});

test('dynamic public pages clear stale tags while waiting for their own visibility decision', async () => {
  bootstrap(metadata('/about'));
  await mount('/about');
  await act(async () => navigate('/contests/contest-a?access_token=secret'));
  assert.equal(canonical(), undefined);
  assert.equal(
    meta('robots'),
    undefined,
    'no temporary noindex on a potentially public page',
  );
  assert.equal(document.querySelector('meta[property="og:url"]'), null);
  assert.equal(document.getElementById('zoj-structured-data'), null);
  assert.equal(requests[0].url, '/public/seo?path=%2Fcontests%2Fcontest-a');
  await settle(
    requests[0],
    metadata('/contests/contest-a', {
      robots: 'noindex, nofollow',
      structured_data: [],
    }),
  );
  assert.equal(meta('robots'), 'noindex, nofollow');
  assert.equal(canonical(), 'https://zoj.kr/contests/contest-a');
  assert.doesNotMatch(document.head.innerHTML, /secret|access_token/);
});

test('private and unknown routes become noindex immediately and never retain public details', async () => {
  bootstrap(metadata('/notices/one'));
  await mount('/notices/one');
  await act(async () =>
    navigate('/operator/contests/private/settings?token=secret'),
  );
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(document.title, '대회 설정 | ZOJ');
  assert.equal(
    meta('description'),
    '로그인과 접근 권한이 필요한 ZOJ 페이지입니다.',
  );
  assert.equal(requests.length, 0);
  assert.equal(canonical(), undefined);
  assert.equal(document.getElementById('zoj-structured-data'), null);
  assert.doesNotMatch(document.head.innerHTML, /private|secret|제목 \/notices/);
  await act(async () => navigate('/a-page-that-does-not-exist'));
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(document.title, '페이지를 찾을 수 없습니다 | ZOJ');
  assert.equal(
    meta('description'),
    '요청한 페이지가 없거나 공개되지 않았습니다.',
  );
  await act(async () => navigate('/admin/contests'));
  assert.equal(document.title, '대회 관리 | ZOJ');
  assert.equal(meta('robots'), 'noindex,nofollow');
  await act(async () =>
    navigate('/operator/contests/private/guide?section=settings'),
  );
  assert.equal(document.title, '운영 가이드 | ZOJ');
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(canonical(), undefined);
  assert.equal(requests.length, 0);
});

test('a late public response cannot overwrite metadata after navigating to a private page', async () => {
  await mount('/notices/one');
  await act(async () => navigate('/login?moveTo=secret'));
  await settle(requests[0], metadata('/notices/one'));
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(document.title, '로그인 | ZOJ');
  assert.equal(canonical(), undefined);
  assert.equal(document.getElementById('zoj-structured-data'), null);
});

test('contest workspace URLs remain noindex regardless of whether an account can access them', async () => {
  await mount('/contests/example/problems');
  for (const [section, title] of [
    ['problems', '문제집'],
    ['problems/problem-a', '문제 보기'],
    ['problems/problem-a/statement', '문제 보기'],
    ['scoreboard', '스코어보드'],
    ['submissions', '채점현황'],
    ['board', '대회 게시판'],
  ]) {
    await act(async () => navigate(`/contests/example/${section}`));
    assert.equal(meta('robots'), 'noindex,nofollow');
    assert.equal(document.title, `${title} | ZOJ`);
    assert.equal(document.getElementById('zoj-structured-data'), null);
  }
  assert.equal(requests.length, 0);
});

test('an unavailable dynamic page metadata request cannot leave an indexable stale description', async () => {
  await mount('/contests/missing');
  await act(async () => {
    requests[0].reject(new Error('unavailable'));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.equal(requests.length, 2);
  await act(async () => {
    requests[1].reject(new Error('unavailable'));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(canonical(), undefined);
  assert.equal(document.getElementById('zoj-structured-data'), null);
});

test('legacy public query links resolve to clean permalinks without unrelated search parameters', async () => {
  assert.equal(
    resolveSeoPath('/notices/', '?noticeId=n1&token=secret'),
    '/notices/n1',
  );
  assert.equal(
    resolveSeoPath('/support', '?tab=privacy&email=secret'),
    '/support/privacy',
  );
  assert.equal(
    resolveSeoPath('/support', '?tab=invalid&token=secret'),
    '/support',
  );
  assert.equal(resolveSeoPath('/login', '?noticeId=n1'), '/login');
  bootstrap(metadata('/notices/n1'));
  await mount('/notices?noticeId=n1&token=secret');
  assert.equal(requests.length, 0);
  assert.equal(canonical(), 'https://zoj.kr/notices/n1');
  assert.doesNotMatch(document.head.innerHTML, /secret|noticeId=/);
});

test('presentation keeps its contest-specific tab title while remaining private', async () => {
  document.title = '테스트 대회 · 프레젠테이션 스코어보드 | ZOJ';
  await mount('/operator/contests/a/scoreboard/presentation');
  assert.equal(document.title, '테스트 대회 · 프레젠테이션 스코어보드 | ZOJ');
  assert.equal(meta('robots'), 'noindex,nofollow');
  assert.equal(requests.length, 0);
});

test('foreign or sensitive canonical values never become share URLs', async () => {
  bootstrap(
    metadata('/about', {
      canonical: 'https://zoj.kr/about?token=secret#private',
    }),
  );
  await mount('/about');
  assert.equal(canonical(), 'https://zoj.kr/about');
  await act(async () => navigate('/notices/one'));
  await settle(
    requests[0],
    metadata('/notices/one', { canonical: 'https://unrelated.test/one' }),
  );
  assert.equal(canonical(), undefined);
  assert.equal(document.querySelector('meta[property="og:url"]'), null);
});
