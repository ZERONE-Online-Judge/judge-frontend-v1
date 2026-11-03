const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr/login',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h, useState } = React;
const { createRoot } = require('react-dom/client');
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
const originalFetch = global.fetch;
const cache = new Map();
let host, root, handle, value, submissions, requests, callbacks;

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((ext) => base + ext)
        .find((file) => fs.existsSync(file));
      assert.ok(target, `Cannot resolve ${id}`);
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}

function storageModule() {
  return source('domains/identityAccess/rememberedEmails.ts');
}

function seed(emails, enabled = true) {
  window.localStorage.setItem(
    storageModule().REMEMBERED_EMAILS_KEY,
    JSON.stringify({ enabled, emails }),
  );
}

async function mount({ field = false, initial = '', ...fieldProps } = {}) {
  const { useRememberedEmails } = storageModule();
  const Field = field
    ? source('components/auth/RememberedEmailField.tsx').default
    : null;
  function Harness() {
    handle = useRememberedEmails();
    const [email, setEmail] = useState(initial);
    value = email;
    return Field
      ? h(
          'form',
          {
            onSubmit(event) {
              event.preventDefault();
              submissions++;
            },
          },
          h(Field, {
            id: 'login-email',
            label: '이메일',
            value: email,
            onChange(next) {
              callbacks.push(next);
              setEmail(next);
            },
            remembered: handle,
            ...fieldProps,
          }),
          h('button', { type: 'submit' }, '다음'),
        )
      : h('output', null, handle.emails.join(','));
  }
  await act(async () => root.render(h(Harness)));
}

async function run(callback) {
  await act(async () => callback());
}

async function click(element) {
  assert.ok(element);
  await run(() => element.click());
}

function namedButton(label) {
  return [...host.querySelectorAll('button')].find(
    (button) =>
      button.getAttribute('aria-label') === label ||
      button.textContent.trim() === label,
  );
}

function emailInput() {
  return host.querySelector('#login-email');
}

async function input(text) {
  await run(() => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(emailInput(), text);
    emailInput().dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function key(name) {
  const event = new window.KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  await run(() => emailInput().dispatchEvent(event));
  return event;
}

async function storageEvent(next, key = storageModule().REMEMBERED_EMAILS_KEY) {
  if (next === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(next));
  await run(() =>
    window.dispatchEvent(
      new window.StorageEvent('storage', {
        key,
        newValue: next === null ? null : JSON.stringify(next),
        storageArea: window.localStorage,
        url: 'https://zoj.kr/login',
      }),
    ),
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', originalStorage);
  window.localStorage.clear();
  cache.clear();
  handle = null;
  value = '';
  submissions = 0;
  requests = [];
  callbacks = [];
  global.fetch = (...args) => {
    requests.push(args);
    return Promise.reject(new Error('Remembered email UI must not log in'));
  };
  document.body.innerHTML = '<div id="test"></div>';
  host = document.getElementById('test');
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  Object.defineProperty(window, 'localStorage', originalStorage);
  assert.deepEqual(
    requests,
    [],
    'Remembered email controls must not call APIs',
  );
});
after(() => {
  global.fetch = originalFetch;
  dom.window.close();
});

test('first visit is opt-out and does not persist a remembered address', async () => {
  await mount();
  assert.equal(handle.enabled, false);
  assert.deepEqual(handle.emails, []);
  assert.equal(handle.prefill, '');
  await run(() => handle.remember('user@example.com'));
  assert.deepEqual(handle.emails, []);
  const stored = window.localStorage.getItem(
    storageModule().REMEMBERED_EMAILS_KEY,
  );
  assert.ok(stored === null || !stored.includes('user@example.com'));
});

test('opt-in stores at most five normalized recent successful-login addresses', async () => {
  await mount();
  await run(() => handle.setEnabled(true));
  for (const email of [
    'one@example.com',
    'two@example.com',
    'three@example.com',
    'four@example.com',
    'five@example.com',
    'six@example.com',
  ]) {
    await run(() => handle.remember(email));
  }
  await run(() => handle.remember('  TWO@EXAMPLE.COM  '));
  assert.deepEqual(handle.emails, [
    'two@example.com',
    'six@example.com',
    'five@example.com',
    'four@example.com',
    'three@example.com',
  ]);
  assert.equal(handle.prefill, 'two@example.com');
  const saved = JSON.parse(
    window.localStorage.getItem(storageModule().REMEMBERED_EMAILS_KEY),
  );
  assert.equal(saved.enabled, true);
  assert.deepEqual(saved.emails, handle.emails);
});

test('saved opt-in entries are restored safely and the most recent is the prefill', async () => {
  seed([' USER@EXAMPLE.COM ', 'other@example.com', 'user@example.com']);
  await mount();
  assert.equal(handle.enabled, true);
  assert.deepEqual(handle.emails, ['user@example.com', 'other@example.com']);
  assert.equal(handle.prefill, 'user@example.com');
});

test('unchecking removes every saved address and stops subsequent remembering', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount();
  await run(() => handle.setEnabled(false));
  assert.equal(handle.enabled, false);
  assert.deepEqual(handle.emails, []);
  assert.equal(handle.prefill, '');
  assert.doesNotMatch(
    window.localStorage.getItem(storageModule().REMEMBERED_EMAILS_KEY) ?? '',
    /one@example.com|two@example.com/,
  );
  await run(() => handle.remember('third@example.com'));
  assert.deepEqual(handle.emails, []);
});

test('individual removal updates the prefill and clearing only removes the list', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount();
  await run(() => handle.remove('one@example.com'));
  assert.deepEqual(handle.emails, ['two@example.com']);
  assert.equal(handle.prefill, 'two@example.com');
  await run(() => handle.clear());
  assert.deepEqual(handle.emails, []);
  assert.equal(handle.prefill, '');
  assert.equal(handle.enabled, true);
});

