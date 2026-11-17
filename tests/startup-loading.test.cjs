const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM, VirtualConsole } = require('jsdom');
const React = require('react');

const template = fs.readFileSync(
  path.resolve(__dirname, '../index.html'),
  'utf8',
);
const emptyRoot = /<div\s+id=['"]root['"]\s*>\s*<\/div>/;
const publicSummary =
  '<main id="zoj-public-summary" style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;line-height:1.7"><h1>ZOJ 소개</h1><p>프로그래밍 대회 운영 플랫폼입니다.</p><nav><a href="/">홈</a><a href="/about">ZOJ 소개</a></nav></main>';
const opened = [];

function boot({ javascript = true } = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const errors = [];
  const earlyState = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(
    template.replace(emptyRoot, `<div id="root">${publicSummary}</div>`),
    {
      url: 'https://zoj.kr/about',
      runScripts: javascript ? 'dangerously' : undefined,
      virtualConsole,
      beforeParse(window) {
        window.setTimeout = (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, at: now + Number(delay) });
          earlyState.push({
            body: window.document.body,
            starting:
              window.document.documentElement.classList.contains(
                'zoj-starting',
              ),
          });
          return id;
        };
        window.clearTimeout = (id) => timers.delete(id);
      },
    },
  );
  opened.push(dom);
  const { window } = dom;
  const { document } = window;
  return {
    window,
    document,
    errors,
    earlyState,
    timers,
    message: () => document.getElementById('zoj-startup-message')?.textContent,
    retry: () => document.getElementById('zoj-startup-retry'),
    moduleError() {
      document
        .querySelector('script[type="module"][src]')
        .dispatchEvent(new window.Event('error'));
    },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const entry = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = target;
    },
  };
}

afterEach(() => {
  for (const dom of opened.splice(0)) dom.window.close();
});

test('the template keeps the backend empty-root and metadata contract', () => {
  assert.match(template, emptyRoot);
  const page = boot({ javascript: false });
  assert.equal(page.document.querySelectorAll('#root').length, 1);
  assert.equal(page.document.querySelector('#root').children.length, 1);
  assert.equal(
    page.document.querySelector('#root > #zoj-public-summary').tagName,
    'MAIN',
  );
  assert.equal(
    page.document.querySelector('#zoj-startup').parentElement,
    page.document.body,
    'the loading notice must survive React replacing the SEO root contents',
  );
  const earlyScript = [...page.document.head.querySelectorAll('script')].find(
    (script) => script.textContent.includes('zoj-starting'),
  );
  assert.ok(earlyScript, 'startup code must run from the HTML head');
  assert.equal(earlyScript.type, '', 'startup must not wait for a module');
  assert.ok(page.document.head.querySelector('#zoj-startup-style'));
  assert.equal(
    page.document.querySelector('meta[name="robots"]').content,
    'index,follow',
  );
  assert.equal(
    page.document.querySelector('meta[property="og:title"]').content,
    '홈 | ZOJ',
  );
  assert.ok(
    page.document.querySelector('meta[name="naver-site-verification"]'),
  );
  assert.ok(page.document.querySelector('script[type="module"][src]'));
});

test('without JavaScript the public summary and navigation stay visible', () => {
  const page = boot({ javascript: false });
  assert.equal(
    page.document.documentElement.classList.contains('zoj-starting'),
    false,
  );
  assert.equal(
    page.window.getComputedStyle(
      page.document.getElementById('zoj-public-summary'),
    ).display,
    'block',
  );
  assert.equal(
    page.window.getComputedStyle(page.document.getElementById('zoj-startup'))
      .display,
    'none',
  );
  assert.deepEqual(
    [...page.document.querySelectorAll('#zoj-public-summary nav a')].map(
      (link) => link.getAttribute('href'),
    ),
    ['/', '/about'],
  );
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.errors, []);
});

test('the head guard hides the fallback before body parsing and shows loading status', () => {
  const page = boot();
  assert.deepEqual(page.earlyState, [{ body: null, starting: true }]);
  assert.equal(
    page.window.getComputedStyle(
      page.document.getElementById('zoj-public-summary'),
    ).display,
    'none',
  );
  assert.equal(
    page.window.getComputedStyle(page.document.getElementById('zoj-startup'))
      .display,
    'block',
  );
  assert.equal(page.message(), '페이지를 불러오는 중입니다.');
  assert.equal(page.retry().hidden, true);
  assert.equal(
    page.document.getElementById('zoj-startup-notice').getAttribute('role'),
    'status',
  );
  assert.equal(
    page.document
      .getElementById('zoj-startup-notice')
      .getAttribute('aria-live'),
    'polite',
  );
  assert.deepEqual(page.errors, []);
});

test('a slow startup offers a retry after 15 seconds without exposing SEO text', () => {
  const page = boot();
  page.advance(14999);
  assert.equal(page.message(), '페이지를 불러오는 중입니다.');
  assert.equal(page.retry().hidden, true);
  page.advance(1);
  assert.equal(page.message(), '페이지를 불러오는 데 시간이 걸리고 있습니다.');
  assert.equal(page.retry().hidden, false);
  assert.equal(
    page.document.documentElement.classList.contains('zoj-starting'),
    true,
  );
  assert.deepEqual(page.errors, []);
});

