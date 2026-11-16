const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/admin/judge',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const h = React.createElement;
let historyCalls, copied, closed, host, root, client;
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@/domains/submissionScoreboard/api')
      return {
        getSubmissionRejudgings: async (
          contestId,
          submissionId,
          token,
          offset,
        ) => {
          historyCalls.push({ contestId, submissionId, token, offset });
          return { items: [], total: 0, offset: 0, limit: 10, has_next: false };
        },
      };
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((extension) => id.slice(2) + extension)
        .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file))),
    );
  };
  modules.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Dialog = source(
  'components/admin/AdminSubmissionDetailDialog.tsx',
).default;

function entry(overrides = {}) {
  return {
    submission: {
      submission_id: 'abc12345-6789',
      problem_id: 'problem',
      language: 'cpp17',
      status: 'accepted',
      submitted_at: '2026-11-17T00:00:00Z',
      submission_kind: 'participant',
      runtime_ms: 1200,
      memory_kb: 22000,
      source_code: '  int main() { return 0; }\n\n',
      code_length_bytes: 29,
      ...overrides,
    },
    contest: { contest_id: 'contest', title: '관리할 대회' },
    division: { division_id: 'division', name: '대학생부' },
    problem: {
      problem_id: 'problem',
      problem_code: 'A',
      title: '구간 합의 범위',
      time_limit_ms: 2000,
      memory_limit_mb: 512,
    },
    team: { participant_team_id: 'team', team_name: '참가팀' },
    member: {
      team_member_id: 'member',
      name: '참가자',
      email: 'member@example.test',
    },
    judge_job: {
      judge_job_id: 'job-123',
      status: 'succeeded',
      queue_position: 0,
      assigned_node_id: 'node-456',
      created_at: '2026-11-17T00:00:00Z',
    },
    judge_node: {
      judge_node_id: 'node-456',
      node_name: 'zoj-judge-03',
      agent_version: 'v0.3.2',
    },
    active_testcase_count: 15,
  };
}

beforeEach(() => {
  historyCalls = [];
  copied = [];
  closed = 0;
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => copied.push(text) },
  });
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => {
  dom.window.close();
  if (originalNavigator)
    Object.defineProperty(global, 'navigator', originalNavigator);
  else delete global.navigator;
});
async function render(value = entry(), extra = {}) {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(Dialog, {
          entry: value,
          error: null,
          isLoading: false,
          onClose: () => closed++,
          ...extra,
        }),
      ),
    );
  });
  await act(
    async () => new Promise((resolve) => window.setTimeout(resolve, 15)),
  );
}
const dialog = () => document.querySelector('dialog[aria-label="제출 상세"]');
const button = (label) =>
  [...dialog().querySelectorAll('button')].find(
    (node) => node.textContent.trim() === label,
  );
const details = (label) =>
  [...dialog().querySelectorAll('details')].find((node) =>
    node.querySelector('summary')?.textContent.trim().startsWith(label),
  );
async function click(label) {
  assert.ok(button(label), label);
  await act(async () => button(label).click());
}

test('admin detail uses the operator result and source layout with collapsed administrator context', async () => {
  const value = entry();
  await render(value);
  assert.match(
    dialog().querySelector('h2').textContent,
    /^A\. 구간 합의 범위$/,
  );
  assert.equal(
    dialog().querySelector('.zoj-modal-eyebrow').textContent,
    '제출 상세 · abc12345',
  );
  assert.match(
    dialog().querySelector('.zoj-modal-description').textContent,
    /참가팀\(참가자\)/,
  );
  assert.equal(
    dialog().querySelector('[aria-label="제출한 소스 코드"]').textContent,
    value.submission.source_code,
  );
  assert.match(
    dialog().querySelector('[aria-label="채점 결과"]').textContent,
    /맞았습니다/,
  );
  assert.match(dialog().textContent, /1,200 ms/);
  assert.match(dialog().textContent, /22 MB/);
  const context = details('관리자 채점 정보');
  assert.equal(context.open, false);
  for (const text of [
    '관리할 대회',
    '대학생부',
    'zoj-judge-03',
    'node-456',
    'job-123',
    'v0.3.2',
    '15개',
  ])
    assert.ok(context.textContent.includes(text), text);
  assert.equal(details('제출 정보').open, false);
  assert.match(details('제출 정보').textContent, /참가자 제출/);
  assert.deepEqual(historyCalls, []);
  await act(async () => dialog().querySelector('[aria-label="닫기"]').click());
  assert.equal(closed, 1);
});

