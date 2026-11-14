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
const sourceRoot = path.resolve(__dirname, '../src');
const cache = new Map();
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
const { usePresentationReleaseMotion } = source(
  'domains/submissionScoreboard/usePresentationReleaseMotion.ts',
);
const nativeNow = Date.now;
const nativeTimeout = window.setTimeout;
const nativeClearTimeout = window.clearTimeout;
let root,
  host,
  props,
  cues,
  now,
  timers,
  nextTimer,
  reduced,
  mediaListeners,
  observed,
  finish;
function section(step = 0, name = '팀 이름') {
  return {
    division: { division_id: 'division', name: '일반부' },
    scoring_mode: 'icpc',
    frozen: true,
    problems: [
      { problem_id: 'problem', problem_code: 'A', title: '문제 제목' },
    ],
    rows: [
      {
        team_id: 'team',
        team_name: name,
        rank: step ? 1 : 2,
        solved: step,
        submission_count: 2,
        problem_scores: [],
      },
    ],
    release: {
      strategy: 'resolver',
      mode: 'partial',
      total_count: 1,
      revealed_count: 0,
      ranks: [],
      resolver: {
        step,
        total_steps: 10,
        pending_count: 10 - step,
        last_event: step
          ? {
              team_id: 'team',
              team_name: name,
              problem_code: 'A',
              status: 'accepted',
              from_rank: 2,
              to_rank: 1,
            }
          : null,
      },
    },
  };
}
function Harness(next) {
  const value = usePresentationReleaseMotion(next);
  finish = value.finish;
  React.useLayoutEffect(() => {
    observed.push({
      scope: next.scopeKey,
      stage: value.stage,
      solved: value.sections[0]?.rows[0]?.solved,
      reveal: value.reveal,
    });
  });
  return h(
    'div',
    {
      'data-stage': value.stage,
      'data-solved': value.sections[0]?.rows[0]?.solved,
    },
    value.reveal ? '결과 공개' : '순위표',
  );
}
async function render(next = {}) {
  props = { ...props, ...next };
  await act(() => root.render(h(React.StrictMode, null, h(Harness, props))));
}
async function poll(step) {
  now += 100;
  await render({ sections: [section(step)], updatedAt: now });
}
async function deadline() {
  const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
  assert.ok(timer, 'The active stage must own a cancellable timer');
  timers.delete(id);
  now = timer.at;
  await act(() => timer.callback());
}
async function startResult() {
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'result');
}
async function returnToBoard() {
  if (host.firstChild.dataset.stage === 'result') await deadline();
  assert.equal(host.firstChild.dataset.stage, 'returning');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'holding');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'highlighting');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'moving');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'board');
}
function visibility(value) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
  document.dispatchEvent(new window.Event('visibilitychange'));
}
beforeEach(() => {
  now = 1_000_000;
  Date.now = () => now;
  timers = new Map();
  nextTimer = 0;
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  reduced = false;
  mediaListeners = new Set();
  window.matchMedia = () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener),
  });
  visibility('visible');
  cues = [];
  observed = [];
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
  props = {
    scopeKey: 'scope',
    contestId: 'contest',
    sections: [section()],
    ended: true,
    updatedAt: now,
    suppressed: false,
    onCue: (cue) => cues.push(cue),
  };
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined;
  host.remove();
  Date.now = nativeNow;
  window.setTimeout = nativeTimeout;
  window.clearTimeout = nativeClearTimeout;
});
after(() => dom.window.close());

test('StrictMode paints the old board hold and highlight before a separate updated movement frame', async () => {
  await render();
  assert.deepEqual(cues, []);
  assert.equal(timers.size, 0);
  await poll(1);
  assert.deepEqual(cues, []);
  assert.equal(host.firstChild.dataset.stage, 'focusing');
  assert.equal(host.firstChild.dataset.solved, '0');
  assert.equal([...timers.values()][0].at - now, 420);
  await deadline();
  assert.deepEqual(cues, []);
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  assert.equal(host.firstChild.dataset.solved, '0');
  assert.equal([...timers.values()][0].at - now, 1100);
  await act(() => finish());
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  assert.equal([...timers.values()][0].at - now, 1100);
  await deadline();
  assert.deepEqual(cues, ['accepted']);
  assert.equal(host.firstChild.dataset.stage, 'result');
  assert.equal(host.firstChild.dataset.solved, '0');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'returning');
  assert.equal(host.firstChild.dataset.solved, '0');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'holding');
  assert.equal(host.firstChild.dataset.solved, '0');
  assert.equal([...timers.values()][0].at - now, 300);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'highlighting');
  assert.equal(host.firstChild.dataset.solved, '0');
  assert.equal([...timers.values()][0].at - now, 180);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'moving');
  assert.equal(host.firstChild.dataset.solved, '1');
  assert.equal([...timers.values()][0].at - now, 600);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal([...timers.values()][0].at - now, 300);
  await deadline();
  assert.equal(timers.size, 0);
});

