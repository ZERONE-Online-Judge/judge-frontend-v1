const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
const sessionMock = new Proxy({}, { get: () => () => null });
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const native = mod.require.bind(mod);
  mod.require = (id) => {
    if (id === '@/domains/identityAccess/sessionStorage') return sessionMock;
    if (!id.startsWith('@/')) return native(id);
    return source(
      ['.ts', '.tsx']
        .map((ext) => id.slice(2) + ext)
        .find((name) => fs.existsSync(path.resolve(__dirname, '../src', name))),
    );
  };
  cache.set(file, mod);
  mod._compile(
    ts.transpileModule(
      fs
        .readFileSync(file, 'utf8')
        .replace('import.meta.env.VITE_API_BASE_URL', 'undefined'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    file,
  );
  return mod.exports;
}
const { apiRequest } = source('shared/api/client.ts');
const notice = source('shared/api/changeNotice.ts');
const Dialog = source('components/operator/ChangeNoticeDialog.tsx').default;
const draft = {
  title: '대회 일정 변경',
  body: '종료 시간이 17시에서 18시로 변경되었습니다.',
  fingerprint: 'initial',
};
let root, calls;
const response = (status, data) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
const challenge = (value = draft) =>
  response(409, {
    error: {
      code: 'change_notice_required',
      message: '공지 필요',
      details: value,
    },
  });
beforeEach(async () => {
  document.body.innerHTML = '<main></main>';
  calls = [];
  root = createRoot(document.querySelector('main'));
  await act(async () => root.render(React.createElement(Dialog)));
});
afterEach(async () => {
  while (notice.currentChangeNotice())
    notice.finishChangeNotice(notice.currentChangeNotice().id, null);
  await act(async () => root.unmount());
});
after(() => dom.window.close());
async function setReason(value) {
  await act(async () => {
    const field = document.querySelectorAll('textarea')[1];
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(field, value);
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form')
      .dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
}

test('no mutation retry until editable notice and a reason are confirmed', async () => {
  global.fetch = async (_url, init) => {
    calls.push(init);
    return calls.length === 1
      ? challenge()
      : response(200, { data: { saved: true } });
  };
  const init = {
    method: 'PATCH',
    body: JSON.stringify({ end_at: 'new-time' }),
  };
  let result;
  await act(async () => {
    result = apiRequest('/operator/contests/c/settings', 'token', init);
  });
  assert.equal(calls.length, 1);
  assert.equal(document.querySelector('input').value, draft.title);
  assert.equal(document.querySelector('textarea').value, draft.body);
  assert.equal(document.querySelector('button[type="submit"]').disabled, true);
  await setReason('장비 점검으로 1시간 연장');
  assert.equal(document.querySelector('button[type="submit"]').disabled, false);
  await submit();
  assert.deepEqual(await result, { saved: true });
  const sent = JSON.parse(calls[1].body);
  assert.equal(sent._change_notice.reason, '장비 점검으로 1시간 연장');
  assert.equal(sent._change_notice.fingerprint, draft.fingerprint);
  assert.equal(JSON.parse(init.body)._change_notice, undefined);
  assert.equal(document.querySelector('dialog'), null);
});

test('cancel closes the modal without sending a change or losing the original payload', async () => {
  global.fetch = async (_url, init) => {
    calls.push(init);
    return challenge();
  };
  let result;
  await act(async () => {
    result = apiRequest('/operator/contests/c/problems/p', 'token', {
      method: 'PATCH',
      body: '{"title":"수정"}',
    });
  });
  const rejected = assert.rejects(
    result,
    (error) => error.code === 'change_notice_cancelled',
  );
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((el) => el.textContent === '취소')
      .click(),
  );
  await rejected;
  assert.equal(calls.length, 1);
  assert.equal(document.querySelector('dialog'), null);
});

test('a stale snapshot requires another confirmation with refreshed differences', async () => {
  global.fetch = async (_url, init) => {
    calls.push(init);
    return calls.length === 1
      ? challenge()
      : calls.length === 2
        ? challenge({ ...draft, body: '최신 변경 내용', fingerprint: 'new' })
        : response(200, { data: true });
  };
  let result;
  await act(async () => {
    result = apiRequest('/operator/contests/c/settings', 'token', {
      method: 'PATCH',
      body: '{}',
    });
  });
  await setReason('변경 사유');
  await submit();
  assert.equal(calls.length, 2);
  assert.equal(document.querySelector('textarea').value, '최신 변경 내용');
  assert.equal(document.querySelectorAll('textarea')[1].value, '');
  await setReason('최신 변경을 확인했습니다');
  await submit();
  assert.equal(await result, true);
  assert.equal(JSON.parse(calls[2].body)._change_notice.fingerprint, 'new');
});

test('multipart upload retains its file and does not mutate the original FormData', () => {
  const body = new FormData();
  body.set('file', new Blob(['testcase archive']), 'tests.zip');
  const approved = { ...draft, reason: '테스트 보강' };
  const retried = notice.changeNoticeRequestInit(
    { method: 'POST', body },
    approved,
  );
  assert.equal(body.has('_change_notice'), false);
  assert.equal(retried.body.get('file').name, 'tests.zip');
  assert.equal(retried.body.get('file').size, 16);
  assert.deepEqual(JSON.parse(retried.body.get('_change_notice')), approved);
});

test('notice preview shows the final reason without saving and retains all edited fields', async () => {
  let result;
  await act(async () => {
    result = notice.requestChangeNotice(draft);
  });
  await setReason('현장 사정으로 연장');
  const preview = [...document.querySelectorAll('button')].find(
    (el) => el.textContent === '공지 미리보기',
  );
  await act(async () => preview.click());
  assert.match(document.querySelector('article').textContent, /대회 일정 변경/);
  assert.match(
    document.querySelector('article').textContent,
    /종료 시간이 17시에서 18시로 변경되었습니다/,
  );
  assert.match(
    document.querySelector('article').textContent,
    /변경 사유: 현장 사정으로 연장/,
  );
  assert.equal(document.querySelector('input'), null);
  assert.equal(notice.currentChangeNotice().draft.fingerprint, 'initial');
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((el) => el.textContent === '편집')
      .click(),
  );
  assert.equal(
    document.querySelectorAll('textarea')[1].value,
    '현장 사정으로 연장',
  );
  await submit();
  assert.equal((await result).reason, '현장 사정으로 연장');
});
