const { Response, ReadableStream, TextEncoder, DOMException } = globalThis;
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const file = path.resolve(__dirname, '../src/shared/lib/largeText.ts');
const m = new Module(file, module);
m.paths = module.paths;
m._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  file,
);
const { textPreview, responsePreview, sourceFileText } = m.exports;
test('Huge lines and hundreds of thousands of rows are bounded before rendering', () => {
  const one = 'x'.repeat(1000000);
  const lines = 'x\n'.repeat(200000);
  assert.equal(textPreview(one).text.length, 16384);
  assert.equal(textPreview(one).truncated, true);
  assert.ok(textPreview(lines).text.length <= 10000);
  assert.equal(textPreview(lines).truncated, true);
  assert.deepEqual(textPreview('한글\nnormal\n'), {
    text: '한글\nnormal\n',
    truncated: false,
    binary: false,
  });
  assert.equal(one.length, 1000000);
});
test('Ignored ranges cancel the stream after the bounded prefix, with no response.text call', async () => {
  let cancelled = false,
    pulls = 0;
  const response = new Response(
    new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new TextEncoder().encode('abcdefghij'));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { 'Content-Length': '100000000' } },
  );
  response.text = () => {
    throw Error('Full read is forbidden');
  };
  const result = await responsePreview(response, 5);
  assert.equal(result.text, 'abcde');
  assert.equal(result.truncated, true);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 2);
});
test('UTF8 byte boundaries, binary data, and empty range responses are handled explicitly', async () => {
  const utf = await responsePreview(
    new Response(new TextEncoder().encode('가나다')),
    4,
  );
  assert.equal(utf.text, '가');
  assert.equal(utf.binary, false);
  assert.equal(utf.truncated, true);
  assert.equal(
    (await responsePreview(new Response(new Uint8Array([65, 0, 66])))).binary,
    true,
  );
  assert.deepEqual(
    await responsePreview(
      new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */0' },
      }),
    ),
    { text: '', truncated: false, binary: false },
  );
});
test('Cancelled fetches and oversized source files never silently become empty or partial source', async () => {
  let read = false;
  await assert.rejects(
    sourceFileText({
      size: 100000000,
      text: async () => {
        read = true;
        return 'bad';
      },
    }),
  );
  assert.equal(read, false);
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.error(new DOMException('cancelled', 'AbortError'));
      },
    }),
  );
  await assert.rejects(responsePreview(response), { name: 'AbortError' });
});

test('Execution source reads remain complete; preview-only clipping never changes the submitted code', async () => {
  const source = 'x'.repeat(50000);
  const result = await responsePreview(new Response(source), 262144, false);
  assert.equal(result.text, source);
  assert.equal(result.truncated, false);
});
