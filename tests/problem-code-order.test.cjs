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

test('problem codes use natural numeric ordering, ignore display order and tie only on problem ID', () => {
  const original = global.structuredClone(rows);
  assert.deepEqual(
    sortProblemsByCode(rows).map((problem) => problem.problem_id),
    ['a', 'c', 'z', 'b'],
  );
  assert.deepEqual(rows, original);
  assert.deepEqual(
    ['A2', 'A10', 'A1', 'a', '가', '\uE000', '😀'].sort(compareProblemCodes),
    ['A1', 'A2', 'A10', 'a', '가', '\uE000', '😀'],
  );
});

test('each ASCII numeric run is compared before later segments and leading-zero ties use the raw code', () => {
  assert.deepEqual(['A10', 'A2B10', 'A2B2'].sort(compareProblemCodes), [
    'A2B2',
    'A2B10',
    'A10',
  ]);
  assert.deepEqual(['A02B10', 'A2B2'].sort(compareProblemCodes), [
    'A2B2',
    'A02B10',
  ]);
  assert.deepEqual(['A2', 'A02', 'A002', 'A0002'].sort(compareProblemCodes), [
    'A0002',
    'A002',
    'A02',
    'A2',
  ]);
  assert.deepEqual(['A00', 'A000', 'A0', 'A1'].sort(compareProblemCodes), [
    'A0',
    'A00',
    'A000',
    'A1',
  ]);
});

test('numeric code ordering handles values beyond Number precision and thousands of digits', () => {
  assert.deepEqual(
    ['P09007199254740993', 'P9007199254740992'].sort(compareProblemCodes),
    ['P9007199254740992', 'P09007199254740993'],
  );
  const shorter = 'P' + '9'.repeat(5000);
  const longer = 'P1' + '0'.repeat(5000);
  assert.deepEqual([longer, shorter].sort(compareProblemCodes), [
    shorter,
    longer,
  ]);
  const lower = 'P1' + '0'.repeat(4999);
  const higherWithZeros = 'P01' + '0'.repeat(4998) + '1';
  assert.deepEqual([higherWithZeros, lower].sort(compareProblemCodes), [
    lower,
    higherWithZeros,
  ]);
});

test('non-ASCII characters retain ordinal order and only ASCII digit runs receive numeric comparison', () => {
  assert.deepEqual(
    ['😀10', '가10', '\uE0002', '가2', '😀2'].sort(compareProblemCodes),
    ['가2', '가10', '\uE0002', '😀2', '😀10'],
  );
  assert.deepEqual(['A２', 'A１０', 'A10', 'A2'].sort(compareProblemCodes), [
    'A2',
    'A10',
    'A１０',
    'A２',
  ]);
  assert.deepEqual(['a2', 'A10', 'a10', 'A2'].sort(compareProblemCodes), [
    'A2',
    'A10',
    'a2',
    'a10',
  ]);
});

test('identical-code problem IDs remain ordinal instead of receiving numeric sorting', () => {
  const ties = [
    { problem_code: 'A2', problem_id: 'id2' },
    { problem_code: 'A2', problem_id: 'id10' },
    { problem_code: 'A02', problem_id: 'z' },
    { problem_code: 'A2', problem_id: 'a' },
  ];
  assert.deepEqual(
    sortProblemsByCode(ties).map(
      (problem) => `${problem.problem_code}/${problem.problem_id}`,
    ),
    ['A02/z', 'A2/a', 'A2/id10', 'A2/id2'],
  );
});

test('participant, public and operator problem APIs return the same immutable natural code order', async () => {
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
      ['a', 'c', 'z', 'b'],
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
