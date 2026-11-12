const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/presentation/contests/test',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
const sourceRoot = path.resolve(__dirname, '../src');
function source(relative) {
  const filename = path.resolve(sourceRoot, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (!id.startsWith('@/') && !id.startsWith('.')) return native(id);
    const target = id.startsWith('@/')
      ? path.resolve(sourceRoot, id.slice(2))
      : path.resolve(path.dirname(filename), id);
    const resolved = [target, `${target}.ts`, `${target}.tsx`].find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    assert.ok(resolved, `Cannot resolve ${id}`);
    return source(path.relative(sourceRoot, resolved));
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { usePresentationReleaseSounds } = source(
  'domains/submissionScoreboard/usePresentationReleaseSounds.ts',
);
const nativeNow = Date.now;
let root, host, props, cues, now;
function resolverSection(step = 0, status = 'accepted') {
  return {
    division: { division_id: 'division', name: '일반부' },
    frozen: true,
    problems: [],
    rows: ['team', 'other-team', 'last-team'].map((teamId, index) => ({
      team_id: teamId,
      team_name: index ? teamId : '발표할 팀',
      rank: index + 1,
      solved: step && !index ? 1 : 0,
      penalty: 30,
      submission_count: 2,
      rank_is_final: false,
      is_revealed: true,
      problem_scores: [],
    })),
    release: {
      strategy: 'resolver',
      revision: 1 + step,
      mode: 'partial',
      ranks: [],
      revealed_count: 0,
      total_count: 3,
      resolver: {
        step,
        total_steps: 3,
        pending_count: 3 - step,
        last_event: step
          ? {
              team_id: 'team',
              team_name: '발표할 팀',
              problem_code: step === 1 ? 'A' : 'B',
              status,
              from_rank: 3,
              to_rank: 2,
            }
          : null,
      },
    },
  };
}
function manualSection(count = 0) {
  return {
    division: { division_id: 'division', name: '일반부' },
    frozen: count < 3,
    problems: [],
    rows: [1, 2, 3].map((rank) => ({
      team_id: `team-${rank}`,
      team_name: rank > 3 - count ? `팀 ${rank}` : '',
      rank,
      solved: 1,
      penalty: 30,
      submission_count: 2,
      is_revealed: rank > 3 - count,
      rank_is_final: rank > 3 - count,
      problem_scores: [],
    })),
    release: {
      strategy: 'manual',
      revision: 1 + count,
      mode: count === 3 ? 'all' : 'partial',
      ranks: [1, 2, 3].map((rank) => ({
        rank,
        team_count: 1,
        revealed: rank > 3 - count,
      })),
      revealed_count: count,
      total_count: 3,
    },
  };
}
function Harness(next) {
  usePresentationReleaseSounds(next);
  return null;
}
async function render(next = {}) {
  props = { ...props, ...next };
  await act(() => root.render(h(React.StrictMode, null, h(Harness, props))));
}
function visibility(value) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
  document.dispatchEvent(new window.Event('visibilitychange'));
}
function nextPoll(section) {
  now += 1000;
  return { sections: [section], updatedAt: now };
}
beforeEach(() => {
  now = Date.parse('2026-11-12T09:00:00Z');
  Date.now = () => now;
  cues = [];
  visibility('visible');
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  props = {
    contestId: 'test',
    sections: [resolverSection()],
    ended: true,
    updatedAt: now,
    onCue: (cue) => cues.push(cue),
  };
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined;
  host.remove();
  Date.now = nativeNow;
});
after(() => dom.window.close());

test('StrictMode establishes a quiet baseline, plays one new AC event and uses the latest callback', async () => {
  const first = [],
    second = [];
  await render({ onCue: (cue) => first.push(cue) });
  assert.deepEqual(first, []);
  await render(nextPoll(resolverSection()));
  assert.deepEqual(second, []);
  await render({
    ...nextPoll(resolverSection(1)),
    onCue: (cue) => second.push(cue),
  });
  assert.deepEqual(first, []);
  assert.deepEqual(second, ['accepted']);
  await render(nextPoll(resolverSection(1)));
  await render({ sections: [resolverSection(1)] });
  assert.deepEqual(second, ['accepted']);
});

test('manual rank publication and complete publication play once, with no replay on polling', async () => {
  await render({ sections: [manualSection()] });
  assert.deepEqual(cues, []);
  await render(nextPoll(manualSection(1)));
  assert.deepEqual(cues, ['result']);
  await render(nextPoll(manualSection(1)));
  assert.deepEqual(cues, ['result']);
  await render(nextPoll(manualSection(3)));
  assert.deepEqual(cues, ['result', 'complete']);
  await render(nextPoll(manualSection(3)));
  assert.deepEqual(cues, ['result', 'complete']);
});

test('visibility changes pause the tracker and resume with a quiet baseline instead of a backlog', async () => {
  await render();
  await act(() => visibility('hidden'));
  await render(nextPoll(resolverSection(1)));
  assert.deepEqual(cues, []);
  await act(() => visibility('visible'));
  await render(nextPoll(resolverSection(1)));
  assert.deepEqual(cues, []);
  await render(nextPoll(resolverSection(2, 'wrong_answer')));
  assert.deepEqual(cues, ['rejected']);
});

test('a hidden period without polling still consumes the first snapshot on resume', async () => {
  await render();
  await act(() => visibility('hidden'));
  now += 2000;
  await act(() => visibility('visible'));
  await render(nextPoll(resolverSection(1)));
  assert.deepEqual(cues, []);
  await render(nextPoll(resolverSection(2)));
  assert.deepEqual(cues, ['accepted']);
});

test('suppression consumes a result so removing an overlay never replays it', async () => {
  await render();
  await render({ ...nextPoll(resolverSection(1)), suppressed: true });
  assert.deepEqual(cues, []);
  await render({ suppressed: false });
  await render(nextPoll(resolverSection(1)));
  assert.deepEqual(cues, []);
  await render(nextPoll(resolverSection(2)));
  assert.deepEqual(cues, ['accepted']);
});

test('unmount removes the live visibility listener and leaves no callback source behind', async () => {
  const originalAdd = document.addEventListener;
  const originalRemove = document.removeEventListener;
  const listeners = new Set();
  document.addEventListener = function (type, listener, options) {
    if (type === 'visibilitychange') listeners.add(listener);
    return originalAdd.call(this, type, listener, options);
  };
  document.removeEventListener = function (type, listener, options) {
    if (type === 'visibilitychange') listeners.delete(listener);
    return originalRemove.call(this, type, listener, options);
  };
  try {
    await render();
    assert.equal(listeners.size, 1);
    await act(() => root.unmount());
    root = undefined;
    assert.equal(listeners.size, 0);
    visibility('hidden');
    visibility('visible');
    assert.deepEqual(cues, []);
  } finally {
    document.addEventListener = originalAdd;
    document.removeEventListener = originalRemove;
  }
});
