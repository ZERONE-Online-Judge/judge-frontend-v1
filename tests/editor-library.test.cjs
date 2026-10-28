const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://judge.test/operator',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const calls = [];
const mocks = {
  '@/shared/api/client': {
    apiRequest: async (...args) => {
      calls.push(args);
      return {};
    },
  },
  '@/shared/api/errors': { formatApiError: (error) => String(error) },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'owner',
  },
  '@/shared/ui/ModalDialog': {
    __esModule: true,
    default: ({ children, footer }) =>
      React.createElement('section', null, children, footer),
    ModalButton: ({ children, tone, ...props }) =>
      React.createElement('button', props, children),
  },
};
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const entry = new Module(file, module);
  entry.filename = file;
  entry.paths = Module._nodeModulePaths(path.dirname(file));
  const native = entry.require.bind(entry);
  entry.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/')) {
      const rel = id.slice(2);
      return load(
        fs.existsSync(path.resolve(__dirname, '../src', rel + '.tsx'))
          ? rel + '.tsx'
          : rel + '.ts',
      );
    }
    return native(id);
  };
  cache.set(file, entry);
  entry._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
  return entry.exports;
}
const api = load('domains/problemManagement/editorLibrary.ts');
after(() => dom.window.close());

test('request uses own authenticated library and applies folder before paging', async () => {
  calls.length = 0;
  await api.getEditorLibrary(
    'contest',
    'staff-token',
    '100% 문제',
    100,
    'root',
  );
  const [url, token] = calls[0];
  const query = new URL(url, 'https://judge.test').searchParams;
  assert.equal(token, 'staff-token');
  assert.equal(query.get('folder'), 'root');
  assert.equal(query.get('offset'), '100');
  assert.equal(query.get('q'), '100% 문제');
  await api.importEditorProject(
    'contest',
    'staff-token',
    'project',
    'job',
    'division',
    ' B ',
  );
  assert.deepEqual(JSON.parse(calls[1][2].body), {
    job_id: 'job',
    division_id: 'division',
    problem_code: 'B',
  });
});

test('folder path preserves nesting and terminates on malformed cycles', () => {
  const folders = [
    { id: 'a', name: '대회', parent_id: null },
    { id: 'b', name: '예선', parent_id: 'a' },
  ];
  assert.equal(api.editorFolderPath(folders, 'b'), '대회 / 예선');
  assert.equal(
    api.editorFolderPath([{ id: 'x', name: 'x', parent_id: 'x' }], 'x'),
    'x',
  );
});

test('import requires a verified package and prevents an existing problem code', async () => {
  const project = {
    id: 'project',
    name: '두 수의 합',
    slug: 'a-plus-b',
    revision: 4,
    folder_id: null,
    uncommitted: true,
    testsets: ['tests', 'tle'],
    statement_languages: ['korean'],
  };
  const requested = [],
    imported = [];
  mocks['@/domains/problemManagement/editorLibrary'] = {
    ...api,
    getEditorLibrary: async () => ({
      configured: true,
      account_exists: true,
      email: 'owner@example.com',
      problems: [project],
      folders: [],
      total: 1,
    }),
    prepareEditorPackage: async (...args) => {
      requested.push(args);
      return { id: 'job', status: 'queued', revision: 4 };
    },
    getEditorPackage: async () => ({
      id: 'job',
      status: 'completed',
      revision: 4,
      package: { format: 'zoj', verified: true },
    }),
    importEditorProject: async (...args) => {
      imported.push(args);
      return { problem_code: 'B', title: '두 수의 합' };
    },
  };
  const Panel = load('components/operator/EditorImportPanel.tsx').default;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  let saved;
  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(Panel, {
          contestId: 'contest',
          token: 'staff-token',
          divisions: [{ division_id: 'division', name: '일반부' }],
          problems: [{ division_id: 'division', problem_code: 'A' }],
          activeDivisionId: 'division',
          disabled: false,
          onImported: (p) => {
            saved = p;
          },
        }),
      ),
    ),
  );
  const button = (label) =>
    [...host.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label,
    );
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
    });
  };
  await act(async () => button('Editor에서 가져오기').click());
  await flush();
  assert.match(host.textContent, /owner@example.com/);
  const packageLink = host.querySelector(
    'a[href="https://editor.zoj.kr/problems?action=import"]',
  );
  assert.ok(packageLink, 'Linux ZIP should open the Editor import dialog');
  assert.equal(packageLink.target, '_blank');
  assert.ok(packageLink.relList.contains('noopener'));
  assert.match(host.textContent, /Polygon Linux/);
  assert.equal(button('이 대회에 문제 가져오기').disabled, true);
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent.includes('두 수의 합'))
      .click(),
  );
  const extraSet = [...host.querySelectorAll('label')]
    .find((el) => el.textContent.trim() === 'tle')
    .querySelector('input');
  await act(async () => extraSet.click());
  await act(async () => button('검증 패키지 준비').click());
  await flush();
  await flush();
  assert.equal(requested.length, 1);
  assert.deepEqual(requested[0][3], ['tests', 'tle']);
  assert.match(host.textContent, /개인·협업·팀 폴더/);
  const input = host.querySelector('input[placeholder="예: A"]');
  assert.ok(input, 'Destination problem code must be editable');
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  ).set;
  async function code(value) {
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  await code('A');
  assert.equal(button('이 대회에 문제 가져오기').disabled, true);
  await code('B');
  assert.equal(button('이 대회에 문제 가져오기').disabled, false);
  await act(async () => button('이 대회에 문제 가져오기').click());
  await flush();
  assert.equal(imported.length, 1);
  assert.equal(saved.problem_code, 'B');
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

test('running contest update needs a reason and confirmation and binds preview hashes', async () => {
  const reviewed = {
    target_problem_id: 'target',
    problem_code: 'A',
    title: 'Problem',
    target_hash: 'a'.repeat(64),
    archive_sha256: 'b'.repeat(64),
    current_testcase_count: 1,
    incoming_testcase_count: 2,
    testcase_changes: { added: 1, removed: 0, changed: 0 },
    next_testcase_version: 2,
    contest_running: true,
    submission_count: 3,
    preserved: 'Keep original verdicts',
    changes: [],
    files: [],
    changed_file_count: 0,
  };
  const submitted = [];
  mocks['@/domains/problemManagement/editorLibrary'].applyEditorUpdate = async (
    ...args
  ) => {
    submitted.push(args);
    throw new Error('대회 문제가 변경되었습니다. 다시 확인하세요.');
  };
  const Update = load('components/operator/EditorUpdateModal.tsx').default;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: 0 } },
  });
  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(Update, {
          contestId: 'contest',
          token: 'token',
          projectId: 'project',
          jobId: 'job',
          preview: reviewed,
          onClose: () => {},
          onUpdated: () => {},
        }),
      ),
    ),
  );
  const apply = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === '확인한 패키지 적용',
  );
  assert.equal(apply.disabled, true);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(host.querySelector('textarea'), 'Fix boundary tests');
    host
      .querySelector('textarea')
      .dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(apply.disabled, true);
  await act(async () => host.querySelector('input[type=checkbox]').click());
  assert.equal(apply.disabled, false);
  await act(async () => {
    apply.click();
    await new Promise((r) => setTimeout(r, 25));
  });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0][4].target_hash, reviewed.target_hash);
  assert.equal(submitted[0][4].archive_sha256, reviewed.archive_sha256);
  assert.deepEqual(submitted[0].slice(5), ['Fix boundary tests', true]);
  assert.match(host.textContent, /대회 문제가 변경/);
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