test('invalid addresses and credential-like presentation emails are never retained', async () => {
  seed(['normal@example.com', 'secret@score.zoj.kr', 'invalid', null, 23]);
  await mount();
  assert.deepEqual(handle.emails, ['normal@example.com']);
  for (const email of ['', 'invalid', ' PRIVATE@SCORE.ZOJ.KR ']) {
    await run(() => handle.remember(email));
  }
  assert.deepEqual(handle.emails, ['normal@example.com']);
  assert.doesNotMatch(
    window.localStorage.getItem(storageModule().REMEMBERED_EMAILS_KEY) ?? '',
    /private@score\.zoj\.kr/i,
  );
});

for (const raw of [
  '{not json',
  'null',
  '[]',
  '{"enabled":"true","emails":["a@example.com"]}',
  '{"enabled":true,"emails":"a@example.com"}',
]) {
  test(`corrupt or unconsented storage is opt-out: ${raw}`, async () => {
    window.localStorage.setItem(storageModule().REMEMBERED_EMAILS_KEY, raw);
    await mount();
    assert.equal(handle.enabled, false);
    assert.deepEqual(handle.emails, []);
    assert.equal(handle.prefill, '');
  });
}

test('blocked browser storage does not break login field or preference actions', async () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new window.DOMException('Blocked by browser', 'SecurityError');
    },
  });
  await mount();
  assert.deepEqual(handle.emails, []);
  await run(() => handle.setEnabled(true));
  await run(() => handle.remember('user@example.com'));
  await run(() => handle.remove('user@example.com'));
  await run(() => handle.clear());
  await run(() => handle.setEnabled(false));
  assert.equal(handle.enabled, false);
});

test('another tab updating or removing stored preferences synchronizes this tab', async () => {
  seed(['one@example.com']);
  await mount();
  await storageEvent({ enabled: true, emails: ['two@example.com'] });
  assert.deepEqual(handle.emails, ['two@example.com']);
  assert.equal(handle.prefill, 'two@example.com');
  await storageEvent(
    { enabled: true, emails: ['ignored@example.com'] },
    'unrelated',
  );
  assert.deepEqual(handle.emails, ['two@example.com']);
  await storageEvent(null);
  assert.equal(handle.enabled, false);
  assert.deepEqual(handle.emails, []);
});

test('clearing browser storage in another tab revokes saved-email consent', async () => {
  seed(['one@example.com']);
  await mount();
  window.localStorage.clear();
  await run(() =>
    window.dispatchEvent(
      new window.StorageEvent('storage', {
        key: null,
        newValue: null,
        storageArea: window.localStorage,
      }),
    ),
  );
  assert.equal(handle.enabled, false);
  assert.deepEqual(handle.emails, []);
});

test('authentication completion cannot recreate an opt-in removed before its storage event arrives', async () => {
  seed(['one@example.com']);
  await mount();
  window.localStorage.removeItem(storageModule().REMEMBERED_EMAILS_KEY);
  await run(() => handle.remember('two@example.com'));
  assert.equal(
    window.localStorage.getItem(storageModule().REMEMBERED_EMAILS_KEY),
    null,
  );
});

test('typing and checking the opt-in alone do not save or authenticate the typed email', async () => {
  await mount({ field: true });
  const inputElement = emailInput();
  assert.equal(
    host.querySelector('label[for="login-email"]').textContent,
    '이메일',
  );
  assert.equal(inputElement.autocomplete, 'username');
  assert.equal(inputElement.type, 'email');
  await input('typed@example.com');
  await click(host.querySelector('input[type="checkbox"]'));
  assert.equal(value, 'typed@example.com');
  assert.equal(handle.enabled, true);
  assert.deepEqual(handle.emails, []);
  assert.equal(submissions, 0);
});