test('copy preserves the original source and code wrapping resets for another submission', async () => {
  const value = entry();
  await render(value);
  await click('코드 복사');
  assert.deepEqual(copied, [value.submission.source_code]);
  assert.ok(button('복사됨'));
  await click('줄바꿈 꺼짐');
  assert.equal(button('줄바꿈 켜짐').getAttribute('aria-pressed'), 'true');
  assert.ok(
    dialog()
      .querySelector('[aria-label="제출한 소스 코드"]')
      .classList.contains('whitespace-pre-wrap'),
  );
  await render(
    entry({ submission_id: 'different-id', source_code: 'new code' }),
  );
  assert.ok(button('코드 복사'));
  assert.equal(button('줄바꿈 꺼짐').getAttribute('aria-pressed'), 'false');
});

test('IOI score, subtasks and failed input-output diagnostics use shared details', async () => {
  await render(
    entry({
      status: 'time_limit_exceeded',
      scoring_mode: 'ioi',
      score: 25,
      max_score: 100,
      failed_testcase_order: 6,
      subtask_results: [
        {
          subtask_id: 'small',
          name: '작은 입력',
          score: 25,
          max_score: 25,
          status: 'accepted',
        },
      ],
      judge_message:
        'testcase #6: output mismatch\n[input]\n1 2\n[expected]\n3\n[actual]\n4',
    }),
  );
  assert.match(
    dialog().querySelector('[aria-label="제출 점수"]').textContent,
    /25 \/ 100점/,
  );
  assert.match(details('서브태스크별 점수').textContent, /작은 입력/);
  assert.match(
    dialog().textContent,
    /테스트케이스 #6에서 실패 · 다른 그룹도 독립적으로 채점/,
  );
  const diagnostics = details('채점 상세');
  assert.equal(diagnostics.open, false);
  for (const text of [
    '실패 입력',
    '기대 출력',
    '실제 출력',
    '1 2',
    'output mismatch',
  ])
    assert.ok(diagnostics.textContent.includes(text), text);
});

test('pending progress updates and disappears when the official result arrives', async () => {
  await render(
    entry({
      status: 'judging',
      progress_current: 4,
      progress_total: 15,
      progress_percent: 27,
    }),
  );
  assert.equal(
    dialog()
      .querySelector('[role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '27',
  );
  assert.match(dialog().textContent, /4\/15/);
  await render(entry({ status: 'accepted' }));
  assert.equal(dialog().querySelector('[role="progressbar"]'), null);
  assert.match(
    dialog().querySelector('[aria-label="채점 결과"]').textContent,
    /맞았습니다/,
  );
});

test('compile errors open compiler diagnostics without empty input-output placeholders', async () => {
  await render(
    entry({
      status: 'compile_error',
      compile_message: 'fatal error: String: No such file or directory',
    }),
  );
  assert.equal(details('채점 상세').open, true);
  assert.match(details('채점 상세').textContent, /컴파일 로그/);
  assert.match(details('채점 상세').textContent, /fatal error: String/);
  assert.doesNotMatch(
    details('채점 상세').textContent,
    /실패 입력|기대 출력|실제 출력/,
  );
});

test('loading and errors do not expose an unrelated cached source', async () => {
  await render(undefined, { entry: undefined, isLoading: true });
  assert.match(dialog().textContent, /제출 상세를 불러오는 중/);
  assert.equal(dialog().querySelector('[aria-label="제출한 소스 코드"]'), null);
  await render(entry(), { error: new Error('request failed') });
  assert.ok(dialog().querySelector('[role="alert"]'));
  assert.equal(dialog().querySelector('[aria-label="제출한 소스 코드"]'), null);
});

test('service-master history requests stay scoped to the inspected contest and submission', async () => {
  await render(entry(), { token: 'master-token' });
  assert.deepEqual(historyCalls[0], {
    contestId: 'contest',
    submissionId: 'abc12345-6789',
    token: 'master-token',
    offset: 0,
  });
  assert.match(dialog().textContent, /이 제출의 재채점 이력이 없습니다/);
  await render(
    {
      ...entry({ submission_id: 'another-submission' }),
      contest: { contest_id: 'another-contest', title: '다른 대회' },
    },
    { token: 'master-token' },
  );
  assert.deepEqual(historyCalls.at(-1), {
    contestId: 'another-contest',
    submissionId: 'another-submission',
    token: 'master-token',
    offset: 0,
  });
});

test('preview ownership uses the staff display title and missing admin metadata remains usable', async () => {
  const value = entry({
    submission_kind: 'participant_preview',
    submitted_by_name: '출제자',
    submitted_by_title: '총괄',
    source_code: undefined,
  });
  value.contest = null;
  value.division = null;
  value.judge_node = null;
  value.judge_job = null;
  value.active_testcase_count = 0;
  await render(value, { token: 'master-token' });
  assert.match(
    dialog().querySelector('.zoj-modal-description').textContent,
    /출제자 \/ 총괄/,
  );
  assert.match(details('제출 정보').textContent, /참가자 미리보기/);
  assert.match(details('관리자 채점 정보').textContent, /0개/);
  assert.match(dialog().textContent, /표시할 소스 코드가 없습니다/);
  assert.deepEqual(historyCalls, []);
});