test('rapid results queue and play their cue at the actual second spotlight using the latest callback', async () => {
  const first = [],
    second = [];
  await render({ onCue: (cue) => first.push(cue) });
  await poll(1);
  assert.deepEqual(first, []);
  await startResult();
  await render({ onCue: (cue) => second.push(cue) });
  await poll(2);
  assert.deepEqual(first, ['accepted']);
  assert.deepEqual(second, []);
  await returnToBoard();
  assert.equal(host.firstChild.dataset.solved, '1');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'focusing');
  assert.deepEqual(second, []);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  assert.deepEqual(second, []);
  await deadline();
  assert.deepEqual(second, ['accepted']);
  assert.equal(host.firstChild.dataset.stage, 'result');
  assert.equal(host.firstChild.dataset.solved, '1');
  await returnToBoard();
  assert.equal(host.firstChild.dataset.solved, '2');
});

test('hidden tabs cancel suspense before any cue and do not replay the first fresh result after returning', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  await act(() => visibility('hidden'));
  assert.equal(timers.size, 0);
  assert.equal(host.firstChild.dataset.stage, 'board');
  await act(() => visibility('visible'));
  await poll(2);
  assert.deepEqual(cues, []);
  await poll(3);
  assert.deepEqual(cues, []);
  await startResult();
  assert.deepEqual(cues, ['accepted']);
});

test('runtime reduced-motion changes cancel suspense silently and keep later rows current without timers', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  await act(() => {
    reduced = true;
    mediaListeners.forEach((listener) => listener());
  });
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal(host.firstChild.dataset.solved, '1');
  assert.equal(timers.size, 0);
  await poll(2);
  assert.equal(host.firstChild.dataset.solved, '2');
  assert.deepEqual(cues, []);
  assert.equal(timers.size, 0);
});

test('scope changes synchronously hide retained private teams before effects and cancel the old timer', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  observed = [];
  now += 100;
  await render({
    scopeKey: 'new-auth-and-filter',
    contestId: 'other',
    sections: [section(7, '다른 계정의 팀')],
    updatedAt: now,
  });
  assert.ok(observed.length > 0);
  assert.ok(
    observed.every(
      (frame) =>
        frame.stage === 'board' && frame.solved === 7 && frame.reveal === null,
    ),
  );
  assert.equal(timers.size, 0);
  assert.deepEqual(cues, []);
});

test('suppression immediately returns the latest authoritative rows; dismiss skips reading but preserves the return frame', async () => {
  await render();
  await poll(1);
  await startResult();
  await act(() => finish());
  assert.equal(host.firstChild.dataset.stage, 'returning');
  assert.equal(host.firstChild.dataset.solved, '0');
  await render({ suppressed: true });
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal(host.firstChild.dataset.solved, '1');
  assert.equal(timers.size, 0);
  await render({ suppressed: false });
  await poll(2);
  assert.deepEqual(cues, ['accepted']);
  await poll(3);
  assert.deepEqual(cues, ['accepted']);
  await startResult();
  assert.deepEqual(cues, ['accepted', 'accepted']);
});

test('unmount removes listeners and every stage timer so an abandoned popup cannot emit later cues', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  assert.equal(timers.size, 1);
  assert.ok(mediaListeners.size > 0);
  await act(() => root.unmount());
  root = undefined;
  assert.equal(timers.size, 0);
  assert.equal(mediaListeners.size, 0);
});

test('a wall-clock rollback at a scheduled transition cancels the overlay instead of leaving an expired timer stuck', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  const [id, timer] = [...timers][0];
  timers.delete(id);
  now -= 1000;
  await act(() => timer.callback());
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal(host.firstChild.dataset.solved, '1');
  assert.equal(timers.size, 0);
  assert.deepEqual(cues, []);
});

test('undo during suspense clears its cue and queue before an intentional next action focuses again', async () => {
  await render();
  await poll(1);
  await poll(2);
  assert.equal(host.firstChild.dataset.stage, 'focusing');
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  await poll(0);
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal(host.firstChild.dataset.solved, '0');
  assert.equal(timers.size, 0);
  assert.deepEqual(cues, []);
  await poll(1);
  assert.equal(host.firstChild.dataset.stage, 'focusing');
  assert.deepEqual(cues, []);
  await startResult();
  assert.deepEqual(cues, ['accepted']);
});

test('stale data cancels silent suspense and requires a fresh baseline before another result can play', async () => {
  await render();
  await poll(1);
  await deadline();
  assert.equal(host.firstChild.dataset.stage, 'suspense');
  now += 11_000;
  await render({ sections: [section(2)], updatedAt: now - 11_000 });
  assert.equal(host.firstChild.dataset.stage, 'board');
  assert.equal(host.firstChild.dataset.solved, '2');
  assert.equal(timers.size, 0);
  assert.deepEqual(cues, []);
  await poll(2);
  assert.equal(host.firstChild.dataset.stage, 'board');
  await poll(3);
  await startResult();
  assert.deepEqual(cues, ['accepted']);
});
