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
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
let calls, batches, host, root, client, originalResult, candidateResult;
const mocks = {
  '@/components/operator/OperatorShell': {
    OperatorPanel: ({ title, children }) =>
      h('section', null, h('h2', null, title), children),
  },
  '@/domains/submissionScoreboard/api': {
    listRejudgings: async () => ({ batches, total: batches.length }),
    getRejudging: async (_cid, _token, id) => ({
      ...batches.find((item) => item.rejudging_id === id),
      items: [
        {
          submission_id: 'original',
          language: 'cpp17',
          submitted_at: '2026-10-11T00:00:00Z',
          original_result: structuredClone(originalResult),
          candidate_result: structuredClone(candidateResult),
          changed: true,
        },
      ],
      offset: 0,
      limit: 50,
      has_next: false,
    }),
    createRejudging: async (_cid, _token, target, reason) => {
      calls.push({ action: 'create', target, reason });
      const batch = example('pending');
      batches = [batch];
      return batch;
    },
    decideRejudging: async (_cid, _token, id, action) => {
      calls.push({ action, id });
      batches = batches.map((batch) => ({
        ...batch,
        status: action === 'apply' ? 'applied' : 'cancelled',
      }));
      return batches[0];
    },
  },
};
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@/')) {
      const base = id.slice(2);
      return source(
        ['.ts', '.tsx']
          .map((ext) => base + ext)
          .find((file) =>
            fs.existsSync(path.resolve(__dirname, '../src', file)),
          ),
      );
    }
    return native(id);
  };
  modules.set(filename, loaded);
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
const Panel = source('components/operator/RejudgingPanel.tsx').default;
const { canRejudgeSubmission } = source(
  'domains/submissionScoreboard/rejudging.ts',
);
function example(status = 'ready') {
  return {
    rejudging_id: 'batch',
    problem_id: 'problem',
    problem_code: 'A',
    status,
    reason: 'Expected output corrected',
    scope: { kind: 'problem', skipped_pending: 2 },
    total: 1,
    completed: status === 'pending' ? 0 : 1,
    system_errors: status === 'blocked' ? 1 : 0,
    changed_verdicts: 1,
    requested_by_name: 'Operator',
    requested_by_email: 'operator@test',
    decided_by_email: 'operator@test',
    created_at: '2026-10-11T00:00:00Z',
    decided_at: '2026-10-11T00:05:00Z',
  };
}
beforeEach(() => {
  calls = [];
  batches = [example()];
  originalResult = { status: 'wrong_answer', runtime_ms: 10, memory_kb: 100 };
  candidateResult = { status: 'accepted', runtime_ms: 20, memory_kb: 200 };
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => dom.window.close());
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}
async function render(overrides = {}) {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(Panel, {
          contestId: 'contest',
          token: 'fixture',
          canRejudge: true,
          target: null,
          targetLabel: 'A. Sum',
          onCloseRequest() {},
          ...overrides,
        }),
      ),
    ),
  );
  await settle();
}
function button(text) {
  return [...document.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === text,
  );
}
async function click(item) {
  assert.ok(item);
  await act(async () => item.click());
  await settle();
}
async function open() {
  await click(
    [...host.querySelectorAll('button')].find((item) =>
      item.textContent.includes('결과 비교'),
    ),
  );
}

