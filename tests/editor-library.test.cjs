const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const filename = path.resolve(
  __dirname,
  '../src/components/operator/EditorTransferLink.tsx',
);
const loaded = new Module(filename, module);
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const native = loaded.require.bind(loaded);
loaded.require = (id) =>
  id === '@/components/common/InterfaceIcon'
    ? { __esModule: true, default: () => null }
    : native(id);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  filename,
);
const Entry = loaded.exports.default;
after(() => dom.window.close());
test('Judge forwards destination context to the single Editor flow without opening a local import modal', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(Entry, {
        contestId: 'contest-123',
        activeDivisionId: 'division-456',
      }),
    ),
  );
  const link = host.querySelector('a');
  assert.equal(
    link.href,
    'https://editor.zoj.kr/problems/zoj-transfer?contest=contest-123&division=division-456',
  );
  assert.equal(link.target, '_blank');
  assert.ok(link.relList.contains('noopener'));
  assert.equal(host.querySelector('button, dialog'), null);
  await act(async () =>
    root.render(
      React.createElement(Entry, {
        contestId: 'contest-123',
        activeDivisionId: '',
      }),
    ),
  );
  assert.equal(
    host.querySelector('a').href,
    'https://editor.zoj.kr/problems/zoj-transfer?contest=contest-123',
  );
  await act(async () => root.unmount());
  host.remove();
});
