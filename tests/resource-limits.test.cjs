const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(
  __dirname,
  '../src/domains/problemManagement/resourceLimits.ts',
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded.require = (id) => {
  assert.equal(id, '@/domains/submissionScoreboard/languageLabel');
  return { judgeLanguageLabel: (language) => language };
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
const { problemTimeLimitLabel, problemMemoryLimitLabel } = loaded.exports;
const options = {
  includeAutomaticAdjustments: true,
  markAutomaticAdjustments: true,
};
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
  const problem = {
    ...base,
    language_resource_limits: {
      pypy3: { time_limit_ms: 750 },
      kotlin: { memory_limit_mb: 384 },
    },
  };
  const time = problemTimeLimitLabel(problem, options);
  const memory = problemMemoryLimitLabel(problem, options);
  assert.ok(time.includes('pypy3 : 750ms'));
  assert.ok(!time.includes('pypy3 : 750ms 자동 보정'));
  assert.ok(time.includes('kotlin : 3s 자동 보정'));
  assert.ok(memory.includes('pypy3 : 640MB 자동 보정'));
  assert.ok(memory.includes('kotlin : 384MB'));
  assert.ok(!memory.includes('kotlin : 384MB 자동 보정'));
});

test('Disabling correction follows base changes and preserves explicit values', () => {
  const problem = {
    ...base,
    language_resource_limits: {
      pypy3: { disable_auto_adjustment: true },
      kotlin: { disable_auto_adjustment: true, time_limit_ms: 700 },
    },
  };
  assert.doesNotMatch(problemTimeLimitLabel(problem, options), /pypy3/);
  assert.match(problemTimeLimitLabel(problem, options), /kotlin : 700ms/);
  assert.doesNotMatch(
    problemMemoryLimitLabel(problem, options),
    /pypy3|kotlin/,
  );
  assert.doesNotMatch(
    problemTimeLimitLabel({ ...problem, time_limit_ms: 2000 }, options),
    /pypy3/,
  );
});

test('Language limit editor preserves manual values when disabling correction', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(
    __dirname,
    '../src/components/operator/LanguageResourceLimitsEditor.tsx',
  );
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
  const markup = renderToStaticMarkup(
    React.createElement(mod.exports.default, {
      rows: [
        {
          language: 'pypy3',
          label: 'PyPy',
          corrected: true,
          hint: '직접 지정 700ms',
        },
      ],
      values: {
        pypy3: {
          timeLimitMs: '700',
          memoryLimitMb: '',
          disableAutoAdjustment: true,
        },
      },
      baseTime: '1000',
      baseMemory: '256',
      onChange() {},
      onNormalize() {},
    }),
  );
  assert.match(markup, /PyPy 자동 보정 끄기/);
  assert.match(markup, /checked=""/);
  assert.match(markup, /value="700"/);
  assert.match(markup, /placeholder="256"/);
});
