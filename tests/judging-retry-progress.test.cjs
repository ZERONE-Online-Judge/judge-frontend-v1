const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === './SubmissionScoreDetails')
      return { __esModule: true, default: () => null };
    if (!id.startsWith('@/')) return native(id);
    if (id === '@/domains/problemManagement/useVerificationCodeRuns')
      return { isVerificationRunning: (row) => row.stage === 'judging' };
    if (id === '@/domains/problemManagement/verificationDetails')
      return { parseVerificationDetails: () => ({}) };
    if (id === '@/components/contest/submissions/SubmissionScoreDetails')
      return { __esModule: true, default: () => null };
    const supported = [
      '@/domains/submissionScoreboard/status',
      '@/domains/submissionScoreboard/scoring',
      '@/shared/ui/ProgressMotion',
      '@/shared/hooks/useAnimatedValue',
      '@/shared/hooks/useDocumentVisibility',
    ];
    if (!supported.includes(id))
      return new Proxy(
        { __esModule: true, default: () => null },
        { get: (target, name) => target[name] ?? (() => null) },
      );
    const relative = id.slice(2);
    return source(
      relative +
        (fs.existsSync(path.resolve(__dirname, '../src', relative + '.tsx'))
          ? '.tsx'
          : '.ts'),
    );
  };
  modules.set(filename, loaded);
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  if (relative === 'pages/contest/ContestProblemDetailPage.tsx')
    code += '\nmodule.exports.MockJudgeResult = MockJudgeResult;';
  if (relative === 'components/operator/VerificationCodeSection.tsx')
    code +=
      '\nmodule.exports.VerificationResultSummary = VerificationResultSummary;';
  loaded._compile(code, filename);
  return loaded.exports;
}
const { submissionProgressText, submissionProgressPercent } = source(
  'domains/submissionScoreboard/status.ts',
);
const OperatorBadge = source('shared/ui/SubmissionStatusBadge.tsx').default;
const ParticipantBadge = source(
  'components/contest/submissions/ContestSubmissionResultBadge.tsx',
).default;
const MockBadge = source(
  'pages/contest/ContestProblemDetailPage.tsx',
).MockJudgeResult;
const pending = {
  status: 'judging',
  progress_current: 4,
  progress_total: 15,
  progress_phase: 'tle_confirmation',
};
const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const text = (html) => html.replace(/<[^>]*>/g, '');

test('retry phase is descriptive and leaves the actual progress unchanged', () => {
  assert.equal(submissionProgressPercent(pending), 27);
  assert.equal(submissionProgressText(pending), '시간 초과 재확인 중 · 27%');
  assert.equal(
    submissionProgressText({ ...pending, progress_phase: null }),
    '4/15 · 27%',
  );
  assert.equal(
    submissionProgressText({
      status: 'judging',
      progress_phase: 'tle_confirmation',
    }),
    '시간 초과 재확인 중',
  );
  assert.equal(
    submissionProgressText({ ...pending, status: 'time_limit_exceeded' }),
    '',
  );
});

test('operator and compact badges show a single retry label and original counts', () => {
  const html = render(OperatorBadge, { submission: pending });
  assert.equal((html.match(/시간 초과 재확인 중/g) || []).length, 1);
  assert.match(text(html), /4\/15 · 27%/);
  assert.doesNotMatch(html, /8\/15|31%/);
  assert.match(
    render(OperatorBadge, { submission: pending, compact: true }),
    /시간 초과 재확인 중/,
  );
  assert.doesNotMatch(
    render(OperatorBadge, { submission: { ...pending, status: 'accepted' } }),
    /시간 초과 재확인 중/,
  );
});

test('participant retries retain confirmed progress with the shared motion', () => {
  const html = render(ParticipantBadge, {
    status: 'judging',
    submission: pending,
  });
  assert.match(text(html), /시간 초과 재확인 중 - 27%/);
  assert.doesNotMatch(html, /재확인 중 - 0%/);
  assert.doesNotMatch(
    render(ParticipantBadge, {
      status: 'accepted',
      submission: { ...pending, status: 'accepted' },
    }),
    /재확인/,
  );
});

test('mock judging uses the same retry description and keeps its progress', () => {
  const html = render(MockBadge, {
    result: {
      ...pending,
      progress_percent: 27,
      submitted_at: new Date().toISOString(),
    },
  });
  assert.match(html, /시간 초과 재확인 중/);
  assert.match(html, /width:27%/);
});

test('full verification progress shows retries with the same immutable testcase count', () => {
  const Summary = source(
    'components/operator/VerificationCodeSection.tsx',
  ).VerificationResultSummary;
  const html = render(Summary, {
    result: {
      stage: 'judging',
      submission: pending,
      execution: { completed: 4, total: 15, full_suite_complete: false },
    },
  });
  assert.match(text(html), /시간 초과 재확인 중 · 판정 확인 4 \/ 15개 · 27%/);
  assert.doesNotMatch(html, /판정 확인 8 \/ 15/);
});
