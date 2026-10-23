const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/shared/lib/loginRedirect.ts');
const loaded = new Module(file, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);
const { safeLoginRedirectTarget, contestLoginPath, readLoginRedirectTarget } =
  loaded.exports;

test('contest login retains the full internal URL without an extra blocking dialog', () => {
  const target = '/contests/example/problems?divisionId=A&language=ko#solution';
  const login = new URL(contestLoginPath('example', target), 'https://zoj.kr');
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('contestId'), 'example');
  assert.equal(login.searchParams.has('reason'), false);
  assert.equal(readLoginRedirectTarget(login.searchParams), target);
  assert.equal(
    readLoginRedirectTarget(new URLSearchParams({ next: target })),
    target,
  );
  assert.equal(
    new URL(contestLoginPath('한 글/#'), 'https://zoj.kr').searchParams.get(
      'moveTo',
    ),
    '/contests/' + encodeURIComponent('한 글/#'),
  );
});

test('external URLs and login loops cannot become return destinations', () => {
  for (const value of [
    null,
    '',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/\nevil.test',
    '/\tevil.test',
    '/login',
    '/LOGIN',
    '/%4cogin',
    '/login?moveTo=/contests/x',
    '/x/../login',
    '/x/..//evil.test',
    '/%2e%2e//evil.test',
    '/%2f/evil.test',
    '/%5cevil.test',
    '/%6cogin',
    '/bad%ZZ',
  ]) {
    assert.equal(safeLoginRedirectTarget(value), null, String(value));
  }
  assert.equal(
    readLoginRedirectTarget(
      new URLSearchParams({ moveTo: '/\\evil.test', next: '/contests/safe' }),
    ),
    '/contests/safe',
  );
});

test('normalization preserves internal queries and fragments', () => {
  assert.equal(
    safeLoginRedirectTarget('/contests/other/../example?source=share#A'),
    '/contests/example?source=share#A',
  );
});
