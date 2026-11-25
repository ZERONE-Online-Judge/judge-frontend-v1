const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setTimeout } = require('node:timers');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const cache = new Map();
let inspections, imports, inspectResponder;
const kinds = [
  { expectedStatus: 'accepted', label: '정답 코드' },
  { expectedStatus: 'wrong_answer', label: '오답 코드' },
  { expectedStatus: 'time_limit_exceeded', label: '시간초과 코드' },
  { expectedStatus: 'memory_limit_exceeded', label: '메모리 초과 코드' },
];
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = mod.require.bind(mod);
  mod.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/domains/problemManagement/archive')
      return {
        inspectProblemArchive: async (...args) => {
          inspections.push(args);
          return inspectResponder(...args);
        },
        importProblemArchive: async (...args) => {
          imports.push(args);
          throw new Error('Unexpected registration');
        },
      };
    if (id === '@/shared/ui/ModalDialog')
      return {
        __esModule: true,
        default: ({ children, footer }) =>
          h('div', { role: 'dialog' }, children, footer),
      };
    if (
      id.endsWith('/EditorTransferLink') ||
      id.endsWith('/EditorPackageImportHint') ||
      id.endsWith('/VerificationTestResults') ||
      id.endsWith('/VerificationAnalysisPanel')
    )
      return { __esModule: true, default: () => null };
    if (id === '@/domains/problemManagement/useVerificationCodeRuns')
      return {
        VERIFICATION_CODE_KINDS: kinds,
        isVerificationRunning: () => false,
      };
    if (id === '@/domains/submissionScoreboard/status')
      return { submissionStatusLabel: (value) => value };
    if (
      id === '@/domains/problemManagement/verificationExecution' ||
      id === '@/domains/problemManagement/verificationDetails'
    )
      return {};
    if (id === '@/domains/identityAccess/queryIdentity')
      return { tokenQueryIdentity: (value) => value };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const found = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find(fs.existsSync);
      return source(path.relative(path.resolve(__dirname, '../src'), found));
    }
    return native(id);
  };
  cache.set(filename, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const Archive = source('components/operator/ProblemArchivePanel.tsx').default;
const Verification = source(
  'components/operator/VerificationCodeSection.tsx',
).default;
let root, host, client;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  inspections = [];
  imports = [];
  inspectResponder = () => new Promise(() => {});
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
});
after(() => dom.window.close());
async function render(component) {
  await act(() => root.render(h(QueryClientProvider, { client }, component)));
}
async function drop(target, files) {
  const event = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items: [], files },
  });
  await act(async () => {
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  return event;
}
async function archive(problems = []) {
  await render(
    h(Archive, {
      contestId: 'contest',
      token: 'token',
      divisions: [{ division_id: 'division', name: '일반' }],
      problems,
      activeDivisionId: 'division',
      disabled: false,
      onCreate() {},
      onImported() {},
    }),
  );
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === 'ZOJ ZIP 불러오기',
  );
  await act(() => button.click());
  return host.querySelector('[data-file-drop-zone]');
}
test('archive drop uses the existing inspection endpoint and waits for explicit final registration', async () => {
  const zone = await archive();
  const file = new window.File(['zip'], 'problem.zoj.zip', {
    type: 'application/zip',
  });
  const event = await drop(zone, [file]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(inspections.length, 1);
  assert.deepEqual(inspections[0], ['contest', 'token', file]);
  assert.equal(imports.length, 0);
  assert.equal(zone.getAttribute('aria-disabled'), 'true');
  await drop(zone, [file]);
  assert.equal(inspections.length, 1);
});
test('archive drop rejects an oversized file before any upload', async () => {
  const zone = await archive();
  const file = new window.File(['zip'], 'large.zip');
  Object.defineProperty(file, 'size', { value: 513 * 1024 * 1024 });
  await drop(zone, [file]);
  assert.equal(inspections.length, 0);
  assert.match(host.textContent, /512 MiB 이하/);
});
async function enterCode(value) {
  const input = host.querySelector('input[pattern]');
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set.call(input, value);
  await act(() =>
    input.dispatchEvent(new window.Event('input', { bubbles: true })),
  );
  return input;
}
function archivePreview(code) {
  return {
    problem: {
      problem_code: code,
      title: '기존 문제',
      time_limit_ms: 1000,
      memory_limit_mb: 256,
    },
    example_count: 0,
    asset_count: 0,
    testcase_count: 0,
    total_bytes: 0,
    testcase_sets: [],
    assets: [],
  };
}
test('legacy ZIP numbers must be corrected; new input uppercases letters and blocks invalid registration', async () => {
  inspectResponder = async () => archivePreview('한글-번호');
  const zone = await archive();
  await drop(zone, [new window.File(['zip'], 'problem.zoj.zip')]);
  const register = () =>
    [...host.querySelectorAll('button')].find(
      (button) => button.textContent === '새 문제로 등록',
    );
  assert.equal(register().disabled, true);
  assert.match(host.textContent, /영문·숫자만/);
  for (const value of ['A-1', 'ß', 'A'.repeat(17)]) {
    const input = await enterCode(value);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(register().disabled, true);
  }
  const input = await enterCode('b12');
  assert.equal(input.value, 'B12');
  assert.equal(input.getAttribute('maxlength'), '16');
  assert.equal(register().disabled, false);
  await act(() => register().click());
  assert.equal(imports.length, 1);
  assert.equal(imports[0][4], 'B12');
});
test('ZIP numbers collide case-insensitively after uppercase normalization', async () => {
  inspectResponder = async () => archivePreview('a1');
  const zone = await archive([{ division_id: 'division', problem_code: 'a1' }]);
  await drop(zone, [new window.File(['zip'], 'problem.zoj.zip')]);
  assert.equal(host.querySelector('input[pattern]').value, 'A1');
  const register = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === '새 문제로 등록',
  );
  assert.equal(register.disabled, true);
  assert.match(host.textContent, /같은 문제 번호/);
  assert.equal(imports.length, 0);
});
test('verification drops preserve the selected expected verdict and multiple files', async () => {
  const uploads = [];
  await render(
    h(Verification, {
      contestId: 'contest',
      token: 'token',
      aiAvailable: false,
      assetsByKind: new Map(),
      results: [],
      onDelete() {},
      onDismiss() {},
      onPreview() {},
      onRun() {},
      onUpload: (...args) => uploads.push(args),
    }),
  );
  const files = [
    new window.File(['one'], 'slow.cpp'),
    new window.File(['two'], 'slow.py'),
  ];
  const zone = host.querySelector('[aria-label="시간초과 코드 파일 업로드"]');
  await drop(zone, files);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0], ['time_limit_exceeded', files]);
  const input = host.querySelector('[aria-label="메모리 초과 코드 파일 선택"]');
  Object.defineProperty(input, 'files', { value: files });
  await act(() =>
    input.dispatchEvent(new window.Event('change', { bubbles: true })),
  );
  assert.deepEqual(uploads[1], ['memory_limit_exceeded', files]);
});