test('pointer selection fills the chosen email without submitting or logging in', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount({ field: true });
  await click(namedButton('저장된 이메일 보기'));
  const option = [...host.querySelectorAll('[role="option"]')].find((element) =>
    element.textContent.includes('two@example.com'),
  );
  await click(option);
  assert.equal(value, 'two@example.com');
  assert.deepEqual(callbacks, ['two@example.com']);
  assert.equal(submissions, 0);
  assert.equal(emailInput().getAttribute('aria-expanded'), 'false');
  assert.deepEqual(handle.emails, ['one@example.com', 'two@example.com']);
});

test('explicit dropdown shows every saved address even when the current input has no match', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount({ field: true });
  await input('typed@example.com');
  assert.equal(emailInput().getAttribute('aria-expanded'), 'false');
  await click(namedButton('저장된 이메일 보기'));
  assert.deepEqual(
    [...host.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    ),
    ['one@example.com', 'two@example.com'],
  );
  assert.equal(value, 'typed@example.com');
  await input('two@');
  assert.deepEqual(
    [...host.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    ),
    ['two@example.com'],
  );
  assert.deepEqual(handle.emails, ['one@example.com', 'two@example.com']);
  assert.equal(submissions, 0);
});

test('keyboard opens and selects a saved email, while Escape only closes the list', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount({ field: true });
  await run(() => emailInput().focus());
  await key('ArrowDown');
  assert.equal(emailInput().getAttribute('aria-expanded'), 'true');
  assert.equal((await key('Enter')).defaultPrevented, true);
  assert.equal(value, 'one@example.com');
  assert.equal(submissions, 0);
  await click(namedButton('저장된 이메일 보기'));
  await key('Escape');
  assert.equal(emailInput().getAttribute('aria-expanded'), 'false');
  assert.equal(value, 'one@example.com');
});

test('deleting one or all saved emails keeps the entered address and does not submit', async () => {
  seed(['one@example.com', 'two@example.com']);
  await mount({ field: true, initial: 'typed@example.com' });
  await click(namedButton('저장된 이메일 보기'));
  await click(namedButton('one@example.com 저장 삭제'));
  assert.deepEqual(handle.emails, ['two@example.com']);
  assert.equal(value, 'typed@example.com');
  await click(namedButton('모두 삭제'));
  assert.deepEqual(handle.emails, []);
  assert.equal(value, 'typed@example.com');
  assert.equal(submissions, 0);
});

test('presentation credentials never offer the saved-email controls', async () => {
  seed(['one@example.com']);
  await mount({ field: true, initial: 'private@score.zoj.kr' });
  assert.equal(host.querySelector('input[type="checkbox"]'), null);
  assert.equal(namedButton('저장된 이메일 보기'), undefined);
  await key('ArrowDown');
  assert.equal(host.querySelector('[role="listbox"]'), null);
  assert.deepEqual(callbacks, []);
});

for (const prop of ['disabled', 'readOnly']) {
  test(`${prop} field cannot select another saved email`, async () => {
    seed(['one@example.com', 'two@example.com']);
    await mount({ field: true, initial: 'current@example.com', [prop]: true });
    const toggle = namedButton('저장된 이메일 보기');
    if (toggle) await click(toggle);
    await key('ArrowDown');
    assert.equal(host.querySelector('[role="listbox"]'), null);
    assert.equal(value, 'current@example.com');
    assert.deepEqual(callbacks, []);
    assert.equal(submissions, 0);
  });
}

test('field errors are associated with the email input accessibly', async () => {
  await mount({ field: true, error: '이메일을 다시 확인해 주세요.' });
  assert.equal(emailInput().getAttribute('aria-invalid'), 'true');
  const ids = emailInput().getAttribute('aria-describedby').split(/\s+/);
  assert.ok(
    ids.some((id) =>
      document
        .getElementById(id)
        ?.textContent.includes('이메일을 다시 확인해 주세요.'),
    ),
  );
});

test('keyboard keeps the active address inside a short dropdown without scrolling the page', async () => {
  seed([
    'one@example.com',
    'two@example.com',
    'three@example.com',
    'four@example.com',
    'five@example.com',
  ]);
  await mount({ field: true });
  await click(namedButton('저장된 이메일 보기'));
  const dropdown = host.querySelector('.remembered-email-dropdown');
  Object.defineProperty(dropdown, 'clientHeight', { value: 120 });
  const options = [...host.querySelectorAll('[role="option"]')];
  options.forEach((option, index) => {
    Object.defineProperty(option, 'offsetTop', { value: 40 + 44 * index });
    Object.defineProperty(option, 'offsetHeight', { value: 44 });
  });
  const pageScroll = document.documentElement.scrollTop;
  for (let i = 0; i < 5; i++) await key('ArrowDown');
  assert.equal(options[4].getAttribute('aria-selected'), 'true');
  assert.equal(dropdown.scrollTop, 140);
  await key('ArrowDown');
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  assert.equal(dropdown.scrollTop, 40);
  assert.equal(document.documentElement.scrollTop, pageScroll);
  assert.equal(submissions, 0);
});
