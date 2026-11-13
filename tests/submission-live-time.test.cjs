const { test, after } = require('node:test');
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
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const cache = new Map();
const realAliases = new Set([
  '@/shared/hooks/useAutoRefresh',
  '@/shared/lib/dateTime',
  '@/shared/lib/formatters',
  '@/domains/submissionScoreboard/submissionTime',
  '@/domains/submissionScoreboard/languageLabel',
  '@/domains/identityAccess/staffDisplay',
]);

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === '@tanstack/react-query') {
      return {
        useQuery: () => {
          throw new Error('Table clocks must not fetch data');
        },
      };
    }
    if (!id.startsWith('@/')) return native(id);
    if (!realAliases.has(id)) {
      return new Proxy(
        { __esModule: true },
        { get: (target, name) => target[name] ?? (() => null) },
      );
    }
    const relativeFile = ['.ts', '.tsx']
      .map((ext) => id.slice(2) + ext)
      .find((file) => fs.existsSync(path.resolve(__dirname, '../src', file)));
    return source(relativeFile);
  };
  cache.set(filename, loaded);
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  // Render the production tables without mounting authenticated page shells.
  if (relative === 'pages/operator/OperatorSubmissionsPage.tsx') {
    code += '\nmodule.exports.Table = OperatorSubmissionsTable;';
  }
  if (relative === 'pages/admin/AdminJudgePage.tsx') {
    code += '\nmodule.exports.Rows = SubmissionRows;';
  }
  loaded._compile(code, filename);
  return loaded.exports;
}

const { isRecentSubmission } = source(
  'domains/submissionScoreboard/submissionTime.ts',
);
const { formatRelativeTime } = source('shared/lib/dateTime.ts');
const ParticipantTable = source(
  'components/contest/submissions/ContestSubmissionsTable.tsx',
).default;
const OperatorTable = source(
  'pages/operator/OperatorSubmissionsPage.tsx',
).Table;
const AdminRows = source('pages/admin/AdminJudgePage.tsx').Rows;
const epoch = Date.parse('2026-11-13T06:00:00Z');
const isoAtAge = (age) => new Date(epoch - age).toISOString();
const submission = (id, age) => ({
  submission_id: id,
  submitted_at: isoAtAge(age),
  problem_id: 'problem-one',
  problem_code: 'A',
  problem_title: '두 수 더하기',
  team_name: '테스트 팀',
  language: 'cpp17',
  status: 'accepted',
  runtime_ms: 12,
  memory_kb: 2048,
  source_code_length: 123,
});

test('recent highlighting uses the submission instant, not the time a page or result loaded', () => {
  assert.equal(isRecentSubmission(isoAtAge(0), epoch), true);
  assert.equal(isRecentSubmission(isoAtAge(59_999), epoch), true);
  assert.equal(isRecentSubmission(isoAtAge(60_000), epoch), false);
  assert.equal(isRecentSubmission(isoAtAge(86_400_000), epoch), false);
  assert.equal(isRecentSubmission(isoAtAge(-1_000), epoch), false);
  for (const value of [undefined, null, '', 'invalid']) {
    assert.equal(isRecentSubmission(value, epoch), false);
  }
  assert.equal(formatRelativeTime('invalid', epoch), '-');
});

for (const view of ['participant', 'operator', 'admin']) {
  test(`${view} submissions tick without a refetch and lose their highlight after one minute`, async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const timeouts = new Map();
    const intervals = new Map();
    let timerId = 0;
    const originals = {
      now: Date.now,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
    };
    let now = epoch;
    Date.now = () => now;
    window.setTimeout = (callback) => {
      timeouts.set(++timerId, callback);
      return timerId;
    };
    window.clearTimeout = (id) => timeouts.delete(id);
    window.setInterval = (callback, delay) => {
      intervals.set(++timerId, { callback, delay });
      return timerId;
    };
    window.clearInterval = (id) => intervals.delete(id);
    const rows = [
      submission('recent', 10_000),
      submission('boundary', 59_000),
      submission('old', 180_000),
    ];
    const noAction = () => {};
    const renderTable = () =>
      view === 'participant'
        ? h(ParticipantTable, { contestId: 'contest-one', submissions: rows })
        : view === 'operator'
          ? h(OperatorTable, {
              submissions: rows,
              problemById: new Map(),
              retryPending: false,
              onSelectOwner: noAction,
              onSelectProblem: noAction,
              onSelectSubmission: noAction,
            })
          : h(
              'table',
              null,
              h(AdminRows, {
                entries: rows.map((item) => ({ submission: item })),
                selectedSubmissionId: '',
                onSelect: noAction,
              }),
            );
    try {
      await act(() => root.render(h(MemoryRouter, null, renderTable())));
      await act(() => {
        for (const [id, callback] of [...timeouts]) {
          timeouts.delete(id);
          callback();
        }
      });
      assert.equal(intervals.size, 1, 'Use one UI clock for the entire table');
      const tick = [...intervals.values()][0];
      assert.equal(tick.delay, 1000);
      const times = () => [...host.querySelectorAll('time')];
      const highlights = () => [
        ...host.querySelectorAll('tr[data-recent-submission="true"]'),
      ];
      assert.deepEqual(
        times().map((node) => node.textContent),
        ['10초 전', '59초 전', '3분 전'],
      );
      assert.equal(highlights().length, 2);
      assert.equal(times()[0].getAttribute('datetime'), rows[0].submitted_at);
      assert.ok(
        times()[0].title,
        'Keep the absolute submission time accessible',
      );
      now += 1000;
      await act(() => tick.callback());
      assert.deepEqual(
        times().map((node) => node.textContent),
        ['11초 전', '1분 전', '3분 전'],
      );
      assert.equal(highlights().length, 1);
      // A throttled/background timer catches up to wall-clock time on return.
      now += 120_000;
      await act(() => tick.callback());
      assert.deepEqual(
        times().map((node) => node.textContent),
        ['2분 전', '3분 전', '5분 전'],
      );
      assert.equal(highlights().length, 0);
      assert.equal(
        host.querySelectorAll('tr[data-recent-submission]').length,
        3,
      );
    } finally {
      await act(() => root.unmount());
      assert.equal(intervals.size, 0, 'Unmount clears the UI clock');
      Date.now = originals.now;
      window.setTimeout = originals.setTimeout;
      window.clearTimeout = originals.clearTimeout;
      window.setInterval = originals.setInterval;
      window.clearInterval = originals.clearInterval;
      host.remove();
    }
  });
}

after(() => {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
