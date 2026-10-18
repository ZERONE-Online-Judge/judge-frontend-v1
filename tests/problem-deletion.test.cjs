const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function source(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (id) => {
    assert.ok(id in mocks, `Unexpected runtime dependency: ${id}`);
    return mocks[id];
  };
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}

test('problem deletion only requests rejudging cancellation after explicit opt-in', async () => {
  const requests = [];
  const api = source('domains/problemManagement/api.ts', {
    '@/shared/api/client': {
      apiRequest: async (...args) => requests.push(args),
    },
    '@/shared/lib/files': {},
  });
  await api.deleteOperatorProblem('contest', 'problem', 'token');
  await api.deleteOperatorProblem('contest', 'problem', 'token', true);
  assert.deepEqual(requests, [
    [
      '/operator/contests/contest/problems/problem',
      'token',
      { method: 'DELETE' },
    ],
    [
      '/operator/contests/contest/problems/problem?cancel_rejudging=true',
      'token',
      { method: 'DELETE' },
    ],
  ]);
});

test('rejudging and deletion errors explain the required action', () => {
  const { ApiClientError, formatApiError } = source('shared/api/errors.ts');
  for (const [status, code, message] of [
    [
      409,
      'rejudging_conflict',
      '이 문제의 재채점 작업을 먼저 반영하거나 취소해 주세요.',
    ],
    [
      403,
      'problem_deletion_rejudging_permission',
      '재채점 권한이 있는 운영자가 작업을 취소한 뒤 삭제해 주세요.',
    ],
  ]) {
    assert.equal(
      formatApiError(
        new ApiClientError(status, code, message),
        '문제 삭제에 실패했습니다',
      ),
      `문제 삭제에 실패했습니다: ${message}`,
    );
  }
});
