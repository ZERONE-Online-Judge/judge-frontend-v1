const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { File } = require('node:buffer');
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
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;
const mocks = {
  '@/shared/ui/CodeEditor': {
    __esModule: true,
    default: () => h('div', null, '코드'),
  },
  '@/shared/ui/MarkdownPreview': {
    __esModule: true,
    default: ({ statement }) => h('p', { 'data-markdown': true }, statement),
  },
  '@/components/contest/problem/ProblemMetaPills': {
    __esModule: true,
    default: () => h('span', null, '1000ms · 128MiB'),
  },
  '@/utils/Icons': { SvgIcon: () => null },
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
    if (id.endsWith('.css')) return {};
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const next = id.startsWith('@/')
      ? id.slice(2)
      : path.relative(
          path.resolve(__dirname, '../src'),
          path.resolve(path.dirname(filename), id),
        );
    return source(
      ['.ts', '.tsx']
        .map((ext) => next + ext)
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
const { serializeProblemDocument, parseProblemDocument } = source(
  'domains/problemManagement/document.ts',
);
const { promoteStatementLanguage, statementVersions, hasProblemEditorial } =
  source('domains/problemManagement/statementLanguages.ts');
const Statement = source(
  'components/contest/problem/ProblemStatementPanel.tsx',
).default;
const Editorial = source(
  'components/contest/problem/ProblemEditorialPanel.tsx',
).default;
const LanguageEditor = source(
  'components/operator/ProblemLanguageEditor.tsx',
).default;
const encoded = (
  body,
  prefix,
  examples = [{ input: '1 2\n', output: '3\n', note: prefix + ' sample' }],
) =>
  serializeProblemDocument({
    statement: body,
    inputDescription: prefix + ' input',
    outputDescription: prefix + ' output',
    note: prefix + ' note',
    examples,
  });
function problem() {
  return {
    problem_id: 'p',
    problem_code: 'A',
    title: '한국어 제목',
    statement: encoded('한국어 본문', '한국어'),
    editorial: '한국어 비공개 해설',
    time_limit_ms: 1000,
    memory_limit_mb: 128,
    default_statement_language: 'ko',
    statement_translations: {
      en: {
        title: 'English title',
        statement: encoded('English $a+b$', 'English'),
      },
      ja: { title: 'draft', statement: encoded('', 'draft', []) },
    },
    editorial_translations: { en: 'Private English editorial' },
  };
}
let root, container;
beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
after(() => dom.window.close());
async function render(node) {
  await act(() => root.render(node));
}
async function select(element, value) {
  await act(() => {
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function click(text) {
  const element = [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text,
  );
  assert.ok(element, text);
  await act(() => element.click());
}
async function enter(label, value) {
  const labelElement = [...container.querySelectorAll('label')].find(
    (el) => el.firstChild.textContent === label,
  );
  const element =
    labelElement?.querySelector('textarea') ||
    (labelElement?.htmlFor
      ? document.getElementById(labelElement.htmlFor)
      : null);
  assert.ok(element, label);
  await act(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

test('participant language switch changes title, body, input/output, notes and examples, with shared preference', async () => {
  const p = problem();
  await render(
    h(
      React.Fragment,
      null,
      h(Statement, { problem: p }),
      h(Editorial, { problem: p }),
    ),
  );
  assert.match(container.textContent, /한국어 본문/);
  const selects = container.querySelectorAll('[aria-label="지문 언어"]');
  assert.equal(selects.length, 2);
  assert.equal(
    selects[0].options.length,
    2,
    'metadata-only drafts must not be visible',
  );
  await select(selects[0], 'en');
  for (const text of [
    'English title',
    'English $a+b$',
    'English input',
    'English output',
    'English note',
    'English sample',
    'Private English editorial',
  ])
    assert.ok(container.textContent.includes(text), text);
  assert.equal(container.querySelector('article').lang, 'en');
  assert.equal(selects[1].value, 'en');
  assert.equal(
    window.localStorage.getItem('zoj.problem-statement-language'),
    'en',
  );
  assert.doesNotMatch(container.textContent, /한국어 본문|한국어 비공개 해설/);
});

test('preference falls back to default on a problem without that translation', async () => {
  window.localStorage.setItem('zoj.problem-statement-language', 'en');
  await render(h(Statement, { problem: problem() }));
  assert.match(container.textContent, /English title/);
  const p = { ...problem(), statement_translations: {} };
  await render(h(Statement, { problem: p }));
  assert.match(container.textContent, /한국어 제목/);
  assert.equal(container.querySelector('[aria-label="지문 언어"]'), null);
  assert.equal(
    window.localStorage.getItem('zoj.problem-statement-language'),
    'en',
  );
});

test('translation with no examples uses the original input and output', async () => {
  window.localStorage.setItem('zoj.problem-statement-language', 'en');
  const p = problem();
  p.statement_translations.en.statement = encoded(
    'English body',
    'English',
    [],
  );
  await render(h(Statement, { problem: p }));
  assert.match(container.textContent, /한국어 sample/);
  assert.equal(container.querySelector('pre').textContent, '1 2\n');
});

test('language selection remains available when localStorage is blocked', async () => {
  const native = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => {
    throw new Error('storage denied');
  };
  try {
    await render(h(Statement, { problem: problem() }));
    await select(container.querySelector('[aria-label="지문 언어"]'), 'en');
    assert.match(container.textContent, /English title/);
  } finally {
    window.Storage.prototype.setItem = native;
  }
});

test('default language promotion retains both statement documents and editorials', () => {
  const p = problem();
  const next = promoteStatementLanguage(p, 'en');
  assert.equal(next.statement, p.statement_translations.en.statement);
  assert.equal(next.title, 'English title');
  assert.equal(next.editorial, p.editorial_translations.en);
  assert.equal(next.statement_translations.ko.statement, p.statement);
  assert.equal(next.editorial_translations.ko, p.editorial);
  assert.equal(next.statement_translations.en, undefined);
  assert.deepEqual(promoteStatementLanguage(next, 'ko'), p);
  assert.equal(statementVersions(p).ja, undefined);
  assert.equal(
    hasProblemEditorial({ ...p, editorial: '', editorial_translations: {} }),
    false,
  );
  assert.equal(hasProblemEditorial({ ...p, editorial: '' }), true);
});

test('operator can add and edit translated examples without losing an empty new row', async () => {
  let current = {
    ...problem(),
    statement_translations: {},
    editorial_translations: {},
  };
  function Form() {
    const [p, setP] = React.useState(current);
    return h(LanguageEditor, {
      problem: p,
      onChange: (next) => {
        current = next;
        setP(next);
      },
    });
  }
  await render(h(Form));
  const addSelect = [...container.querySelectorAll('select')].find((el) =>
    el.closest('label').textContent.startsWith('추가할 지문 언어'),
  );
  await select(addSelect, 'en');
  await click('번역 추가');
  await enter('번역 본문', 'English body');
  await click('번역 예제 추가');
  assert.match(container.textContent, /예제 1/);
  await enter('번역 예제 입력', '5 6\n');
  await enter('번역 예제 출력', '11\n');
  assert.deepEqual(
    parseProblemDocument(current.statement_translations.en.statement)
      .examples[0],
    { input: '5 6\n', output: '11\n', note: '' },
  );
  assert.equal(current.statement, problem().statement);
  await enter('번역 해설', 'English private');
  await click('이 번역 삭제');
  assert.deepEqual(current.statement_translations, {});
  assert.deepEqual(current.editorial_translations, {});
});

test('submission language choices follow each problem policy', async () => {
  const SubmitPanel = source(
    'components/contest/problem/ProblemSubmitPanel.tsx',
  ).default;
  const languages = source(
    'domains/submissionScoreboard/languagePreference.ts',
  );
  assert.ok(languages.isJudgeLanguage('pypy3'));
  assert.ok(languages.isJudgeLanguage('kotlin'));
  let chosen;
  await render(
    h(SubmitPanel, {
      allowedLanguages: ['pypy3', 'kotlin'],
      language: 'pypy3',
      sourceCode: '',
      isSubmitting: false,
      message: '',
      messageStatus: 'idle',
      onLanguageChange: (value) => {
        chosen = value;
      },
      onSourceCodeChange: () => {},
      onSubmit: () => {},
    }),
  );
  const picker = container.querySelector('select');
  assert.deepEqual(
    [...picker.options].map((option) => option.value),
    ['pypy3', 'kotlin'],
  );
  assert.equal(picker.value, 'pypy3');
  await select(picker, 'kotlin');
  assert.equal(chosen, 'kotlin');
});

test('translated statement images use cursor insertion and keep editorial assets private', async () => {
  global.HTMLElement = window.HTMLElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const assets = [
    {
      asset_id: 'diagram',
      original_filename: 'diagram.png',
      mime_type: 'image/png',
      storage_key: 'problems/p/assets/diagram.png',
    },
    {
      asset_id: 'secret',
      original_filename: 'solution-only.png',
      mime_type: 'image/png',
      storage_key: 'problems/p/editorial-assets/solution-only.png',
    },
  ];
  let current = problem();
  current.statement_translations.en.statement = encoded(
    'Before\n\nAfter',
    'English',
  );
  function Form() {
    const [p, setP] = React.useState(current);
    return h(LanguageEditor, {
      problem: p,
      assets,
      onChange(next) {
        current = next;
        setP(next);
      },
    });
  }
  await render(h(Form));
  const textarea = container.querySelector('textarea[aria-label="번역 본문"]');
  await act(() => {
    textarea.focus();
    textarea.setSelectionRange(6, 6);
    document.dispatchEvent(
      new window.Event('selectionchange', { bubbles: true }),
    );
  });
  const open = textarea
    .closest('.statement-image-tools')
    .querySelector('button');
  await act(() => open.click());
  let dialog = document.querySelector('dialog');
  assert.match(dialog.textContent, /diagram.png/);
  assert.doesNotMatch(dialog.textContent, /solution-only/);
  const apply = [...dialog.querySelectorAll('button')].find(
    (el) => el.textContent === '커서 위치에 삽입',
  );
  await act(() => apply.click());
  const body = parseProblemDocument(
    current.statement_translations.en.statement,
  ).statement;
  assert.match(body, /^Before\n\n<img src="asset:\/\/diagram"/);
  assert.match(body, />\n\nAfter$/);
  assert.equal(current.statement, problem().statement);
  assert.equal(
    current.editorial_translations.en,
    problem().editorial_translations.en,
  );
  assert.equal(document.querySelector('dialog'), null);
  const editorial = container.querySelector('textarea[aria-label="번역 해설"]');
  await act(() =>
    editorial.closest('.statement-image-tools').querySelector('button').click(),
  );
  dialog = document.querySelector('dialog');
  assert.match(dialog.textContent, /solution-only.png/);
});

test('image field is locked when bounded source cannot be edited in full', async () => {
  const Field = source('components/operator/StatementFieldEditor.tsx').default;
  await render(
    h(Field, {
      identity: 'p:ko:body',
      label: '문제 본문',
      value: 'x'.repeat(262145),
      onChange() {
        throw new Error('must not edit');
      },
    }),
  );
  assert.equal(container.querySelector('textarea').readOnly, true);
  assert.equal(container.querySelector('.statement-image-toolbar'), null);
});

test('removing an earlier example cancels image insertion into a reused example slot', async () => {
  global.HTMLElement = window.HTMLElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  let current = problem();
  current.statement_translations.en.statement = encoded('Body', 'English', [
    { input: '1', output: '1', note: '' },
    { input: '2', output: '2', note: '' },
  ]);
  let complete;
  function Form() {
    const [p, setP] = React.useState(current);
    return h(LanguageEditor, {
      problem: p,
      onUploadImage: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
      onChange(next) {
        current = next;
        setP(next);
      },
    });
  }
  await render(h(Form));
  const first = container.querySelector(
    'textarea[aria-label="번역 예제 설명"]',
  );
  const file = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    'diagram.png',
    { type: 'image/png' },
  );
  await act(async () => {
    const event = new window.Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [file], getData: () => '' },
    });
    first.dispatchEvent(event);
    await new Promise((resolve) => global.setTimeout(resolve, 0));
  });
  assert.equal(typeof complete, 'function');
  await click('이 예제 삭제');
  await act(async () =>
    complete({ id: 'new', source: 'asset://new', name: 'diagram.png' }),
  );
  const examples = parseProblemDocument(
    current.statement_translations.en.statement,
  ).examples;
  assert.deepEqual(examples, [{ input: '2', output: '2', note: '' }]);
});