test('an application module load failure immediately offers retry and cancels the slow hint', () => {
  const page = boot();
  page.moduleError();
  assert.equal(
    page.message(),
    '페이지를 불러오지 못했습니다. 다시 시도해 주세요.',
  );
  assert.equal(page.retry().hidden, false);
  assert.equal(page.timers.size, 0);
  page.advance(30000);
  assert.equal(
    page.message(),
    '페이지를 불러오지 못했습니다. 다시 시도해 주세요.',
  );
  assert.deepEqual(page.errors, []);
});

test('extension runtime errors and unrelated resources do not fail app startup', () => {
  const page = boot();
  for (const filename of [
    'chrome-extension://extension/content_script.js',
    'https://zoj.kr/installHook.js',
  ]) {
    page.window.dispatchEvent(
      new page.window.ErrorEvent('error', {
        message: 'Cannot read properties of null',
        filename,
      }),
    );
  }
  for (const tag of ['img', 'link', 'script']) {
    const resource = page.document.createElement(tag);
    page.document.head.append(resource);
    resource.dispatchEvent(new page.window.Event('error'));
  }
  assert.equal(page.message(), '페이지를 불러오는 중입니다.');
  assert.equal(page.retry().hidden, true);
  assert.equal(page.timers.size, 1);
  page.advance(15000);
  assert.equal(page.message(), '페이지를 불러오는 데 시간이 걸리고 있습니다.');
  assert.deepEqual(page.errors, []);
});

test('retry delegates button clicks to an actual page reload', () => {
  const page = boot();
  page.advance(15000);
  page.document.querySelector('#zoj-startup-message').click();
  assert.deepEqual(page.errors, []);
  const label = page.document.createElement('span');
  label.textContent = '새로고침';
  page.retry().replaceChildren(label);
  label.click();
  assert.equal(page.errors.length, 1);
  assert.match(page.errors[0].message, /Not implemented: navigation/);
});

test('app ready clears the notice, timer and retry/error listeners', () => {
  const page = boot();
  page.document.dispatchEvent(new page.window.Event('zoj:app-ready'));
  assert.equal(page.document.getElementById('zoj-startup'), null);
  assert.equal(
    page.document.documentElement.classList.contains('zoj-starting'),
    false,
  );
  assert.equal(page.timers.size, 0);
  page.document.body.insertAdjacentHTML(
    'beforeend',
    '<section id="zoj-startup"><span id="zoj-startup-message">정리된 알림</span><button id="zoj-startup-retry" hidden>새로고침</button></section>',
  );
  page.moduleError();
  page.advance(30000);
  page.retry().click();
  assert.equal(page.message(), '정리된 알림');
  assert.equal(page.retry().hidden, true);
  assert.deepEqual(page.errors, []);
});

function appWithStubbedChildren() {
  const filename = path.resolve(__dirname, '../src/App.tsx');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  const children = ({ children }) => children;
  loaded.require = (id) => {
    if (id === 'react-router-dom') return { BrowserRouter: children };
    if (
      id === '@/app/providers/AppProviders' ||
      id === '@/components/layout/Layout'
    ) {
      return { __esModule: true, default: children };
    }
    if (id === '@/routes/AppRoutes') {
      return {
        __esModule: true,
        default: () => React.createElement('h1', null, '앱 화면'),
      };
    }
    if (
      id === '@/app/providers/SessionExpiryRedirector' ||
      id === '@/app/providers/FrontendUpdateNotice' ||
      id === '@/components/operator/ChangeNoticeDialog'
    ) {
      return { __esModule: true, default: () => null };
    }
    return native(id);
  };
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
  return loaded.exports.default;
}

test('the real App dismisses loading only after its first React commit, including StrictMode', async () => {
  const page = boot();
  const globals = ['window', 'document', 'Event', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(
    globals.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(global, name),
    ]),
  );
  global.window = page.window;
  global.document = page.document;
  global.Event = page.window.Event;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(page.document.getElementById('root'));
  const frames = [];
  page.document.addEventListener('zoj:app-ready', () => {
    frames.push(page.document.getElementById('root').textContent);
  });
  try {
    const App = appWithStubbedChildren();
    await React.act(async () => {
      root.render(
        React.createElement(React.StrictMode, null, React.createElement(App)),
      );
      assert.ok(page.document.getElementById('zoj-startup'));
      assert.ok(page.document.getElementById('zoj-public-summary'));
    });
    assert.ok(frames.length >= 1);
    assert.ok(frames.every((text) => text === '앱 화면'));
    assert.equal(page.document.getElementById('zoj-public-summary'), null);
    assert.equal(page.document.getElementById('zoj-startup'), null);
    assert.equal(
      page.document.documentElement.classList.contains('zoj-starting'),
      false,
    );
    assert.equal(page.timers.size, 0);
    page.advance(30000);
    assert.deepEqual(page.errors, []);
  } finally {
    await React.act(async () => root.unmount());
    for (const name of globals) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(global, name, descriptor);
      else delete global[name];
    }
  }
});
