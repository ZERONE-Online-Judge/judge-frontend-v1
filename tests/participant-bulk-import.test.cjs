const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', {
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
global.FileReader = window.FileReader;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
let apiMock;
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id === '@/domains/teamParticipation/api') return apiMock;
    if (id === '@/domains/identityAccess/queryIdentity')
      return {
        tokenQueryIdentity: (token) => token.replace(/-refreshed$/, ''),
      };
    if (id === '@/shared/api/client')
      return {
        apiRequest: () => {
          throw new Error('Unexpected real API');
        },
      };
    if (id === '@/domains/identityAccess/sessionStorage')
      return { saveParticipantSession: () => {} };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const prefix = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const found = ['.ts', '.tsx']
        .map((ext) => prefix + ext)
        .find(fs.existsSync);
      return source(path.relative(path.resolve(__dirname, '../src'), found));
    }
    return native(id);
  };
  cache.set(filename, m);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const parser = source('domains/teamParticipation/importParser.ts');
const formatIssue = source(
  'domains/teamParticipation/api.ts',
).formatParticipantImportIssue;
let previews, creates, previewResponder, createResponder, registered;
apiMock = {
  formatParticipantImportIssue: formatIssue,
  previewParticipantTeams: async (contestId, token, teams, signal) => {
    previews.push({
      contestId,
      token,
      teams: global.structuredClone(teams),
      signal,
    });
    return previewResponder(teams);
  },
  bulkCreateParticipantTeams: async (contestId, token, teams) => {
    creates.push({ contestId, token, teams: global.structuredClone(teams) });
    return createResponder(teams);
  },
};
const Component = source(
  'components/operator/ParticipantBulkImport.tsx',
).default;
const divisions = [
  { division_id: 'division-1', code: 'general', name: '일반' },
];
const header =
  'team_name,division,leader_name,leader_email,member1_name,member1_email';
const csv = (name = 'Team A', email = 'a@example.com') =>
  `${header}\n${name},일반,Leader,${email},Member,m-${email}`;
