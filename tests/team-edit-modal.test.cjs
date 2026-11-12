const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
window.HTMLElement.prototype.scrollIntoView = function () {};

const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const cache = new Map();
const base = '/operator/contests/contest-one/participants';
const divisions = [
  { division_id: 'division-one', name: '일반부', code: 'general' },
  { division_id: 'division-two', name: '학생부', code: 'student' },
];
let canManage, records, writes, writeResponder;

function fixture(id, name) {
  return {
    participant_team_id: id,
    contest_id: 'contest-one',
    division_id: 'division-one',
    team_name: name,
    status: 'active',
    created_at: '2026-11-01T00:00:00Z',
    members: [
      {
        team_member_id: `${id}-member`,
        name: `${name} 팀원`,
        email: `${id}-member@example.invalid`,
        role: 'member',
      },
      {
        team_member_id: `${id}-leader`,
        name: `${name} 팀장`,
        email: `${id}-leader@example.invalid`,
        role: 'leader',
      },
    ],
  };
}

function applyWrite({ url, method, body }) {
  const [, teamId, , memberId] = url.slice(base.length).split('/');
  if (method === 'POST' && !teamId) {
    const value = fixture('created-team', body.team_name);
    Object.assign(value, body, {
      members: [
        { ...body.leader, team_member_id: 'created-leader' },
        ...body.members.map((member, index) => ({
          ...member,
          team_member_id: `created-member-${index}`,
        })),
      ],
    });
    records.push(value);
    return structuredClone(value);
  }
  const team = records.find((item) => item.participant_team_id === teamId);
  assert.ok(team, `Unexpected team endpoint: ${url}`);
  if (method === 'PATCH' && !url.includes('/members')) {
    Object.assign(team, body);
    return structuredClone(team);
  }
  if (method === 'PATCH' && memberId) {
    const member = team.members.find(
      (item) => item.team_member_id === memberId,
    );
    assert.ok(member, `Unexpected member endpoint: ${url}`);
    Object.assign(member, body);
    return structuredClone(member);
  }
  if (method === 'POST' && url.endsWith('/members')) {
    const member = {
      ...body,
      team_member_id: `${teamId}-added-${team.members.length}`,
    };
    team.members.push(member);
    return structuredClone(member);
  }
  throw new Error(`Unexpected write: ${method} ${url}`);
}

const mocks = {
  '@/shared/api/client': {
    apiRequest: async (url, token, options = {}) => {
      assert.equal(token, 'operator-token');
      if (!options.method) {
        assert.equal(url, base);
        return structuredClone(records);
      }
      const call = {
        url,
        token,
        method: options.method,
        body: options.body ? JSON.parse(options.body) : undefined,
      };
      writes.push(call);
      return writeResponder(call);
    },
  },
  '@/domains/identityAccess/sessionStorage': {
    saveParticipantSession: () => {
      throw new Error('Participant session writes are not expected');
    },
  },
  '@/domains/identityAccess/queryIdentity': {
    tokenQueryIdentity: (token) => token,
  },
  '@/domains/identityAccess/permissions': {
    hasContestPermission: () => canManage,
  },
  '@/components/common/PageLayout': {
    default: ({ children }) => h('main', null, children),
  },
  '@/components/operator/OperatorShell': {
    OperatorAccessGate: ({ children }) =>
      children({ accessToken: 'operator-token' }),
    OperatorTabs: () => null,
    TeamIcon: () => null,
    OperatorPanel: ({ title, actions, children }) =>
      h('section', null, h('h2', null, title), actions, children),
  },
  '@/components/operator/ParticipantBulkImport': { default: () => null },
  '@/components/operator/ParticipantDivisionsPanel': { default: () => null },
  '@/domains/contestAdministration/api': {
    getOperatorContestDashboard: async () => ({
      contest: { contest_id: 'contest-one', title: '모달 검증 대회' },
      divisions,
    }),
  },
};

