const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://zoj.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const file = path.resolve(
  __dirname,
  '../src/components/operator/BoardWritingSettings.tsx',
);
const policyFile = path.resolve(
  __dirname,
  '../src/domains/serviceCommunication/boardPolicy.ts',
);
const policy = new Module(policyFile, module);
policy._compile(
  ts.transpileModule(fs.readFileSync(policyFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  policyFile,
);
const loaded = new Module(file, module);
loaded.require = (id) =>
  id === '@/domains/serviceCommunication/boardPolicy'
    ? policy.exports
    : id === '@/shared/ui/Select'
      ? {
          __esModule: true,
          default: ({ children, ...props }) => h('select', props, children),
        }
      : require(id);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText,
  file,
);
const Settings = loaded.exports.default;
const defaults = policy.exports.boardWritingSettingsFromContest;
after(() => dom.window.close());

test('writing defaults preserve current contests and forced policies normalize inconsistent defaults', () => {
  assert.deepEqual(defaults({}), {
    board_question_visibility_policy: 'choice',
    board_question_default_visibility: 'public',
    board_comment_scope_policy: 'choice',
    board_comment_default_scope: 'all',
  });
  assert.deepEqual(
    defaults({
      board_question_visibility_policy: 'private',
      board_question_default_visibility: 'public',
      board_comment_scope_policy: 'operators',
      board_comment_default_scope: 'all',
    }),
    {
      board_question_visibility_policy: 'private',
      board_question_default_visibility: 'private',
      board_comment_scope_policy: 'operators',
      board_comment_default_scope: 'operators',
    },
  );
});

test('operators select defaults independently and forced scopes lock the matching default', async () => {
  const changes = [];
  function View() {
    const [value, setValue] = React.useState(defaults({}));
    return h(Settings, {
      value,
      onChange: (next) => {
        changes.push(next);
        setValue(next);
      },
    });
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(h(View)));
    const fields = host.querySelectorAll('select');
    assert.equal(fields.length, 4);
    async function change(index, value) {
      await act(async () => {
        fields[index].value = value;
        fields[index].dispatchEvent(
          new dom.window.Event('change', { bubbles: true }),
        );
      });
    }
    await change(1, 'private');
    await change(3, 'operators');
    assert.equal(changes.at(-1).board_question_visibility_policy, 'choice');
    assert.equal(changes.at(-1).board_question_default_visibility, 'private');
    assert.equal(changes.at(-1).board_comment_scope_policy, 'choice');
    assert.equal(changes.at(-1).board_comment_default_scope, 'operators');
    await change(0, 'public');
    await change(2, 'all');
    assert.equal(fields[1].disabled, true);
    assert.equal(fields[1].value, 'public');
    assert.equal(fields[3].disabled, true);
    assert.equal(fields[3].value, 'all');
    await change(0, 'choice');
    await change(2, 'choice');
    assert.equal(fields[1].disabled, false);
    assert.equal(fields[3].disabled, false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
