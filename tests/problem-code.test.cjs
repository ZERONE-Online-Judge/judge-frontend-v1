const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.require = (id) => {
    assert.ok(id in mocks, `Unexpected dependency: ${id}`);
    return mocks[id];
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const codes = load('domains/problemManagement/problemCode.ts');

test('problem codes normalize only ASCII letters and accept up to sixteen alphanumeric characters', () => {
  assert.equal(codes.normalizeProblemCode('a1b2z'), 'A1B2Z');
  for (const code of ['A', '1', 'A1', 'zero1', '1234567890123456'])
    assert.equal(codes.problemCodeError(code), '', code);
  for (const code of [
    '',
    'A'.repeat(17),
    '한글',
    'A B',
    ' A',
    'A-',
    'A_',
    'A.',
    'A\n',
    '😀',
  ])
    assert.ok(codes.problemCodeError(code), code);
});

test('Unicode case expansion and full-width characters cannot become valid problem codes', () => {
  for (const code of ['ß', 'ı', 'ſ', 'ａｂ', '１２', 'A가', 'é']) {
    assert.equal(codes.normalizeProblemCode(code), code);
    assert.ok(codes.problemCodeError(codes.normalizeProblemCode(code)), code);
  }
});

test('copied problem numbers are uppercase, unique without punctuation, and fit the length limit', () => {
  const existing = new Set(['a', 'acopy', 'ACOPY2']);
  assert.equal(codes.uniqueProblemCode('a', existing), 'ACOPY3');
  assert.equal(existing.size, 3);
  const base = 'A'.repeat(16);
  const first = codes.uniqueProblemCode(base, new Set([base]));
  const second = codes.uniqueProblemCode(
    base,
    new Set([base, first.toLowerCase()]),
  );
  assert.notEqual(first, second);
  for (const code of [
    first,
    second,
    codes.uniqueProblemCode('기존-번호', new Set()),
  ]) {
    assert.equal(codes.problemCodeError(code), '');
    assert.match(code, /^[A-Z0-9]{1,16}$/);
  }
});

test('ZIP final registration rejects invalid codes before a request and sends normalized valid codes', async () => {
  const requests = [];
  const archive = load('domains/problemManagement/archive.ts', {
    './problemCode': codes,
    '@/shared/api/client': {
      apiRequest: (...args) => {
        requests.push(args);
        return Promise.resolve({});
      },
    },
  });
  for (const code of ['한글', 'A-1', 'ß', 'A'.repeat(17), ' A'])
    assert.throws(() =>
      archive.importProblemArchive(
        'contest',
        'token',
        'file',
        'division',
        code,
      ),
    );
  assert.equal(requests.length, 0);
  await archive.importProblemArchive(
    'contest',
    'token',
    'file',
    'division',
    'a1',
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0][0], /problem_code=A1/);
});