function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (Object.hasOwn(mocks, id)) return { __esModule: true, ...mocks[id] };
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('.')) {
      const prefix = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const target = ['.ts', '.tsx']
        .map((extension) => prefix + extension)
        .find(fs.existsSync);
      assert.ok(target, `Cannot resolve ${id} from ${relative}`);
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

const Page = source('pages/operator/OperatorParticipantsPage.tsx').default;
let root, host, client;
beforeEach(() => {
  canManage = true;
  records = [fixture('team-one', '첫 팀'), fixture('team-two', '둘째 팀')];
  writes = [];
  writeResponder = applyWrite;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => dom.window.close());

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}
async function render() {
  await act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          MemoryRouter,
          { initialEntries: ['/operator/contests/contest-one/participants'] },
          h(
            Routes,
            null,
            h(Route, {
              path: '/operator/contests/:contestId/participants',
              element: h(Page),
            }),
          ),
        ),
      ),
    ),
  );
  await settle();
}
function button(scope, text) {
  const found = [...scope.querySelectorAll('button')].find(
    (node) =>
      node.textContent.trim() === text ||
      node.getAttribute('aria-label') === text,
  );
  assert.ok(found, `Missing button: ${text}`);
  return found;
}
async function click(node) {
  await act(async () => node.click());
  await settle();
}
function field(scope, label) {
  const node = [...scope.querySelectorAll('label')]
    .find((item) => {
      const caption = item.cloneNode(true);
      caption
        .querySelectorAll('input,select,textarea')
        .forEach((control) => control.remove());
      return caption.textContent.trim() === label;
    })
    ?.querySelector('input,select,textarea');
  assert.ok(node, `Missing field: ${label}`);
  return node;
}
async function input(scope, label, value) {
  const node = field(scope, label);
  await act(async () => {
    const prototype =
      node.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(
      new window.Event(node.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}
function addForm() {
  const form = host.querySelector('form');
  assert.ok(form, 'The add-only form is present');
  return form;
}
function dialog() {
  const node = document.querySelector('dialog[open]');
  assert.ok(node, 'Editing opens a dialog');
  assert.match(node.textContent, /참가팀 수정/);
  return node;
}
async function edit(name = '첫 팀') {
  const row = host.querySelector(`section[aria-label="${name}"]`);
  assert.ok(row, `Missing roster: ${name}`);
  await click(button(row, '팀/팀원 편집'));
  return dialog();
}
async function addDraft() {
  await click(button(host, '참가팀 등록 펼치기'));
  const form = addForm();
  await input(form, '팀명', '작성 중인 새 팀');
  await input(form, '참가 유형', 'division-two');
  await input(form, '팀장 이름', '새 팀장');
  await input(form, '팀장 이메일', 'new-leader@example.invalid');
  return form;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('editing is a populated modal and cancellation preserves the separate add draft without API writes', async () => {
  await render();
  const form = await addDraft();
  const modal = await edit();
  assert.equal(field(modal, '팀명').value, '첫 팀');
  assert.equal(field(modal, '팀장 이름').value, '첫 팀 팀장');
  assert.equal(field(modal, '팀원 1 이름').value, '첫 팀 팀원');
  assert.equal(field(modal, '상태').value, 'active');
  assert.equal(field(form, '팀명').value, '작성 중인 새 팀');
  assert.equal(field(form, '팀장 이름').value, '새 팀장');
  assert.equal(form.querySelector('select option[value="disabled"]'), null);
  assert.doesNotMatch(form.textContent, /변경사항 저장|수정 취소/);
  await input(modal, '팀명', '취소할 수정');
  await input(modal, '팀장 이름', '취소할 팀장');
  await click(button(modal, '취소'));
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(field(form, '팀명').value, '작성 중인 새 팀');
  assert.equal(field(form, '팀장 이름').value, '새 팀장');
  assert.equal(field(form, '참가 유형').value, 'division-two');
  assert.deepEqual(writes, []);
  const reopened = await edit();
  assert.equal(field(reopened, '팀명').value, '첫 팀');
  assert.equal(field(reopened, '팀장 이름').value, '첫 팀 팀장');
});

test('saving the modal updates only the selected team and its real member IDs, adds new members, and preserves the add draft', async () => {
  await render();
  const form = await addDraft();
  const untouched = structuredClone(records[0]);
  const modal = await edit('둘째 팀');
  await input(modal, '팀명', '  수정된 둘째 팀  ');
  await input(modal, '참가 유형', 'division-two');
  await input(modal, '상태', 'disabled');
  await input(modal, '팀장 이름', '  수정 팀장  ');
  await input(modal, '팀장 이메일', 'changed-leader@example.invalid');
  await input(modal, '팀원 1 이름', '수정 팀원');
  await input(modal, '팀원 1 이메일', 'changed-member@example.invalid');
  await click(button(modal, '팀원 추가'));
  await input(modal, '팀원 2 이름', '추가 팀원');
  await input(modal, '팀원 2 이메일', 'added@example.invalid');
  await click(button(modal, '팀원 추가'));
  await click(button(modal, '변경사항 저장'));
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.deepEqual(
    writes.map(({ url, method, body }) => ({ url, method, body })),
    [
      {
        url: `${base}/team-two`,
        method: 'PATCH',
        body: {
          team_name: '수정된 둘째 팀',
          division_id: 'division-two',
          status: 'disabled',
        },
      },
      {
        url: `${base}/team-two/members/team-two-leader`,
        method: 'PATCH',
        body: {
          name: '수정 팀장',
          email: 'changed-leader@example.invalid',
          role: 'leader',
        },
      },
      {
        url: `${base}/team-two/members/team-two-member`,
        method: 'PATCH',
        body: {
          name: '수정 팀원',
          email: 'changed-member@example.invalid',
          role: 'member',
        },
      },
      {
        url: `${base}/team-two/members`,
        method: 'POST',
        body: {
          name: '추가 팀원',
          email: 'added@example.invalid',
          role: 'member',
        },
      },
    ],
  );
  assert.deepEqual(records[0], untouched);
  assert.equal(field(form, '팀명').value, '작성 중인 새 팀');
  assert.equal(field(form, '팀장 이메일').value, 'new-leader@example.invalid');
  assert.ok(host.querySelector('section[aria-label="수정된 둘째 팀"]'));
});

test('saving prevents repeated writes and all dismissal paths until the request settles', async () => {
  await render();
  const modal = await edit();
  const waiting = deferred();
  writeResponder = (call) => waiting.promise.then(() => applyWrite(call));
  const form = modal.querySelector('form');
  await click(button(modal, '변경사항 저장'));
  assert.equal(writes.length, 1);
  assert.equal(button(modal, '취소').disabled, true);
  assert.equal(field(modal, '팀명').matches(':disabled'), true);
  await click(button(modal, '닫기'));
  assert.equal(dialog(), modal);
  await act(async () => {
    modal.dispatchEvent(new window.Event('cancel', { bubbles: true }));
    const backdrop = modal.querySelector('.zoj-modal-backdrop');
    backdrop.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    backdrop.click();
    form.dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(dialog(), modal);
  assert.equal(writes.length, 1);
  await act(async () => waiting.resolve());
  await settle();
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(
    writes.length,
    3,
    'One team patch and the two existing member patches',
  );
});

test('failed edits keep entered values in the modal and can be retried without altering the add draft', async () => {
  await render();
  const form = await addDraft();
  const modal = await edit();
  await input(modal, '팀명', '재시도할 팀');
  await input(modal, '팀장 이메일', 'retry@example.invalid');
  writeResponder = () => Promise.reject(new Error('Synthetic save failure'));
  await click(button(modal, '변경사항 저장'));
  assert.equal(dialog(), modal);
  assert.equal(field(modal, '팀명').value, '재시도할 팀');
  assert.equal(field(modal, '팀장 이메일').value, 'retry@example.invalid');
  assert.match(modal.textContent, /실패/);
  assert.equal(button(modal, '변경사항 저장').disabled, false);
  assert.equal(field(form, '팀명').value, '작성 중인 새 팀');
  assert.equal(writes.length, 1);
  writeResponder = applyWrite;
  await click(button(modal, '변경사항 저장'));
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(records[0].team_name, '재시도할 팀');
});

test('registration stays create-only even after opening an existing team for editing', async () => {
  await render();
  const form = await addDraft();
  const modal = await edit();
  await click(button(modal, '취소'));
  await click(button(form, '팀원 추가'));
  await input(form, '팀원 1 이름', '새 팀원');
  await input(form, '팀원 1 이메일', 'new-member@example.invalid');
  await click(button(form, '참가팀 등록'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    url: base,
    token: 'operator-token',
    method: 'POST',
    body: {
      team_name: '작성 중인 새 팀',
      division_id: 'division-two',
      leader: {
        name: '새 팀장',
        email: 'new-leader@example.invalid',
        role: 'leader',
      },
      members: [
        {
          name: '새 팀원',
          email: 'new-member@example.invalid',
          role: 'member',
        },
      ],
    },
  });
  assert.equal(field(form, '팀명').value, '');
  assert.equal(records[0].team_name, '첫 팀');
  assert.equal(records[1].team_name, '둘째 팀');
});

test('incomplete team, leader, and member edits are explained without sending any updates', async () => {
  await render();
  const modal = await edit();
  await input(modal, '팀명', ' ');
  await click(button(modal, '변경사항 저장'));
  assert.match(modal.querySelector('[role="alert"]').textContent, /팀명/);
  await input(modal, '팀명', '첫 팀');
  await input(modal, '팀장 이름', ' ');
  await click(button(modal, '변경사항 저장'));
  assert.match(modal.querySelector('[role="alert"]').textContent, /팀장/);
  await input(modal, '팀장 이름', '첫 팀 팀장');
  await input(modal, '팀원 1 이름', '');
  await input(modal, '팀원 1 이메일', '');
  await click(button(modal, '변경사항 저장'));
  assert.match(
    modal.querySelector('[role="alert"]').textContent,
    /이름과 이메일/,
  );
  await input(modal, '팀원 1 이름', '첫 팀 팀원');
  await input(modal, '팀원 1 이메일', 'team-one-member@example.invalid');
  await click(button(modal, '팀원 추가'));
  await input(modal, '팀원 2 이름', '이메일 없는 팀원');
  await click(button(modal, '변경사항 저장'));
  assert.match(
    modal.querySelector('[role="alert"]').textContent,
    /이름과 이메일/,
  );
  assert.equal(dialog(), modal);
  assert.deepEqual(writes, []);
});

test('retrying after a later member fails updates a previously added member instead of adding it twice', async () => {
  await render();
  const modal = await edit();
  await click(button(modal, '팀원 추가'));
  await input(modal, '팀원 2 이름', '먼저 추가되는 팀원');
  await input(modal, '팀원 2 이메일', 'first-added@example.invalid');
  await click(button(modal, '팀원 추가'));
  await input(modal, '팀원 3 이름', '나중에 추가되는 팀원');
  await input(modal, '팀원 3 이메일', 'second-added@example.invalid');
  let failLastMember = true;
  writeResponder = (call) => {
    if (
      failLastMember &&
      call.method === 'POST' &&
      call.body.email === 'second-added@example.invalid'
    ) {
      failLastMember = false;
      throw new Error('Synthetic later member failure');
    }
    return applyWrite(call);
  };
  await click(button(modal, '변경사항 저장'));
  assert.equal(dialog(), modal);
  const added = records[0].members.find(
    (member) => member.email === 'first-added@example.invalid',
  );
  assert.ok(added?.team_member_id);
  assert.equal(records[0].members.length, 3);
  await click(button(modal, '변경사항 저장'));
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(records[0].members.length, 4);
  assert.equal(
    writes.filter(
      (call) =>
        call.method === 'POST' &&
        call.body.email === 'first-added@example.invalid',
    ).length,
    1,
  );
  assert.ok(
    writes.some(
      (call) =>
        call.method === 'PATCH' &&
        call.url === `${base}/team-one/members/${added.team_member_id}`,
    ),
  );
});

test('read-only participant permissions expose neither registration nor team edit controls', async () => {
  canManage = false;
  await render();
  assert.ok(host.querySelector('section[aria-label="첫 팀"]'));
  assert.equal(document.querySelector('dialog'), null);
  const visibleButtons = [...host.querySelectorAll('button')].filter(
    (node) => !node.closest('[hidden]'),
  );
  assert.equal(
    visibleButtons.some((node) =>
      /팀\/팀원 편집|참가팀 등록/.test(node.textContent),
    ),
    false,
  );
  assert.deepEqual(writes, []);
});
