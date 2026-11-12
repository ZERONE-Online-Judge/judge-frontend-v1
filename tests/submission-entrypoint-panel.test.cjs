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
const warningJava =
  'public class Different { public static void main(String[] args) {} }';
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

test('valid Java keeps filename guidance and submits exact bytes without a modal', async () => {
  const code = validJava.replaceAll(' ', ' \r\n');
  await render({ sourceCode: code });
  assert.match(host.textContent, /Main\.java/);
  assert.match(host.textContent, /Main 클래스/);
  assert.match(host.textContent, /필요한 경우에만/);
  await click('제출하기');
  assert.equal(document.querySelector('dialog'), null);
  assert.deepEqual(submissions, [
    {
      language: 'java8',
      sourceCode: code,
      context: props.submissionContextKey,
    },
  ]);
});

test('valid Kotlin including a packaged object main submits directly with JAR guidance', async () => {
  for (const code of [
    validKotlin,
    'package example\nobject Solution { @JvmStatic fun main(args: Array<String>) {} }',
  ]) {
    await render({ language: 'kotlin', sourceCode: code });
    assert.match(host.textContent, /Main\.kt/);
    assert.match(host.textContent, /JAR/);
    await click('제출하기');
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(submissions.at(-1).sourceCode, code);
  }
  assert.equal(submissions.length, 2);
});

test('Kotlin warnings can be cancelled without submitting', async () => {
  await render({
    language: 'kotlin',
    sourceCode: 'class Main { fun main() {} }',
  });
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
    /Main.java와 클래스 이름/,
  );
  assert.match(document.querySelector('dialog').textContent, /그대로 제출/);
  assert.equal(submissions.length, 0);
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.querySelectorAll('li').length, 1);
  assert.doesNotMatch(
    dialog.textContent,
    /실행 방식|기본 실행 형식을 확인|확인이 필요한 항목/,
  );
  assert.match(dialog.textContent, /소스 형식만 확인/);
  await click('그대로 제출');
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
  await render({ sourceCode: warningJava });
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
  ['source', { sourceCode: warningJava + '\n// changed' }],
  ['language', { language: 'kotlin', sourceCode: validKotlin }],
  ['problem', { submissionContextKey: 'contest:problem-b:participant' }],
  ['mode', { submissionContextKey: 'contest:problem-a:preview' }],
  ['allowed languages', { allowedLanguages: ['java8'] }],
  ['permission', { canSubmit: false }],
  ['pending', { isSubmitting: true }],
])
  test(`${name} changes permanently discard a checked snapshot`, async () => {
    await render({ sourceCode: warningJava });
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
  await render({ sourceCode: warningJava });
  await click('제출하기');
  const confirm = button('그대로 제출');
  await act(() => {
    confirm.click();
    confirm.click();
  });
  assert.equal(submissions.length, 1);
  assert.equal(document.querySelector('dialog'), null);
});

test('valid JVM direct submissions prevent same-batch duplicates but allow an immediate explicit retry', async () => {
  await render();
  const submit = button('제출하기');
  await act(() => {
    submit.click();
    submit.click();
  });
  assert.equal(submissions.length, 1);
  assert.equal(document.querySelector('dialog'), null);
  await click('제출하기');
  assert.equal(
    submissions.length,
    2,
    'A completed failure must not impose an artificial retry delay',
  );
});
