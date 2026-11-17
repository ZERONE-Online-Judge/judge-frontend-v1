const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.test/contests/synthetic',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
function protectedBy(kind) {
  return safety()[kind === 'draft' ? 'drafts' : 'operations'] > 0;
}
function blockerCount() {
  return safety().drafts + safety().operations;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let posts, polls, uploads, divisionSave, fileReader;
const mock = {
  '@/components/operator/OperatorShell': { SettingsIcon: () => null },
  '@/shared/ui/CodeEditor': {
    __esModule: true,
    default: ({ value, onChange, disabled }) =>
      h('textarea', {
        value,
        disabled,
        'aria-label': '제출 코드',
        onChange: (event) => onChange(event.target.value),
      }),
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: () => 'synthetic-identity',
  },
  '@/domains/contestAdministration/api': {
    createOperatorDivision: () => divisionSave.promise,
    updateOperatorDivision: () => divisionSave.promise,
    deleteOperatorDivision: () => divisionSave.promise,
  },
  '@/domains/problemManagement/verificationAi': {
    listVerificationRuns: async () => ({ available: false, runs: [] }),
  },
  '@/domains/problemManagement/api': {
    uploadProblemAsset: (...args) => {
      const gate = deferred();
      uploads.push({ args, ...gate });
      return gate.promise;
    },
    getStorageObjectText: async () => 'int main() {}',
  },
  '@/domains/submissionScoreboard/api': {
    createOperatorTestSubmission: (...args) => {
      const gate = deferred();
      posts.push({ args, ...gate });
      return gate.promise;
    },
    waitOperatorTestSubmissionStatus: (...args) => {
      const gate = deferred();
      polls.push({ args, ...gate });
      return gate.promise;
    },
  },
  '@/shared/api/client': {
    apiRequest: () => {
      throw new Error('Unexpected API request');
    },
  },
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
    if (mock[id]) return mock[id];
    if (id.endsWith('.css')) return {};
    if (id.endsWith('?raw'))
      return fs.readFileSync(
        path.resolve(__dirname, '../src', id.slice(2, -4)),
        'utf8',
      );
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find(fs.existsSync);
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
const Panel = source(
  'components/contest/problem/ProblemSubmitPanel.tsx',
).default;
const SaveBar = source('components/operator/SettingsSaveBar.tsx').default;
const Divisions = source(
  'components/operator/ParticipantDivisionsPanel.tsx',
).default;
const Bulk = source('components/operator/ParticipantBulkImport.tsx').default;
const useReview = source(
  'domains/problemManagement/useProblemReviewRuns.ts',
).default;
const useVerification = source(
  'domains/problemManagement/useVerificationCodeRuns.ts',
).default;
const safety = source(
  'shared/lib/frontendUpdateSafety.ts',
).getFrontendUpdateSafety;
let root, host, client;
const nativeFetch = global.fetch;
const nativeFileReader = global.FileReader;
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  posts = [];
  polls = [];
  uploads = [];
  divisionSave = deferred();
  global.fetch = () => {
    throw new Error('Every API must be mocked');
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  assert.equal(blockerCount(), 0, 'Unmount releases every registration');
  global.FileReader = nativeFileReader;
});
after(() => {
  global.fetch = nativeFetch;
  dom.window.close();
});
async function render(element) {
  await act(async () =>
    root.render(h(QueryClientProvider, { client }, element)),
  );
}
async function settle(action = () => {}) {
  await act(async () => {
    action();
    await new Promise((done) => global.setTimeout(done, 0));
  });
}
async function until(condition, message) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (condition()) return;
    await settle();
  }
  assert.ok(condition(), message);
}
async function enter(node, value) {
  assert.ok(node);
  await act(() => {
    const prototype =
      node.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const panelProps = {
  language: 'cpp17',
  sourceCode: '',
  isSubmitting: false,
  message: '',
  messageStatus: 'idle',
  onLanguageChange() {},
  onSourceCodeChange() {},
  onSubmit() {},
};
const saveProps = {
  changedCount: 0,
  pending: false,
  savedMessage: '',
  onReset() {},
};
const contest = { status: 'scheduled' };
const divisions = [{ division_id: 'general', name: '일반부', description: '' }];
function verdict(id, status = 'accepted') {
  return {
    submission_id: id,
    problem_id: 'problem-a',
    status,
    submitted_at: '2026-11-17T00:00:00Z',
  };
}

test('code drafts and submission requests have separate protection, even with storage unavailable', async () => {
  const nativeStorage = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => {
    throw new Error('Storage denied');
  };
  try {
    await render(h(Panel, panelProps));
    assert.equal(blockerCount(), 0);
    await render(h(Panel, { ...panelProps, sourceCode: 'int main() {}' }));
    assert.equal(protectedBy('draft'), true);
    assert.equal(protectedBy('operation'), false);
    await render(h(Panel, { ...panelProps, isSubmitting: true }));
    assert.equal(protectedBy('draft'), false);
    assert.equal(protectedBy('operation'), true);
    await render(h(Panel, panelProps));
    assert.equal(blockerCount(), 0);
  } finally {
    window.Storage.prototype.setItem = nativeStorage;
  }
});

test('multiple settings bars release only their own dirty or saving protection', async () => {
  function Bars({ changed = 0, pending = false }) {
    return h(
      React.Fragment,
      null,
      h(SaveBar, { ...saveProps, changedCount: changed }),
      h(SaveBar, { ...saveProps, pending }),
    );
  }
  await render(h(Bars, { changed: 2, pending: true }));
  assert.equal(protectedBy('draft'), true);
  assert.equal(protectedBy('operation'), true);
  await render(h(Bars, { changed: 0, pending: true }));
  assert.equal(protectedBy('draft'), false);
  assert.equal(protectedBy('operation'), true);
  await render(h(Bars, {}));
  assert.equal(blockerCount(), 0);
});

test('division changes remain protected while collapsed and saving, then release after success', async () => {
  await render(
    h(Divisions, { contestId: 'contest', token: 'token', contest, divisions }),
  );
  assert.equal(blockerCount(), 0);
  const input = host.querySelector('input');
  await enter(input, '새 유형');
  assert.equal(protectedBy('draft'), true, 'Collapsed form state is protected');
  await settle(() =>
    host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(protectedBy('operation'), true);
  await settle(() =>
    divisionSave.resolve({ division_id: 'new', name: '새 유형' }),
  );
  await settle();
  assert.equal(blockerCount(), 0);
});

test('bulk import protects collapsed text and asynchronous file reading without a mutation', async () => {
  await render(
    h(Bulk, {
      contestId: 'contest',
      token: 'token',
      divisions,
      onRegistered() {},
    }),
  );
  assert.equal(blockerCount(), 0);
  const text = host.querySelector('[aria-label="참가팀 일괄 등록 내용"]');
  await enter(text, 'team_name,division');
  assert.equal(protectedBy('draft'), true);
  await enter(text, '');
  assert.equal(blockerCount(), 0);
  global.FileReader = class {
    readAsText() {
      fileReader = { fail: () => this.onerror() };
    }
  };
  const file = host.querySelector('input[type="file"]');
  Object.defineProperty(file, 'files', {
    configurable: true,
    value: [{ name: 'teams.csv' }],
  });
  await act(() =>
    file.dispatchEvent(new window.Event('change', { bubbles: true })),
  );
  assert.equal(protectedBy('operation'), true);
  assert.equal(
    client.isMutating(),
    0,
    'File reading is not a React Query mutation',
  );
  await act(() => fileReader.fail());
  assert.equal(blockerCount(), 0);
});

test('review protects all problem requests and polling until the last run finishes', async () => {
  let review;
  function Workspace() {
    review = useReview('contest', 'token');
    return null;
  }
  await render(h(Workspace));
  assert.equal(blockerCount(), 0);
  await settle(() => review.submit('problem-a', 'cpp17', 'int main() {}'));
  await settle(() => review.submit('problem-b', 'cpp17', 'int main() {}'));
  assert.equal(protectedBy('operation'), true);
  assert.equal(
    client.isMutating(),
    0,
    'Review uses independent async requests',
  );
  await settle(() => posts[0].resolve(verdict('first', 'judging')));
  assert.equal(polls.length, 1);
  await settle(() => polls[0].resolve(verdict('first')));
  assert.equal(
    protectedBy('operation'),
    true,
    'Other problem still submitting',
  );
  await settle(() => posts[1].reject(new Error('Synthetic rejected request')));
  await until(
    () => review.runs.some((run) => run.phase === 'error'),
    'Query observer receives the final request error',
  );
  assert.equal(protectedBy('operation'), false);
});

test('verification stays protected through upload, problem change, POST and final polling', async () => {
  let api, changeProblem;
  function Workspace() {
    const [problemId, setProblem] = React.useState('problem-a');
    changeProblem = setProblem;
    api = useVerification({ contestId: 'contest', problemId, token: 'token' });
    return null;
  }
  await render(h(Workspace));
  await settle(() =>
    api.upload('accepted', [
      { name: 'main.cpp', size: 13, text: async () => 'int main() {}' },
    ]),
  );
  assert.equal(protectedBy('operation'), true);
  await settle(() => changeProblem('problem-b'));
  assert.equal(api.results.length, 0);
  assert.equal(
    protectedBy('operation'),
    true,
    'Hidden problem upload is protected',
  );
  await settle(() =>
    uploads[0].resolve({
      asset_id: 'asset-a',
      original_filename: 'main.cpp',
      storage_key: 'synthetic/main.cpp',
      source_language: 'cpp17',
    }),
  );
  assert.equal(posts.length, 1);
  await settle(() => posts[0].resolve(verdict('verify', 'judging')));
  assert.equal(polls.length, 1);
  assert.equal(protectedBy('operation'), true);
  await settle(() => polls[0].resolve(verdict('verify')));
  assert.equal(protectedBy('operation'), false);
});