const team = (name = 'Team A') => ({
  team_name: name,
  division_id: 'division-1',
  leader: { name: 'Leader', email: 'a@example.com' },
  members: [],
});
function preview(teams) {
  const rows = teams.map((input, index) => {
    const normalized = parser.normalizeTeamImportRow(input);
    const errors = parser
      .teamImportRowErrors(normalized, divisions)
      .map((message) => ({ code: 'invalid', field: 'leader.email', message }));
    return {
      row: index + 1,
      team_name: input.team_name,
      input,
      normalized,
      valid: !errors.length,
      errors,
      warnings: [],
      corrections: [],
    };
  });
  const ready = rows.filter((row) => row.valid).length;
  return {
    rows,
    summary: {
      total: rows.length,
      ready,
      invalid: rows.length - ready,
      corrected: 0,
      warnings: 0,
    },
  };
}
function created(input, index = 0) {
  return {
    participant_team_id: `created-${index}`,
    team_name: input.team_name,
    division_id: input.division_id,
    members: [
      { team_member_id: `leader-${index}`, role: 'leader', ...input.leader },
      ...input.members.map((member, i) => ({
        team_member_id: `member-${index}-${i}`,
        role: 'member',
        ...member,
      })),
    ],
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let root,
  host,
  props,
  timers = new Map(),
  nextTimer = 10000;
const nativeTimeout = window.setTimeout.bind(window),
  nativeClear = window.clearTimeout.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  if (delay === 300) {
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  }
  return nativeTimeout(callback, delay, ...args);
};
window.clearTimeout = (id) => {
  timers.delete(id);
  nativeClear(id);
};
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  previews = [];
  creates = [];
  registered = 0;
  previewResponder = preview;
  createResponder = (teams) => ({
    created: teams.map(created),
    errors: [],
    results: teams.map((_, index) => ({
      row: index + 1,
      status: 'created',
      participant_team_id: `created-${index}`,
      warnings: [],
    })),
  });
  props = {
    contestId: 'contest-a',
    token: 'owner-a',
    divisions,
    onRegistered: () => registered++,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  timers.clear();
  global.FileReader = window.FileReader;
});
after(() => dom.window.close());
async function render(change = {}) {
  props = { ...props, ...change };
  await act(async () => root.render(h(Component, props)));
}
function button(text) {
  const node = [...document.querySelectorAll('button')].find(
    (node) =>
      node.textContent.trim() === text ||
      node.getAttribute('aria-label') === text,
  );
  assert.ok(node, `Missing button: ${text}`);
  return node;
}
async function click(node) {
  await act(async () => node.click());
}
async function input(label, value) {
  const node = document.querySelector(`[aria-label="${label}"]`);
  assert.ok(node, label);
  await act(async () => {
    const prototype =
      node.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : node.tagName === 'SELECT'
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
async function inspect(text = csv()) {
  await render();
  await click(button('일괄 등록 펼치기'));
  await input('참가팀 일괄 등록 내용', text);
  await click(button('일괄 등록 내용 확인'));
}
async function validate() {
  assert.ok(timers.size, 'Expected a pending preview');
  const [id, callback] = timers.entries().next().value;
  timers.delete(id);
  await act(async () => {
    callback();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

test('normalization preserves TSV edge blanks and incomplete members instead of shifting or dropping them', () => {
  const data = parser.prepareTeamImport(
    '\uFEFFteam_name\tdivision\tleader_name\tleader_email\tmember1_name\tmember1_email\r\n\t일반\t Lead \t LEAD@EXAMPLE.COM \t Half \t\r\n',
    divisions,
  );
  assert.equal(data.rows.length, 1);
  assert.deepEqual(data.rows[0].team, {
    team_name: '',
    division_id: 'division-1',
    leader: { name: 'Lead', email: 'lead@example.com' },
    members: [{ name: 'Half', email: '' }],
  });
  assert.match(
    parser.teamImportRowErrors(data.rows[0].team, divisions).join(' '),
    /팀원 1 이메일/,
  );
  assert.equal(data.rows[0].line, 2);
  assert.ok(data.corrections.some((message) => message.includes('BOM')));
});

test('quoted commas, escaped quotes and multiline records keep physical source lines and explicit structural errors', () => {
  const data = parser.prepareTeamImport(
    `${header}\n\n"A, ""quoted""",일반,Leader,a@example.com,,\n"Multi\nLine",일반,Leader,b@example.com,,\nBroken,일반,Leader,c@example.com`,
    divisions,
  );
  assert.deepEqual(
    data.rows.map((row) => row.line),
    [3, 4, 6],
  );
  assert.equal(data.rows[0].team.team_name, 'A, "quoted"');
  assert.equal(data.rows[1].team.team_name, 'Multi\nLine');
  assert.match(
    parser.teamImportRowErrors(data.rows[1].team, divisions).join(' '),
    /줄바꿈/,
  );
  assert.match(data.rows[2].warnings.join(' '), /열 개수/);
  assert.match(
    parser
      .prepareTeamImport(
        `${header}\n"unclosed,일반,a,a@example.com,,`,
        divisions,
      )
      .rows[0].warnings.join(' '),
    /닫히지/,
  );
});

test('ambiguous divisions, duplicate/prototype headers and unreadable data cannot be guessed silently', () => {
  const ambiguous = [
    ...divisions,
    { division_id: 'division-2', code: 'other', name: 'GENERAL' },
  ];
  const data = parser.prepareTeamImport(
    csv().replace('일반', 'general'),
    ambiguous,
  );
  assert.equal(data.rows[0].team.division_id, 'general');
  assert.match(
    parser.teamImportRowErrors(data.rows[0].team, ambiguous).join(' '),
    /유형/,
  );
  for (const extra of ['constructor', 'leader_email', 'unknown']) {
    const prepared = parser.prepareTeamImport(
      `${header},${extra}\nA,일반,Lead,a@example.com,,,x`,
      divisions,
    );
    assert.ok(prepared.errors.length);
  }
  assert.match(
    parser.prepareTeamImport(csv('Unreadable �'), divisions).errors.join(' '),
    /UTF-8/,
  );
});

test('retry serialization round-trips every person and caps the preview at 1000 teams', () => {
  const teams = [
    team('A, "B"'),
    {
      ...team('C'),
      members: [{ name: 'Member', email: 'member@example.com' }],
    },
  ];
  assert.deepEqual(
    parser
      .prepareTeamImport(parser.serializeTeamImportRows(teams), divisions)
      .rows.map((row) => row.team),
    teams,
  );
  const tooMany = parser.prepareTeamImport(
    [
      header,
      ...Array.from(
        { length: 1001 },
        (_, i) => `Team${i},일반,Lead,a${i}@example.com,,`,
      ),
    ].join('\n'),
    divisions,
  );
  assert.equal(tooMany.rows.length, 1000);
  assert.match(tooMany.errors.join(' '), /1,000/);
  assert.equal(
    formatIssue({
      code: 'duplicate_email',
      field: 'members.0.email',
      email: 'member@example.com',
      message: '이미 등록되었습니다.',
    }),
    '팀원 1 이메일 (member@example.com): 이미 등록되었습니다.',
  );
});

test('the editable confirmation validates corrected values before one explicit registration', async () => {
  await inspect(`${header}\n Team A ,일반,Leader,bad,Member,`);
  assert.equal(creates.length, 0);
  await validate();
  assert.equal(button('확인한 1팀 등록').disabled, true);
  await input('2행 팀장 이메일', ' FIXED@EXAMPLE.COM ');
  await input('2행 팀원 1 이메일', 'member@example.com');
  await input('2행 팀명', ' Updated ');
  assert.equal(button('확인한 1팀 등록').disabled, true);
  await validate();
  await act(async () => {
    button('확인한 1팀 등록').click();
    button('확인한 1팀 등록').click();
  });
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].teams[0], {
    team_name: 'Updated',
    division_id: 'division-1',
    leader: { name: 'Leader', email: 'fixed@example.com' },
    members: [{ name: 'Member', email: 'member@example.com' }],
  });
  assert.match(document.querySelector('dialog').textContent, /Updated/);
  assert.match(
    document.querySelector('dialog').textContent,
    /fixed@example.com/,
  );
  assert.equal(registered, 1);
});

test('an older successful preview cannot enable a changed invalid snapshot', async () => {
  const old = deferred();
  previewResponder = () => old.promise;
  await inspect();
  await validate();
  await input('2행 팀장 이메일', 'invalid');
  previewResponder = preview;
  await validate();
  await act(async () => old.resolve(preview([team()])));
  assert.equal(button('확인한 1팀 등록').disabled, true);
  assert.equal(creates.length, 0);
});

test('raw edits pause structured editing and require reparsing without closing the confirmation', async () => {
  await inspect();
  await validate();
  await input('확인창 원본 CSV·TSV', csv('Changed source'));
  assert.equal(
    document.querySelector('[aria-label="2행 팀명"]').disabled,
    true,
  );
  assert.equal(button('확인한 1팀 등록').disabled, true);
  await click(button('원본 다시 검사'));
  await validate();
  assert.equal(
    document.querySelector('[aria-label="2행 팀명"]').value,
    'Changed source',
  );
  assert.equal(button('확인한 1팀 등록').disabled, false);
  assert.equal(creates.length, 0);
});

test('partially registered results show actual members and invitation warnings while retry excludes successes', async () => {
  const raw = `${header}\nA,일반,Leader,a@example.com,,\n\nB,일반,Leader,b@example.com,Member,member@example.com`;
  createResponder = (teams) => ({
    created: [created({ ...teams[0], team_name: '실제 등록 A' })],
    errors: [
      {
        row: 2,
        team_name: 'B',
        message: '중복입니다.',
        errors: [
          {
            code: 'duplicate_email',
            field: 'members.0.email',
            email: 'member@example.com',
            message: '이미 등록되었습니다.',
          },
        ],
      },
    ],
    results: [
      {
        row: 1,
        status: 'created',
        participant_team_id: 'created-0',
        warnings: [
          {
            code: 'invitation_failed',
            field: 'row',
            message: '팀 등록은 완료했지만 초대 메일을 예약하지 못했습니다.',
          },
        ],
      },
      { row: 2, status: 'failed', warnings: [] },
    ],
  });
  await inspect(raw);
  await validate();
  await click(button('확인한 2팀 등록'));
  const content = document.querySelector('dialog').textContent;
  assert.match(content, /실제 등록 A/);
  assert.match(content, /a@example.com/);
  assert.match(content, /초대 메일을 예약하지 못/);
  assert.match(content, /4행 · B/);
  assert.match(content, /팀원 1 이메일 \(member@example.com\): 이미 등록/);
  await click(button('실패한 내용 수정 · 다시 확인'));
  await validate();
  assert.equal(document.querySelectorAll('dialog fieldset').length, 1);
  assert.equal(document.querySelector('[aria-label="4행 팀명"]').value, 'B');
  createResponder = (teams) => ({ created: teams.map(created), errors: [] });
  await click(button('확인한 1팀 등록'));
  assert.deepEqual(
    creates[1].teams.map((row) => row.team_name),
    ['B'],
  );
});

test('contest or account replacement discards old validation and ignores its response', async () => {
  const old = deferred();
  previewResponder = () => old.promise;
  await inspect();
  await validate();
  await render({ contestId: 'contest-b', token: 'owner-b' });
  await act(async () => old.resolve(preview([team()])));
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(
    document.querySelector('[aria-label="참가팀 일괄 등록 내용"]').value,
    '',
  );
  assert.equal(creates.length, 0);
});

test('pending file reads cannot preview old text and manual edits invalidate a late file completion', async () => {
  const readers = [];
  global.FileReader = class {
    constructor() {
      readers.push(this);
    }
    readAsText() {}
  };
  await render();
  await click(button('일괄 등록 펼치기'));
  await input('참가팀 일괄 등록 내용', csv('Old'));
  const control = document.querySelector('[type=file]');
  Object.defineProperty(control, 'files', {
    value: [{ name: 'new.csv' }],
    configurable: true,
  });
  await act(async () =>
    control.dispatchEvent(new window.Event('change', { bubbles: true })),
  );
  assert.equal(button('일괄 등록 내용 확인').disabled, true);
  await input('참가팀 일괄 등록 내용', csv('Manual'));
  await act(async () => {
    readers[0].result = csv('Late file');
    readers[0].onload();
  });
  assert.match(
    document.querySelector('[aria-label="참가팀 일괄 등록 내용"]').value,
    /Manual/,
  );
  assert.equal(button('일괄 등록 내용 확인').disabled, false);
});

test('routine token refresh preserves edited confirmation content while revalidating with the new token', async () => {
  await inspect();
  await validate();
  await input('2행 팀명', '계속 편집 중');
  await validate();
  await render({ token: 'owner-a-refreshed' });
  assert.equal(
    document.querySelector('[aria-label="2행 팀명"]').value,
    '계속 편집 중',
  );
  assert.equal(button('확인한 1팀 등록').disabled, true);
  await validate();
  assert.equal(previews.at(-1).token, 'owner-a-refreshed');
  await click(button('확인한 1팀 등록'));
  assert.equal(creates[0].token, 'owner-a-refreshed');
  assert.equal(creates[0].teams[0].team_name, '계속 편집 중');
});

test('network uncertainty never repeats registration automatically and preserves edited input', async () => {
  await inspect();
  await validate();
  createResponder = () => {
    throw new Error('connection lost');
  };
  await click(button('확인한 1팀 등록'));
  assert.match(
    document.querySelector('dialog').textContent,
    /일부 팀이 등록되었을 수 있습니다/,
  );
  await validate();
  assert.equal(creates.length, 1);
  await click(button('닫기'));
  assert.match(
    document.querySelector('[aria-label="참가팀 일괄 등록 내용"]').value,
    /Team A/,
  );
});

test('long previews paginate ten teams and an empty error filter has an explicit state', async () => {
  const raw = [
    header,
    ...Array.from(
      { length: 11 },
      (_, i) => `Team${i},일반,Lead,a${i}@example.com,,`,
    ),
  ].join('\n');
  await inspect(raw);
  await validate();
  assert.equal(document.querySelectorAll('dialog fieldset').length, 10);
  await click(button('다음'));
  assert.equal(document.querySelectorAll('dialog fieldset').length, 1);
  await click(
    [...document.querySelectorAll('dialog label')]
      .find((label) => label.textContent.includes('오류가 있는 팀만'))
      .querySelector('input'),
  );
  assert.match(
    document.querySelector('dialog').textContent,
    /현재 표시할 오류가 없습니다/,
  );
});
