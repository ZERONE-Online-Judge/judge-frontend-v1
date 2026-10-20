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
const { MemoryRouter, useLocation } = require('react-router-dom');
const h = React.createElement;
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
const { default: Sidebar, ProblemMenuButton } = source(
  'components/contest/problem/ProblemSidebar.tsx',
);
const ViewTabs = source(
  'components/contest/problem/ProblemNavigationPills.tsx',
).default;
const problems = [
  { problem_id: 'a', problem_code: 'A', title: '두 수의 합' },
  {
    problem_id: 'b',
    problem_code: 'B',
    title: '긴 제목도 빠짐없이 표시하는 문제',
  },
];
let root, host, location;
function Observer() {
  location = useLocation();
  return null;
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  document.body.style.overflow = 'auto';
});
afterEach(async () => {
  await act(async () => root.unmount());
});
after(() => dom.window.close());
function Widget({ props }) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef(null);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  return h(
    React.Fragment,
    null,
    h(ProblemMenuButton, {
      open,
      panelId: 'problem-list',
      buttonRef,
      onToggle: () => setOpen((value) => !value),
    }),
    h(
      'section',
      { className: 'zoj-problem-layout' },
      h(Sidebar, {
        contestId: 'c',
        problems,
        activeProblemId: 'a',
        open,
        panelId: 'problem-list',
        onClose: close,
        ...props,
      }),
    ),
  );
}
async function render(props = {}, tabs = {}) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: ['/contests/c/problems/a'] },
        h(Observer),
        h(Widget, { props }),
        h(ViewTabs, {
          contestId: 'c',
          problemId: 'a',
          active: 'combined',
          ...tabs,
        }),
      ),
    ),
  );
}
async function click(el) {
  assert.ok(el);
  await act(async () => el.click());
}
function trigger() {
  return host.querySelector('button[aria-label="문제 목록 열기"]');
}

test('problem list stays within its workspace without a page modal and restores focus on Escape', async () => {
  await render();
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(host.querySelector('aside').hasAttribute('inert'), true);
  assert.equal(trigger().getAttribute('aria-expanded'), 'false');
  trigger().focus();
  await click(trigger());
  const panel = document.querySelector('aside[aria-label="빠른 문제 전환"]');
  assert.equal(document.querySelector('dialog'), null);
  assert.ok(host.querySelector('.zoj-problem-layout').contains(panel));
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(
    panel.querySelector('a[aria-current="page"]').textContent,
    'A두 수의 합',
  );
  assert.equal(panel.querySelectorAll('nav a').length, 2);
  await act(async () =>
    panel.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    document.querySelector('aside').getAttribute('aria-hidden'),
    'true',
  );
  assert.equal(document.querySelector('aside').hasAttribute('inert'), true);
  assert.equal(document.activeElement, trigger());
  assert.equal(document.body.style.overflow, 'auto');
});

for (const [targetView, suffix] of [
  ['combined', ''],
  ['problem', '/statement'],
  ['submit', '/submit'],
  ['editorial', '/editorial'],
]) {
  test(`problem switching keeps ${targetView} mode and division while removing a different problem's submission`, async () => {
    await render({
      targetView,
      search: '?divisionId=general&submissionId=old&preview=1',
    });
    await click(trigger());
    const links = document.querySelectorAll('aside nav a');
    assert.match(links[0].getAttribute('href'), /submissionId=old/);
    assert.equal(
      links[1].getAttribute('href'),
      `/contests/c/problems/b${suffix}?divisionId=general&preview=1`,
    );
    await click(links[1]);
    assert.equal(location.pathname, `/contests/c/problems/b${suffix}`);
    assert.equal(document.querySelector('dialog'), null);
  });
}

test('division selection and the close button remain available in the drawer', async () => {
  let selected;
  await render({
    divisions: [
      { division_id: 'one', name: '일반부' },
      { division_id: 'two', name: '고등부' },
    ],
    selectedDivisionId: 'one',
    onDivisionChange: (value) => (selected = value),
  });
  await click(trigger());
  const select = document.querySelector('aside select');
  await act(async () => {
    select.value = 'two';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.equal(selected, 'two');
  await click(document.querySelector('button[aria-label="문제 목록 닫기"]'));
  assert.equal(document.querySelector('dialog'), null);
});

test('view switch preserves permissions and highlights exactly one current view', async () => {
  await render(
    {},
    { active: 'submit', allowEditorial: true, search: '?divisionId=general' },
  );
  let nav = host.querySelector('nav[aria-label="문제 상세 메뉴"]');
  assert.equal(nav.querySelectorAll('a').length, 4);
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
  assert.equal(nav.querySelector('[aria-current="page"]').textContent, '제출');
  assert.match(
    nav.querySelector('[aria-current="page"]').getAttribute('href'),
    /\/submit\?divisionId=general$/,
  );
  await render(
    {},
    { active: 'problem', allowSubmit: false, allowEditorial: false },
  );
  nav = host.querySelector('nav[aria-label="문제 상세 메뉴"]');
  assert.equal(nav.querySelectorAll('a').length, 1);
  assert.equal(nav.textContent, '문제');
});
