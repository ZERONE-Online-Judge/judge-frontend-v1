const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;
const base = path.resolve(__dirname, '../src');
const cache = new Map();
function load(relative) {
  const file = path.resolve(base, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.endsWith('.css')
      ? {}
      : id.startsWith('.')
        ? load(
            ['.tsx', '.ts']
              .map((ext) => path.resolve(path.dirname(file), id + ext))
              .find(fs.existsSync),
          )
        : native(id);
  cache.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const { FileDropZone } = load('shared/ui/FileDropZone.tsx');
const { useFileDrop } = load('shared/hooks/useFileDrop.ts');
const mounted = [];
async function mount(element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const view = {
    host,
    render: async (element) => act(async () => root.render(element)),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
  await view.render(element);
  mounted.push(view);
  return view;
}
afterEach(async () => {
  for (const view of mounted.splice(0)) await view.close();
});
after(() => dom.window.close());
const file = (name, type = '') => new window.File(['contents'], name, { type });
function transfer(files = [], extra = {}) {
  return {
    types: ['Files'],
    files,
    items: files.map((value) => ({ kind: 'file', getAsFile: () => value })),
    dropEffect: 'none',
    ...extra,
  };
}
async function drag(target, type, data) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
const field = (props = {}, child) =>
  h(
    FileDropZone,
    { onFiles() {}, label: '업로드', ...props },
    child || h('input', { type: 'file', 'aria-label': '파일 선택' }),
  );
const zone = (view) => view.host.querySelector('[data-file-drop-zone]');

test('file hover works before protected file data is readable and survives child transitions', async () => {
  const view = await mount(field({}, h('div', null, h('span', null, 'child'))));
  const target = zone(view),
    child = target.querySelector('span');
  assert.equal(
    (await drag(target, 'dragenter', transfer())).defaultPrevented,
    true,
  );
  await drag(child, 'dragenter', transfer());
  await drag(child, 'dragleave', transfer());
  assert.equal(target.dataset.fileDropActive, 'true');
  const data = transfer();
  await drag(target, 'dragover', data);
  assert.equal(data.dropEffect, 'copy');
  await drag(target, 'dragleave', transfer());
  assert.equal(target.dataset.fileDropActive, undefined);
});

test('accepted multiple files are delivered intact and report their names', async () => {
  const files = [file('01.in'), file('01.out')];
  let received;
  const view = await mount(
    field({
      multiple: true,
      accept: '.in,.out',
      onFiles: (value) => {
        received = value;
      },
    }),
  );
  const event = await drag(zone(view), 'drop', transfer(files));
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(received, files);
  assert.match(
    view.host.querySelector('[role="status"]').textContent,
    /01.in, 01.out/,
  );
});

test('single-file fields reject a batch without silently discarding files', async () => {
  let called = 0;
  const view = await mount(field({ onFiles: () => called++ }));
  await drag(zone(view), 'drop', transfer([file('a.zip'), file('b.zip')]));
  assert.equal(called, 0);
  assert.match(
    view.host.querySelector('[role="alert"]').textContent,
    /파일 하나/,
  );
});

test('accept supports extensions, exact MIME and MIME groups, case-insensitively', async () => {
  const received = [];
  const view = await mount(
    field({
      accept: '.zip,application/pdf,image/*',
      onFiles: (files) => received.push(files[0].name),
    }),
  );
  for (const value of [
    file('UPPER.ZIP'),
    file('doc', 'application/pdf'),
    file('pic', 'image/png'),
  ])
    await drag(zone(view), 'drop', transfer([value]));
  assert.deepEqual(received, ['UPPER.ZIP', 'doc', 'pic']);
});

test('invalid member rejects the whole batch and a later valid drop clears the error', async () => {
  let called = 0;
  const view = await mount(
    field({ accept: '.in,.out', multiple: true, onFiles: () => called++ }),
  );
  await drag(zone(view), 'drop', transfer([file('01.in'), file('oops.exe')]));
  assert.equal(called, 0);
  assert.match(
    view.host.querySelector('[role="alert"]').textContent,
    /oops.exe/,
  );
  await drag(zone(view), 'drop', transfer([file('01.in')]));
  assert.equal(called, 1);
  assert.equal(view.host.querySelector('[role="alert"]'), null);
});

test('directory and unreadable drops give feedback without invoking upload', async () => {
  let called = 0;
  const view = await mount(field({ onFiles: () => called++ }));
  await drag(
    zone(view),
    'drop',
    transfer([], {
      items: [
        { kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) },
      ],
    }),
  );
  assert.match(
    view.host.querySelector('[role="alert"]').textContent,
    /폴더 대신/,
  );
  await drag(zone(view), 'drop', transfer());
  assert.match(
    view.host.querySelector('[role="alert"]').textContent,
    /읽지 못/,
  );
  assert.equal(called, 0);
});

test('disabled zones consume file navigation and never upload or highlight', async () => {
  let called = 0;
  const view = await mount(field({ disabled: true, onFiles: () => called++ }));
  const data = transfer([file('a.zip')]);
  await drag(zone(view), 'dragenter', data);
  await drag(zone(view), 'dragover', data);
  assert.equal(data.dropEffect, 'none');
  assert.equal(zone(view).dataset.fileDropActive, undefined);
  assert.equal((await drag(zone(view), 'drop', data)).defaultPrevented, true);
  assert.equal(called, 0);
});

test('text, URLs and internal problem moves are not intercepted', async () => {
  const view = await mount(field());
  for (const types of [
    ['text/plain'],
    ['text/uri-list'],
    ['application/x-zoj-problem'],
  ]) {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      assert.equal(
        (await drag(zone(view), type, transfer([], { types })))
          .defaultPrevented,
        false,
      );
    }
  }
});

test('an async upload has a synchronous lock and unlocks when complete', async () => {
  let called = 0,
    finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const view = await mount(
    field({
      onFiles: () => {
        called++;
        return pending;
      },
    }),
  );
  await drag(zone(view), 'drop', transfer([file('a.zip')]));
  await drag(zone(view), 'drop', transfer([file('b.zip')]));
  assert.equal(called, 1);
  await act(async () => finish());
  await drag(zone(view), 'drop', transfer([file('c.zip')]));
  assert.equal(called, 2);
});

test('upload rejection is shown and subsequent drops remain available', async () => {
  let reject;
  const view = await mount(
    field({
      onFiles: () => {
        throw new Error('업로드 실패');
      },
      onReject: (message) => {
        reject = message;
      },
    }),
  );
  await drag(zone(view), 'drop', transfer([file('a.zip')]));
  assert.equal(reject, '업로드 실패');
  assert.match(
    view.host.querySelector('[role="alert"]').textContent,
    /업로드 실패/,
  );
});

test('nested capture owner skips the child zone so only the intended field uploads', async () => {
  let outer = 0,
    inner = 0;
  function Outer() {
    const { dropProps } = useFileDrop({ onFiles: () => outer++ });
    return h(
      'div',
      { 'data-file-drop-zone': '', onDropCapture: dropProps.onDrop },
      field({ onFiles: () => inner++ }),
    );
  }
  const view = await mount(h(Outer));
  await drag(
    view.host.querySelectorAll('[data-file-drop-zone]')[1],
    'drop',
    transfer([file('a.zip')]),
  );
  assert.equal(inner, 1);
  assert.equal(outer, 0);
});

test('native picker remains accessible and clears previous drop feedback', async () => {
  let picked = 0;
  const view = await mount(
    field(
      {},
      h('input', {
        type: 'file',
        'aria-label': '파일 선택',
        onChange: () => picked++,
      }),
    ),
  );
  await drag(zone(view), 'drop', transfer([file('a.zip')]));
  assert.ok(view.host.querySelector('[role="status"]'));
  const input = view.host.querySelector('input');
  await act(async () =>
    input.dispatchEvent(new window.Event('change', { bubbles: true })),
  );
  assert.equal(picked, 1);
  assert.equal(view.host.querySelector('[role="status"]'), null);
});

test('page guard protects off-zone drops while mounted and releases its listeners', async () => {
  const one = await mount(field()),
    two = await mount(field());
  assert.equal(
    (await drag(document.body, 'drop', transfer([file('a.zip')])))
      .defaultPrevented,
    true,
  );
  await one.close();
  mounted.splice(mounted.indexOf(one), 1);
  assert.equal(
    (await drag(document.body, 'dragover', transfer())).defaultPrevented,
    true,
  );
  await two.close();
  mounted.splice(mounted.indexOf(two), 1);
  assert.equal(
    (await drag(document.body, 'drop', transfer([file('a.zip')])))
      .defaultPrevented,
    false,
  );
});

test('window cancellation clears drag feedback', async () => {
  const view = await mount(field());
  await drag(zone(view), 'dragenter', transfer());
  await act(async () => window.dispatchEvent(new window.Event('blur')));
  assert.equal(zone(view).dataset.fileDropActive, undefined);
});
