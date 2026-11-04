const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.startsWith('.')
      ? source(
          path.relative(
            path.resolve(__dirname, '../src'),
            path.resolve(path.dirname(filename), id + '.ts'),
          ),
        )
      : native(id);
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
const { supportRoleFromAsset, testcaseSupportAssets, supportFileStatus } =
  source('domains/problemManagement/supportFiles.ts');
const asset = (name, role = 'package-resource') => ({
  asset_id: name,
  original_filename: name,
  storage_key: `contests/c/problems/p/package-files/${role}/${name}`,
  sha256: 'custom-content',
});

test('Polygon auxiliaries cannot replace the real testlib header in the support-file row', () => {
  const header = asset('testlib.h');
  const files = [
    header,
    asset('TESTLIB-LICENSE'),
    asset('editor-project.json'),
    asset('blob-snapshot.bin'),
    asset('polygon-statement-sections--korean--output.tex'),
  ];
  const original = global.structuredClone(files);
  assert.equal(testcaseSupportAssets(files).get('package-resource'), header);
  assert.deepEqual(files, original);
  for (const auxiliary of files.slice(1))
    assert.equal(supportRoleFromAsset(auxiliary), null);
});

test('a package containing only auxiliary resources has no testlib support asset', () => {
  const files = [asset('custom-helper.hpp'), asset('polygon-statement.tex')];
  assert.equal(testcaseSupportAssets(files).get('package-resource'), undefined);
  assert.deepEqual(
    supportFileStatus({
      role: 'package-resource',
      label: 'testlib.h',
      required: true,
      latest_filename: 'polygon-statement.tex',
      count: 2,
      status: 'ready',
    }),
    {
      role: 'package-resource',
      label: 'testlib.h',
      required: true,
      latest_filename: null,
      count: 0,
      status: 'missing',
    },
  );
});

test('custom testlib content and explicitly assigned custom validator and checker filenames remain usable', () => {
  const header = asset('testlib.h');
  const validator = asset('my-input-rules.cpp', 'validator');
  const checker = asset('compare-answers.cpp', 'checker');
  const chosen = testcaseSupportAssets([header, validator, checker]);
  assert.equal(chosen.get('package-resource'), header);
  assert.equal(chosen.get('validator'), validator);
  assert.equal(chosen.get('checker'), checker);
  assert.equal(
    supportRoleFromAsset({
      ...header,
      storage_key: 'contests/c/problems/p/assets/testlib.h',
    }),
    'package-resource',
  );
});

test('a genuine header status remains ready without inventing a different support file', () => {
  const status = {
    role: 'package-resource',
    label: 'testlib.h',
    required: true,
    latest_filename: 'testlib.h',
    count: 1,
    status: 'ready',
  };
  assert.equal(supportFileStatus(status), status);
});

test('header basenames accept both package path separators without accepting suffixed auxiliaries', () => {
  for (const name of ['include/testlib.h', 'include\\testlib.h']) {
    assert.equal(supportRoleFromAsset(asset(name)), 'package-resource');
    const status = {
      role: 'package-resource',
      label: 'testlib.h',
      required: true,
      latest_filename: name,
      count: 1,
      status: 'ready',
    };
    assert.equal(supportFileStatus(status), status);
  }
  for (const name of ['include/testlib.h.tex', 'include\\testlib.h.backup'])
    assert.equal(supportRoleFromAsset(asset(name)), null);
});
