const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const process = require('node:process');
const ts = require('typescript');

const previousTimezone = process.env.TZ;
process.env.TZ = 'Asia/Seoul';
after(() => {
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
});

const filename = path.resolve(__dirname, '../src/shared/lib/dateTime.ts');
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const { dateTimeLocalToIso, dateTimeLocalValue } = loaded.exports;

test('incomplete local date drafts never throw or produce a timestamp', () => {
  for (const value of [
    '',
    'invalid',
    '2026-11-14',
    '2026-11-14T',
    '2026-11-14T0',
    '2026-11-14T00:',
    '2026-11-14T00:0',
  ]) {
    assert.equal(dateTimeLocalToIso(value), null, value);
  }
  assert.equal(dateTimeLocalValue('invalid'), '');
  assert.equal(dateTimeLocalValue(''), '');
});

test('invalid calendar values are rejected instead of silently rolling forward', () => {
  for (const value of [
    '0000-01-01T00:00',
    '2026-02-29T00:00',
    '2026-11-31T00:00',
    '2026-11-14T24:00',
    '2026-11-14T00:60',
    '2026-11-14T00:00:60',
  ]) {
    assert.equal(dateTimeLocalToIso(value), null, value);
  }
  assert.equal(
    dateTimeLocalToIso('2028-02-29T00:00'),
    '2028-02-28T15:00:00.000Z',
  );
});

test('KST midnight and optional seconds retain their exact instant', () => {
  assert.equal(
    dateTimeLocalToIso('2026-11-14T00:00'),
    '2026-11-13T15:00:00.000Z',
  );
  assert.equal(
    dateTimeLocalValue('2026-11-13T15:00:00.000Z'),
    '2026-11-14T00:00',
  );
  assert.equal(
    dateTimeLocalToIso('2026-11-14T00:00:37.125'),
    '2026-11-13T15:00:37.125Z',
  );
});
