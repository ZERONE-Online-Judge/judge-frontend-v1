const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');

const loaded = new Map();
const passthrough = ({ children }) => children;
const ignored = new Proxy(
  { __esModule: true, default: passthrough },
  { get: (target, name) => target[name] ?? (() => null) },
);
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = compiled.require.bind(compiled);
  compiled.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@tanstack/react-query')
      return { useQuery: () => ({ data: undefined }) };
    if (id === '@/domains/problemManagement/useVerificationCodeRuns')
      return {
        isVerificationRunning: (row) => !row.error && row.stage !== 'done',
      };
    if (id === '@/shared/ui/ModalDialog' || id === '@/shared/ui/Modal')
      return ignored;
    if (!id.startsWith('@/')) return nativeRequire(id);
    const supported = [
      '@/shared/ui/ProgressMotion',
      '@/shared/hooks/useAnimatedValue',
      '@/shared/hooks/useDocumentVisibility',
      '@/domains/submissionScoreboard/status',
      '@/domains/submissionScoreboard/scoring',
      '@/domains/submissionScoreboard/languageLabel',
      '@/domains/submissionScoreboard/languagePreference',
      '@/domains/problemManagement/verificationDetails',
      '@/domains/problemManagement/verificationExecution',
      '@/shared/lib/formatters',
      '@/components/contest/submissions/SubmissionScoreDetails',
    ];
    if (!supported.includes(id)) return ignored;
    const file = ['.ts', '.tsx']
      .map((extension) => id.slice(2) + extension)
      .find((candidate) =>
        fs.existsSync(path.resolve(__dirname, '../src', candidate)),
      );
    return source(file);
  };
  loaded.set(filename, compiled);
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exposed =
    {
      'components/operator/VerificationCodeSection.tsx': [
        'VerificationResultSummary',
      ],
      'pages/contest/ContestProblemDetailPage.tsx': ['MockJudgeResult'],
      'pages/operator/OperatorProblemsPage.tsx': [
        'UploadProgressModal',
        'OperatorPreviewJudgeResult',
      ],
    }[relative] ?? [];
  for (const component of exposed)
    code += `\nmodule.exports.${component} = ${component};`;
  compiled._compile(code, filename);
  return compiled.exports;
}
function render(component, props) {
  const html = renderToStaticMarkup(React.createElement(component, props));
  return new JSDOM(`<body>${html}</body>`).window.document.body;
}
const pending = {
  submission_id: 'submission-first',
  submitted_at: '2026-11-14T01:00:00Z',
  language: 'python311',
  status: 'judging',
  progress_current: 4,
  progress_total: 15,
  progress_percent: 27,
};
const mock = source(
  'pages/contest/ContestProblemDetailPage.tsx',
).MockJudgeResult;
const summary = source(
  'components/operator/VerificationCodeSection.tsx',
).VerificationResultSummary;
const review = source('components/operator/ProblemReviewResult.tsx').default;
const cases = source('components/operator/VerificationTestResults.tsx').default;
const { UploadProgressModal: upload, OperatorPreviewJudgeResult: preview } =
  source('pages/operator/OperatorProblemsPage.tsx');

test('mock judging animates the actual progress without exposing hidden percentages', () => {
  const known = render(mock, { result: pending });
  assert.equal(
    known.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '27',
  );
  assert.match(known.textContent, /27%/);
  const hidden = render(mock, {
    result: {
      ...pending,
      progress_percent: undefined,
      progress_current: undefined,
      progress_total: undefined,
    },
  });
  assert.equal(
    hidden.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'),
    false,
  );
  assert.doesNotMatch(hidden.textContent, /\d+%/);
  assert.doesNotMatch(hidden.innerHTML, /width:\s*(35|100)%/);
});

test('mock judging completes with its verdict and a real final progress value', () => {
  const body = render(mock, {
    result: { ...pending, status: 'accepted', progress_percent: undefined },
  });
  assert.equal(
    body.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '100',
  );
  assert.match(body.textContent, /맞았습니다/);
  assert.match(body.textContent, /완료/);
});

test('full verification keeps actual completed testcase counts and retry labels', () => {
  const body = render(summary, {
    result: {
      id: 'verification-first',
      filename: 'solution.py',
      stage: 'judging',
      expectedStatus: 'accepted',
      submission: { ...pending, progress_phase: 'tle_confirmation' },
      execution: { completed: 4, total: 15, full_suite_complete: false },
    },
  });
  assert.equal(
    body.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '27',
  );
  assert.match(
    body.textContent,
    /시간 초과 재확인 중 · 판정 확인 4 \/ 15개 · 27%/,
  );
  assert.doesNotMatch(body.textContent, /판정 확인 8 \/ 15/);
});

test('verification preparation has indeterminate progress and no invented percentage', () => {
  const body = render(summary, {
    result: {
      id: 'verification-first',
      filename: 'solution.py',
      stage: 'submitting',
      expectedStatus: 'accepted',
    },
  });
  assert.equal(
    body.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'),
    false,
  );
  assert.doesNotMatch(body.textContent, /\d+%/);
});

test('single review preserves progress and replaces it with its completed verdict', () => {
  const run = {
    id: 'review-first',
    phase: 'judging',
    language: 'python311',
    sourceCode: 'pass',
    submission: pending,
  };
  const working = render(review, { run, onResume() {} });
  assert.equal(
    working.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '27',
  );
  const done = render(review, {
    run: {
      ...run,
      phase: 'done',
      submission: { ...pending, status: 'accepted' },
    },
    onResume() {},
  });
  assert.equal(done.querySelector('[role="progressbar"]'), null);
  assert.match(done.textContent, /맞았습니다/);
});

test('operator preview shows its own measured progress and no percentage for unknown work', () => {
  const known = render(preview, { submission: pending });
  assert.equal(
    known.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '27',
  );
  assert.match(known.textContent, /4\/15 · 27%/);
  const unknown = render(preview, {
    submission: {
      ...pending,
      progress_percent: undefined,
      progress_current: undefined,
      progress_total: undefined,
    },
  });
  assert.equal(
    unknown.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'),
    false,
  );
});

test('test upload reports the actual bounded percentage', () => {
  const body = render(upload, { progress: 42, message: '입력 파일 확인 중' });
  assert.equal(
    body.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '42',
  );
  assert.match(body.textContent, /42%/);
  assert.match(body.textContent, /입력 파일 확인 중/);
});

test('per-test verification keeps execution count and ordered testcase verdicts', () => {
  const body = render(cases, {
    contestId: 'contest',
    problemId: 'problem',
    submissionId: 'submission-first',
    token: 'synthetic',
    expectedStatus: 'accepted',
    data: {
      execution: {
        total: 2,
        completed: 1,
        full_suite_complete: false,
        observed_statuses: ['accepted'],
        runtime_ms: 12,
        memory_kb: 1024,
        testcase_version: 1,
      },
      testcases: [
        { index: 1, final_status: 'accepted', runtime_ms: 12, memory_kb: 1024 },
      ],
    },
  });
  assert.match(body.textContent, /1 \/ 2/);
  assert.equal(
    body.querySelectorAll('button[aria-label^="테스트 #"]').length,
    2,
  );
  assert.match(
    body.querySelector('button[aria-label^="테스트 #1"]').textContent,
    /AC/,
  );
  assert.match(
    body.querySelector('button[aria-label^="테스트 #2"]').textContent,
    /대기/,
  );
});
