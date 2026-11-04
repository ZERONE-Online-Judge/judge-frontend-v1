const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
const rows = [
  {
    problem_id: 'z',
    division_id: 'first',
    problem_code: 'A2',
    display_order: 1,
  },
  {
    problem_id: 'b',
    division_id: 'last',
    problem_code: 'A10',
    display_order: 2,
  },
  {
    problem_id: 'c',
    division_id: 'last',
    problem_code: 'A1',
    display_order: 99,
  },
  {
    problem_id: 'a',
    division_id: 'first',
    problem_code: 'A1',
    display_order: 0,
  },
];
const requests = [];
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === '@/shared/api/client')
      return {
        API_BASE_URL: '/api',
        apiRequest: async (url, token) => {
          requests.push({ url, token });
          return rows;
        },
      };
    if (id.startsWith('@/')) return source(id.slice(2) + '.ts');
    return native(id);
  };
  cache.set(filename, loaded);
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
const { compareProblemCodes, sortProblemsByCode } = source(
  'domains/problemManagement/problemCodeOrder.ts',
);

test('problem codes use plain lexical ordering, ignore display order and tie only on problem ID', () => {
  const original = global.structuredClone(rows);
  assert.deepEqual(
    sortProblemsByCode(rows).map((problem) => problem.problem_id),
    ['a', 'c', 'b', 'z'],
  );
  assert.deepEqual(rows, original);
  assert.deepEqual(
    ['A2', 'A10', 'A1', 'a', '가', '\uE000', '😀'].sort(compareProblemCodes),
    ['A1', 'A10', 'A2', 'a', '가', '\uE000', '😀'],
  );
});

test('participant, public and operator problem APIs return the same immutable lexical order', async () => {
  const { getContestProblems, getDivisionProblems, getOperatorProblems } =
    source('domains/problemManagement/api.ts');
  const original = global.structuredClone(rows);
  for (const result of await Promise.all([
    getContestProblems('contest', 'public-token'),
    getDivisionProblems('contest', 'division', 'participant-token'),
    getOperatorProblems('contest', 'operator-token'),
  ])) {
    assert.deepEqual(
      result.map((problem) => problem.problem_id),
      ['a', 'c', 'b', 'z'],
    );
    assert.notEqual(result, rows);
  }
  assert.deepEqual(rows, original);
  assert.deepEqual(requests, [
    { url: '/contests/contest/problems', token: 'public-token' },
    {
      url: '/contests/contest/divisions/division/problems',
      token: 'participant-token',
    },
    { url: '/operator/contests/contest/problems', token: 'operator-token' },
  ]);
});
