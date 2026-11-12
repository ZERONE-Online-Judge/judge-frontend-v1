const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr/contests/synthetic/problems/a',
  pretendToBeVisual: true,
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
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
const nativeFetch = global.fetch;
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('?raw')) {
      const relativeAsset = id.replace(/^@\//, '').replace(/\?raw$/, '');
      return fs.readFileSync(
        path.resolve(__dirname, '../src', relativeAsset),
        'utf8',
      );
    }
    if (id === '@/shared/ui/CodeEditor')
      return {
        __esModule: true,
        default: ({ value, onChange, disabled }) =>
          h('textarea', {
            value,
            disabled,
            onChange: (event) => onChange(event.target.value),
            'aria-label': '제출 코드',
          }),
      };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find((file) => fs.existsSync(file));
      assert.ok(target, `Cannot resolve ${id}`);
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const validJava =
  'public class Main { public static void main(String[] args) { System.out.println(1); } }';
const validKotlin = 'fun main() { println(1) }';
let root, host, props, submissions, requests, sourceChanges, languageChanges;
async function render(next = {}) {
  props = { ...props, ...next };
  const Panel = source(
    'components/contest/problem/ProblemSubmitPanel.tsx',
  ).default;
  await act(() => root.render(h(Panel, props)));
}
function button(text) {
  return [...document.querySelectorAll('button')].find(
    (item) =>
      item.textContent.trim() === text ||
      item.getAttribute('aria-label') === text,
  );
}
async function click(text) {
  const target = button(text);
  assert.ok(target, `Missing button: ${text}`);
  await act(() => target.click());
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  submissions = [];
  requests = [];
  sourceChanges = [];
  languageChanges = [];
  global.fetch = (...args) => {
    requests.push(args);
    throw new Error('The pre-submit check must never call APIs');
  };
  props = {
    language: 'java8',
    sourceCode: validJava,
    submissionContextKey: 'contest:problem-a:participant',
    problemCode: 'A',
    problemTitle: '가상 문제',
    isSubmitting: false,
    message: '',
    messageStatus: 'idle',
    canSubmit: true,
    onLanguageChange: (language) => languageChanges.push(language),
    onSourceCodeChange: (code) => sourceChanges.push(code),
    onSubmit: () =>
      submissions.push({
        language: props.language,
        sourceCode: props.sourceCode,
        context: props.submissionContextKey,
      }),
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  assert.deepEqual(requests, []);
  assert.deepEqual(
    sourceChanges,
    [],
    'The guard must not rewrite submitted code',
  );
  assert.deepEqual(languageChanges, []);
});
after(() => {
  global.fetch = nativeFetch;
  dom.window.close();
});

test('Java filename guidance is inline; passing inspection still requires explicit confirmation', async () => {
  await render();
  assert.match(host.textContent, /Main\.java/);
  assert.match(host.textContent, /Main 클래스/);
  assert.equal(document.querySelector('dialog'), null);
  await click('제출하기');
  assert.equal(submissions.length, 0);
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent, /Java 제출 전 확인/);
  assert.match(dialog.textContent, /기본 실행 형식을 확인/);
  assert.match(dialog.textContent, /정적 검사/);
  assert.match(dialog.textContent, /보장하지 않습니다/);
  await click('확인하고 제출');
  assert.deepEqual(submissions, [
    {
      language: 'java8',
      sourceCode: validJava,
      context: props.submissionContextKey,
    },
  ]);
  assert.equal(document.querySelector('dialog'), null);
});

test('Kotlin uses its own filename and jar guidance and can cancel without submitting', async () => {
  await render({ language: 'kotlin', sourceCode: validKotlin });
  assert.match(host.textContent, /Main\.kt/);
  assert.match(host.textContent, /JAR/);
  await click('제출하기');
  assert.match(
    document.querySelector('dialog').textContent,
    /Kotlin 제출 전 확인/,
  );
  assert.equal(submissions.length, 0);
  await click('코드 수정');
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(submissions.length, 0);
});

test('warning findings allow an explicit override and preserve the exact source bytes', async () => {
  const code =
    'public class Different {\r\n  public static void main(String[] args) {}\r\n}\r\n';
  await render({ sourceCode: code });
  await click('제출하기');
  assert.match(
    document.querySelector('dialog').textContent,
    /확인이 필요한 항목/,
  );
  assert.match(
    document.querySelector('dialog').textContent,
    /주의사항 확인 후 제출/,
  );
  assert.equal(submissions.length, 0);
  await click('주의사항 확인 후 제출');
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].sourceCode, code);
});

test('C++ submits directly and never shows JVM filename or confirmation', async () => {
  const code = '#include <iostream>\nint main() { return 0; }';
  await render({ language: 'cpp17', sourceCode: code });
  await click('제출하기');
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].sourceCode, code);
  assert.doesNotMatch(host.textContent, /Main\.java|Main\.kt/);
});

test('cancel with Escape restores the submit control without creating a request', async () => {
  await render();
  button('제출하기').focus();
  await click('제출하기');
  await act(() =>
    document
      .querySelector('dialog')
      .dispatchEvent(new window.Event('cancel', { cancelable: true })),
  );
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(submissions.length, 0);
  assert.equal(document.activeElement, button('제출하기'));
});

for (const [name, change] of [
  ['source', { sourceCode: validJava + '\n// changed' }],
  ['language', { language: 'kotlin', sourceCode: validKotlin }],
  ['problem', { submissionContextKey: 'contest:problem-b:participant' }],
  ['mode', { submissionContextKey: 'contest:problem-a:preview' }],
  ['allowed languages', { allowedLanguages: ['java8'] }],
  ['permission', { canSubmit: false }],
  ['pending', { isSubmitting: true }],
])
  test(`${name} changes permanently discard a checked snapshot`, async () => {
    await render();
    const original = { ...props };
    await click('제출하기');
    assert.ok(document.querySelector('dialog'));
    await render(change);
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(submissions.length, 0);
    await render(original);
    assert.equal(
      document.querySelector('dialog'),
      null,
      'Restoring old values must not revive old confirmation',
    );
    await click('제출하기');
    assert.ok(document.querySelector('dialog'));
    assert.equal(submissions.length, 0);
  });

test('blank code, pending state, denied permission and disallowed languages cannot submit or open confirmation', async () => {
  for (const patch of [
    { sourceCode: ' \n ' },
    { isSubmitting: true },
    { canSubmit: false },
    { allowedLanguages: ['cpp17'] },
  ]) {
    await render({
      sourceCode: validJava,
      isSubmitting: false,
      canSubmit: true,
      allowedLanguages: undefined,
      ...patch,
    });
    assert.equal(
      button('제출하기')?.disabled ?? button('제출 중')?.disabled,
      true,
    );
    const target = button('제출하기') || button('제출 중');
    await act(() => target.click());
    assert.equal(submissions.length, 0);
    assert.equal(document.querySelector('dialog'), null);
  }
});

test('double confirmation clicks can create only one submission', async () => {
  await render();
  await click('제출하기');
  const confirm = button('확인하고 제출');
  await act(() => {
    confirm.click();
    confirm.click();
  });
  assert.equal(submissions.length, 1);
  assert.equal(document.querySelector('dialog'), null);
});