test('final verdicts are rejudgeable and running/AI evidence is excluded', () => {
  for (const status of [
    'accepted',
    'wrong_answer',
    'time_limit_exceeded',
    'memory_limit_exceeded',
    'system_error',
  ])
    assert.equal(canRejudgeSubmission({ status }), true);
  for (const status of ['waiting', 'preparing', 'judging', 'unexpected'])
    assert.equal(canRejudgeSubmission({ status }), false);
  assert.equal(
    canRejudgeSubmission({
      status: 'accepted',
      submission_kind: 'verification_trial',
    }),
    false,
  );
});
test('comparison preserves old/new verdicts and applying needs explicit confirmation', async () => {
  await render();
  await open();
  assert.match(document.body.textContent, /기존 결과/);
  assert.match(document.body.textContent, /새 결과/);
  assert.match(document.body.textContent, /틀렸습니다/);
  assert.match(document.body.textContent, /맞았습니다/);
  assert.equal(calls.length, 0);
  await click(button('새 결과 반영'));
  assert.equal(calls.length, 0);
  assert.match(document.body.textContent, /원래 제출 시각/);
  await click(button('결과 반영'));
  assert.deepEqual(calls, [{ action: 'apply', id: 'batch' }]);
  assert.match(document.body.textContent, /결과 반영 완료/);
});
test('view-only operators can compare but cannot start, apply or cancel', async () => {
  await render({ canRejudge: false, target: { problem_id: 'problem' } });
  await open();
  assert.equal(button('새 결과 반영'), undefined);
  assert.equal(button('작업 취소'), undefined);
  assert.equal(button('재채점 시작'), undefined);
  assert.equal(calls.length, 0);
});
test('pending and system errors block apply while cancellation needs confirmation', async () => {
  for (const status of ['pending', 'blocked']) {
    batches = [example(status)];
    await render();
    await open();
    assert.equal(button('새 결과 반영').disabled, true);
    await click(button('작업 취소'));
    assert.equal(calls.length, 0);
    const cancelButtons = [...document.querySelectorAll('button')].filter(
      (item) => item.textContent.trim() === '작업 취소',
    );
    await click(cancelButtons.at(-1));
    assert.equal(calls.at(-1).action, 'cancel');
    await click(button('닫기'));
    calls = [];
    await act(async () => client.clear());
  }
});
test('bulk requests require a reason and respect team and language scope', async () => {
  batches = [];
  await render({ target: { problem_id: 'problem', team_id: 'team' } });
  assert.equal(button('재채점 시작').disabled, true);
  assert.equal(calls.length, 0);
  await act(async () => {
    const input = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(input, 'Fix checker');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const select = document.querySelector('select');
    select.value = 'python313';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await click(button('재채점 시작'));
  assert.deepEqual(calls[0], {
    action: 'create',
    target: { problem_id: 'problem', team_id: 'team', language: 'python313' },
    reason: 'Fix checker',
  });
});

function resultContainers() {
  return [
    document.querySelector('article .grid.grid-cols-2 > div:last-child'),
    document.querySelector('tbody tr td:last-child'),
  ];
}
async function refreshComparison() {
  await act(async () =>
    client.invalidateQueries({ queryKey: ['operator', 'rejudging'] }),
  );
  await settle();
}
test('comparison exposes actual preparation and judging progress in both responsive layouts', async () => {
  batches = [example('pending')];
  candidateResult = {
    status: 'preparing',
    progress_current: 0,
    progress_total: 15,
    runtime_ms: null,
    memory_kb: null,
  };
  await render();
  await open();
  for (const container of resultContainers()) {
    assert.ok(container);
    assert.match(container.textContent, /채점 준비 중/);
    assert.match(container.textContent, /0\/15 · 0%/);
    assert.doesNotMatch(container.textContent, /— · -/);
  }
  assert.equal(button('새 결과 반영').disabled, true);

  candidateResult = {
    ...candidateResult,
    status: 'judging',
    progress_current: 6,
  };
  await refreshComparison();
  for (const container of resultContainers()) {
    assert.match(container.textContent, /6\/15 · 40%/);
    assert.equal(container.querySelector('[style]')?.style.width, '40%');
  }

  candidateResult = {
    ...candidateResult,
    progress_current: 9,
    progress_phase: 'tle_confirmation',
  };
  await refreshComparison();
  for (const container of resultContainers()) {
    assert.match(container.textContent, /시간 초과 재확인 중/);
    assert.match(container.textContent, /9\/15 · 60%/);
    assert.equal(container.querySelector('[style]')?.style.width, '60%');
  }

  batches = [example('ready')];
  candidateResult = {
    status: 'accepted',
    progress_current: 15,
    progress_total: 15,
    progress_phase: null,
    runtime_ms: 25,
    memory_kb: 200,
  };
  await refreshComparison();
  for (const container of resultContainers()) {
    assert.match(container.textContent, /맞았습니다/);
    assert.match(container.textContent, /25ms/);
    assert.doesNotMatch(container.textContent, /\d+%|채점 중|재확인/);
    assert.equal(container.querySelector('[style]'), null);
  }
  assert.equal(button('새 결과 반영').disabled, false);
});

test('comparison does not invent progress when the testcase count is unknown', async () => {
  batches = [example('pending')];
  candidateResult = {
    status: 'judging',
    progress_current: null,
    progress_total: null,
  };
  await render();
  await open();
  for (const container of resultContainers()) {
    assert.match(container.textContent, /채점 중/);
    assert.doesNotMatch(container.textContent, /\d+%|\d+\/\d+/);
  }
});

test('comparison renders each IOI total once while retaining subtask details', async () => {
  const score = (value, status) => ({
    status,
    scoring_mode: 'ioi',
    score: value,
    max_score: 100,
    runtime_ms: 10,
    memory_kb: 100,
    subtask_results: [
      {
        subtask_id: 'small',
        name: '작은 입력',
        score: value,
        max_score: 100,
        status,
      },
    ],
  });
  originalResult = score(25, 'time_limit_exceeded');
  candidateResult = score(100, 'accepted');
  await render();
  await open();
  for (const cell of document.querySelectorAll(
    'article .grid.grid-cols-2 > div, tbody tr td:nth-child(n + 2)',
  )) {
    const summary = cell.cloneNode(true);
    summary.querySelectorAll('details').forEach((details) => details.remove());
    const total = summary.textContent.match(/\d+ \/ 100점/g) ?? [];
    assert.equal(total.length, 1, cell.textContent);
    assert.match(cell.textContent, /서브태스크별 점수/);
  }
});
