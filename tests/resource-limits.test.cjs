const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/domains/problemManagement/resourceLimits.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded.require = (id) => {
  assert.equal(id, '@/domains/submissionScoreboard/languageLabel');
  return { judgeLanguageLabel: (language) => language };
};
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { problemTimeLimitLabel, problemMemoryLimitLabel } = loaded.exports;
const options = { includeAutomaticAdjustments: true, markAutomaticAdjustments: true };
const base = { time_limit_ms: 1000, memory_limit_mb: 256 };

test('participant limit labels include effective PyPy and Kotlin limits', () => {
  const time = problemTimeLimitLabel(base, options);
  const memory = problemMemoryLimitLabel(base, options);
  assert.ok(time.includes('pypy3 : 5s 자동 보정'));
  assert.ok(time.includes('kotlin : 3s 자동 보정'));
  assert.ok(memory.includes('pypy3 : 640MB 자동 보정'));
  assert.ok(memory.includes('kotlin : 528MB 자동 보정'));
  assert.equal(problemTimeLimitLabel(base), '1s');
  assert.equal(problemMemoryLimitLabel(base), '256MB');
});

test('partial language overrides replace only the specified field', () => {
  const problem = { ...base, language_resource_limits: {
    pypy3: { time_limit_ms: 750 }, kotlin: { memory_limit_mb: 384 },
  } };
  const time = problemTimeLimitLabel(problem, options);
  const memory = problemMemoryLimitLabel(problem, options);
  assert.ok(time.includes('pypy3 : 750ms'));
  assert.ok(!time.includes('pypy3 : 750ms 자동 보정'));
  assert.ok(time.includes('kotlin : 3s 자동 보정'));
  assert.ok(memory.includes('pypy3 : 640MB 자동 보정'));
  assert.ok(memory.includes('kotlin : 384MB'));
  assert.ok(!memory.includes('kotlin : 384MB 자동 보정'));
});
