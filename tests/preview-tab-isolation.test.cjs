const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const tabs = [0, 1].map(
  () => new JSDOM('<html></html>', { url: 'https://judge.test/' }),
);
// Real browser tabs share account storage but have independent sessionStorage.
Object.defineProperty(tabs[1].window, 'localStorage', {
  value: tabs[0].window.localStorage,
});
global.window = tabs[0].window;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.startsWith('@/') ? source(id.slice(2) + '.ts') : native(id);
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const storage = source('domains/identityAccess/sessionStorage.ts');
const previewMode = source('domains/identityAccess/participantPreview.ts');
const general = {
  accessToken: 'account-token',
  account: { email: 'operator@example.test', display_name: '운영자' },
  participantContests: [],
  operatorContests: [
    {
      contest: { contest_id: 'contest' },
      scopes: ['contest.view', 'contest.participant.preview'],
    },
  ],
};
const realParticipant = {
  contestId: 'other',
  accessToken: 'real-token',
  member: { email: general.account.email },
  isPreview: false,
};
const preview = {
  contestId: 'contest',
  accessToken: general.accessToken,
  member: { email: general.account.email },
  isPreview: true,
};
beforeEach(() => {
  for (const tab of tabs) tab.window.sessionStorage.clear();
  window = tabs[0].window;
  window.localStorage.clear();
  storage.saveGeneralSession(general);
  storage.saveParticipantSession(realParticipant);
});
after(() => tabs.forEach((tab) => tab.window.close()));

test('preview stays in its tab and leaves the shared real participant session intact', () => {
  window = tabs[1].window;
  previewMode.activateParticipantPreview(general, 'contest');
  storage.saveParticipantSession(preview);
  assert.equal(storage.loadStoredParticipantSession().isPreview, true);
  assert.equal(
    previewMode.isParticipantPreviewMode(general, 'contest', ''),
    true,
  );
  assert.deepEqual(
    JSON.parse(window.localStorage.getItem(storage.PARTICIPANT_SESSION_KEY)),
    realParticipant,
  );
  window = tabs[0].window;
  assert.deepEqual(storage.loadStoredParticipantSession(), realParticipant);
  assert.equal(
    previewMode.isParticipantPreviewMode(general, 'contest', ''),
    false,
  );
});

test('preview permission needs explicit entry and an identity match in this tab', () => {
  assert.equal(
    previewMode.isParticipantPreviewMode(general, 'contest', ''),
    false,
  );
  assert.equal(
    previewMode.isParticipantPreviewMode(general, 'contest', '?preview=1'),
    true,
  );
  previewMode.activateParticipantPreview(general, 'contest');
  storage.saveParticipantSession(preview);
  const different = {
    ...general,
    account: { ...general.account, email: 'someone@example.test' },
  };
  storage.saveGeneralSession(different);
  assert.equal(
    previewMode.isParticipantPreviewMode(different, 'contest', ''),
    false,
  );
  assert.deepEqual(storage.loadStoredParticipantSession(), realParticipant);
  assert.equal(
    previewMode.isParticipantPreviewMode(
      { ...general, operatorContests: [] },
      'contest',
      '?preview=1',
    ),
    false,
  );
});

test('legacy shared preview state does not activate participant mode after an upgrade', () => {
  window.localStorage.setItem(
    storage.PARTICIPANT_SESSION_KEY,
    JSON.stringify(preview),
  );
  assert.equal(storage.loadStoredParticipantSession(), null);
  assert.equal(
    previewMode.isParticipantPreviewMode(general, 'contest', ''),
    false,
  );
});

test('logout removes this tab preview identity and selection', () => {
  previewMode.activateParticipantPreview(general, 'contest');
  storage.saveParticipantSession(preview);
  storage.saveGeneralSession(null);
  storage.saveParticipantSession(null);
  assert.equal(storage.loadStoredParticipantSession(), null);
  assert.equal(
    window.sessionStorage.getItem(storage.PARTICIPANT_PREVIEW_SESSION_KEY),
    null,
  );
  assert.equal(
    window.sessionStorage.getItem(storage.PARTICIPANT_PREVIEW_MODE_KEY),
    null,
  );
});
