const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://zoj.kr/presentation' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
function source(name) {
  const filename = path.resolve(
    __dirname,
    '../src/domains/submissionScoreboard',
    name,
  );
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (id) =>
    id.startsWith('./') ? source(id.slice(2) + '.ts') : require(id);
  cache.set(filename, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const { PresentationAwardsTracker, presentationAwardGroups } = source(
  'presentationAwards.ts',
);
const { usePresentationAwards } = source('usePresentationAwards.ts');

function section({
  id = 'open',
  mode = 'partial',
  strategy = 'resolver',
  roster = ['one', 'two', 'three'],
  revealed = mode === 'all' ? roster.length : 0,
  step = mode === 'all' ? 3 : 0,
  totalSteps = 3,
  revision,
  event = null,
  scoring = 'icpc',
  ranks,
} = {}) {
  return {
    division: { division_id: id, code: id, name: id },
    scoring_mode: scoring,
    frozen: mode !== 'all',
    problems: [{ problem_id: 'problem', problem_code: 'A', title: '문제 A' }],
    rows: roster.map((team, index) => ({
      team_id: `${id}-${team}`,
      team_name: team,
      division_id: id,
      division: id,
      rank: ranks?.[index] ?? index + 1,
      solved: 3 - index,
      penalty: (index + 1) * 20,
      total_score: (3 - index) * 100,
      max_score: 300,
      submission_count: 4,
      problem_scores: [],
      is_revealed: true,
      ...(strategy === 'manual' && mode !== 'all'
        ? { rank_is_final: index < revealed, is_revealed: index < revealed }
        : {}),
    })),
    release: {
      strategy,
      mode,
      total_count: mode === 'not_started' ? 0 : roster.length,
      revealed_count: revealed,
      ranks: [],
      ...(revision === undefined ? {} : { revision }),
      ...(strategy === 'resolver'
        ? {
            resolver: {
              step,
              total_steps: totalSteps,
              pending_count: Math.max(0, totalSteps - step),
              last_event: event,
            },
          }
        : {}),
    },
  };
}
function harness() {
  const tracker = new PresentationAwardsTracker();
  let now = 1_000_000;
  let last = [];
  return {
    tracker,
    get state() {
      return tracker.getSnapshot();
    },
    get now() {
      return now;
    },
    update(sections = last, options = {}) {
      now += 100;
      last = Array.isArray(sections) ? sections : [sections];
      return tracker.update({
        scopeKey: 'scope',
        contestId: 'contest',
        sections: last,
        ended: true,
        updatedAt: now,
        now,
        visible: true,
        ready: true,
        ...options,
      });
    },
    finish(key = tracker.getSnapshot().key) {
      return tracker.complete(key, now + 1);
    },
  };
}

test('already public first loads and repeated immediate-policy polls never announce awards', () => {
  for (const strategy of ['resolver', 'manual', 'manual_all', 'immediate']) {
    const h = harness();
    h.update(section({ mode: 'all', strategy }));
    assert.equal(h.update(), undefined);
    assert.equal(h.state.section, null);
    assert.equal(h.state.pendingCount, 0);
  }
});

test('a freshly observed immediate-policy ending waits through the last-minute and end-message screens', () => {
  for (const beforeMode of ['partial', 'all']) {
    const h = harness();
    const running = section({ strategy: 'immediate', mode: beforeMode });
    let now = 1_000_000;
    h.update(running, { ended: false, ready: false, now, updatedAt: now });
    for (let seconds = 1; seconds <= 60; seconds++) {
      now += 1_000;
      assert.equal(
        h.update(running, { ended: false, ready: false, now, updatedAt: now }),
        undefined,
      );
      assert.equal(h.state.pendingCount, 0);
    }
    const all = section({ strategy: 'immediate', mode: 'all' });
    now += 1_000;
    h.update(all, { ended: true, ready: false, now, updatedAt: now });
    assert.equal(h.state.pendingCount, 1, beforeMode);
    assert.equal(h.state.section, null);
    for (let seconds = 0; seconds < 2; seconds++) {
      now += 1_000;
      assert.equal(
        h.update(all, { ended: true, ready: false, now, updatedAt: now }),
        undefined,
      );
      assert.equal(h.state.pendingCount, 1);
    }
    now += 100;
    assert.equal(
      h.update(all, { ended: true, ready: true, now, updatedAt: now }),
      'celebration',
    );
    assert.equal(h.state.section.division.division_id, 'open');
    assert.equal(
      h.update(all, { ended: true, ready: true, now, updatedAt: now }),
      undefined,
    );
  }
});

test('unobserved endings, first-load ended results and running all-public data cannot create an automatic ceremony', () => {
  for (const interruption of [
    { visible: false },
    { suppressed: true },
    { now: 1_030_000, updatedAt: 1_030_000 },
    { now: 1_011_000, updatedAt: 1_000_100 },
  ]) {
    const h = harness();
    const all = section({ strategy: 'immediate', mode: 'all' });
    h.update(all, { ended: false });
    h.update(all, { ended: true, ready: false, ...interruption });
    assert.equal(h.state.pendingCount, 0);
    h.update(all, { ended: true, now: 1_040_000, updatedAt: 1_040_000 });
    assert.equal(
      h.update(all, { ended: true, now: 1_040_100, updatedAt: 1_040_100 }),
      undefined,
    );
    assert.equal(h.state.section, null);
  }
  for (const strategy of ['immediate', 'manual_all', 'manual', 'resolver']) {
    const h = harness();
    const all = section({ strategy, mode: 'all' });
    h.update(all, { ended: false });
    assert.equal(h.update(all, { ended: false, ready: true }), undefined);
    assert.equal(
      h.state.pendingCount,
      0,
      'A misleading ready flag cannot celebrate a running contest',
    );
    if (strategy !== 'immediate') {
      h.update(all, { ended: true });
      assert.equal(
        h.update(all),
        undefined,
        'Only immediate policy awards an automatic end transition',
      );
    }
  }
});

test('completion is recorded before the old idle render, then waits through final-result movement and fade', () => {
  const h = harness();
  h.update(section({ step: 2 }));
  const all = section({
    mode: 'all',
    event: {
      team_id: 'open-one',
      team_name: 'one',
      problem_code: 'A',
      status: 'accepted',
      from_rank: 2,
      to_rank: 1,
    },
  });
  assert.equal(
    h.update(all),
    undefined,
    'The previous render can still claim idle',
  );
  assert.equal(h.state.pendingCount, 1);
  assert.equal(h.state.section, null);
  for (const stage of [
    'focusing',
    'suspense',
    'result',
    'returning',
    'holding',
    'highlighting',
    'moving',
    'fading',
  ]) {
    assert.equal(h.update(all, { ready: false }), undefined, stage);
    assert.equal(h.state.section, null, stage);
  }
  assert.equal(h.update(all, { ready: true }), 'celebration');
  assert.equal(h.state.section.rows[0].team_id, 'open-one');
  assert.equal(h.update(all), undefined);
  h.finish();
  assert.equal(h.state.section, null);
  assert.equal(
    h.update(all),
    undefined,
    'A fresh poll cannot replay the ceremony',
  );
});

test('all selected nonempty divisions must be public, then each observed completion is awarded once', () => {
  const h = harness();
  const a = section({ id: 'a' }),
    b = section({ id: 'b', strategy: 'manual_all' });
  const aAll = section({ id: 'a', mode: 'all' }),
    bAll = section({ id: 'b', strategy: 'manual_all', mode: 'all' });
  h.update([a, b]);
  h.update([aAll, b]);
  assert.equal(h.update([aAll, b]), undefined);
  assert.equal(h.state.pendingCount, 1);
  h.update([aAll, bAll]);
  assert.equal(
    h.state.section,
    null,
    'The last division has its own final result to show',
  );
  assert.equal(h.update([aAll, bAll]), 'celebration');
  const firstKey = h.state.key;
  assert.equal(h.state.section.division.division_id, 'a');
  assert.equal(h.finish(), 'celebration');
  assert.equal(h.state.section.division.division_id, 'b');
  assert.equal(
    h.finish(firstKey),
    undefined,
    'An old callback cannot skip the next division',
  );
  assert.equal(h.state.section.division.division_id, 'b');
  h.finish();
  assert.equal(h.state.pendingCount, 0);
  assert.equal(h.update([aAll, bAll]), undefined);
});

test('empty divisions neither block completion nor receive awards; first-load all divisions are not added later', () => {
  const h = harness();
  const empty = section({ id: 'empty', roster: [], totalSteps: 0 });
  empty.release = null;
  const loadedAll = section({ id: 'loaded', mode: 'all' });
  h.update([loadedAll, empty, section()]);
  const changedEmpty = structuredClone(empty);
  changedEmpty.release = { ...section({ mode: 'all' }).release };
  h.update([loadedAll, changedEmpty, section({ mode: 'all' })]);
  assert.equal(h.update(), 'celebration');
  assert.equal(h.state.section.division.division_id, 'open');
  assert.equal(h.finish(), undefined);
});

test('actual not-started count initialization permits a first batch release without treating other total changes as completion', () => {
  for (const strategy of ['resolver', 'manual', 'manual_all']) {
    const h = harness();
    h.update(
      section({ strategy, mode: 'not_started', step: 0, totalSteps: 0 }),
    );
    h.update(section({ strategy, mode: 'all' }));
    assert.equal(h.update(), 'celebration', strategy);
  }
  const h = harness();
  h.update(section());
  const all = section({ mode: 'all' });
  all.release.total_count = 4;
  h.update(all);
  assert.equal(h.update(section({ mode: 'all' })), undefined);
  assert.equal(h.state.section, null);
});

test('undo interrupts an active ceremony and an observed fresh re-release can be celebrated again', () => {
  for (const strategy of ['resolver', 'manual', 'manual_all', 'immediate']) {
    const h = harness();
    h.update(section({ strategy }));
    h.update(section({ strategy, mode: 'all' }));
    assert.equal(h.update(), 'celebration');
    const firstKey = h.state.key;
    h.update(section({ strategy }));
    assert.equal(h.state.section, null);
    h.update(section({ strategy, mode: 'all' }));
    assert.equal(h.update(), 'celebration');
    assert.notEqual(h.state.key, firstKey);
  }
});

test('filter, session, contest, roster, strategy, invalid IDs and totals reset pending ceremonies', () => {
  const mutations = [
    () => ({ scopeKey: 'other-session' }),
    () => ({ contestId: 'other-contest' }),
    () => ({
      sections: [section({ mode: 'all', roster: ['one', 'two', 'new'] })],
    }),
    () => ({ sections: [section({ mode: 'all', strategy: 'manual' })] }),
    () => ({ sections: [section({ mode: 'all' }), section({ mode: 'all' })] }),
    () => ({ sections: [] }),
    () => {
      const s = section({ mode: 'all' });
      s.rows[1].team_id = s.rows[0].team_id;
      return { sections: [s] };
    },
    () => {
      const s = section({ mode: 'all' });
      s.rows[0].is_revealed = false;
      return { sections: [s] };
    },
    () => {
      const s = section({ mode: 'all' });
      s.release.total_count++;
      return { sections: [s] };
    },
    () => {
      const s = section({ mode: 'all' });
      s.release = null;
      return { sections: [s] };
    },
  ];
  for (const mutate of mutations) {
    const h = harness();
    h.update(section());
    h.update(section({ mode: 'all' }), { ready: false });
    assert.equal(h.state.pendingCount, 1);
    const change = mutate();
    const next = change.sections ?? section({ mode: 'all' });
    h.update(next, change);
    assert.equal(h.state.pendingCount, 0, JSON.stringify(change));
    assert.equal(h.state.section, null);
    h.update(next, change);
    assert.equal(h.state.section, null);
  }
});

test('stale, hidden, suppressed, error-like gaps and clock rollback cancel instead of replaying missed completions', () => {
  const interruptions = [
    { visible: false },
    { suppressed: true },
    { ended: false },
    { updatedAt: 1_000_100, now: 1_011_000 },
    { updatedAt: 1_030_000, now: 1_030_000 },
    { updatedAt: 1_000_001, now: 1_000_050 },
    { updatedAt: 1_000_201, now: 1_000_150 },
    { updatedAt: NaN },
    { now: NaN },
  ];
  for (const interruption of interruptions) {
    const h = harness();
    h.update(section());
    h.update(section({ mode: 'all' }), { ready: false });
    h.update(section({ mode: 'all' }), interruption);
    assert.equal(h.state.pendingCount, 0);
    assert.equal(h.state.section, null);
    h.update(section({ mode: 'all' }), {
      updatedAt: 1_040_000,
      now: 1_040_000,
    });
    assert.equal(
      h.update(section({ mode: 'all' }), {
        updatedAt: 1_040_100,
        now: 1_040_100,
      }),
      undefined,
    );
    assert.equal(h.state.section, null);
  }
});

test('resolver jumps with a last event are discontinuous; an explicit batch with no last event remains valid', () => {
  const event = {
    team_id: 'open-one',
    team_name: 'one',
    problem_code: 'A',
    status: 'accepted',
    from_rank: 2,
    to_rank: 1,
  };
  const missed = harness();
  missed.update(section());
  missed.update(section({ mode: 'all', event }));
  assert.equal(missed.update(), undefined);
  assert.equal(missed.state.section, null);
  const batch = harness();
  batch.update(section());
  batch.update(section({ mode: 'all', event: null }));
  assert.equal(batch.update(), 'celebration');
});

test('lost polling expires active or queued awards and resumes with a quiet baseline', () => {
  for (const active of [true, false]) {
    const h = harness();
    h.update(section());
    h.update(section({ mode: 'all' }), { ready: active });
    if (active) h.update();
    assert.ok(h.state.expiresAt);
    assert.equal(h.tracker.check(h.state.expiresAt), false);
    assert.equal(h.state.section, null);
    assert.equal(h.state.pendingCount, 0);
    h.update(section({ mode: 'all' }), {
      now: 1_020_000,
      updatedAt: 1_020_000,
    });
    assert.equal(
      h.update(section({ mode: 'all' }), {
        now: 1_020_100,
        updatedAt: 1_020_100,
      }),
      undefined,
    );
  }
});

test('fresh successful polling extends the watchdog throughout a long multi-division ceremony', () => {
  const h = harness();
  h.update(section());
  const all = section({ mode: 'all' });
  h.update(all);
  h.update(all);
  const key = h.state.key;
  const started = h.now;
  for (let elapsed = 5_000; elapsed <= 35_000; elapsed += 5_000) {
    const now = started + elapsed;
    assert.equal(h.update(all, { now, updatedAt: now }), undefined);
    assert.equal(h.state.key, key);
    assert.ok(h.state.section);
    assert.ok(h.state.expiresAt > now + 9_000);
  }
  h.tracker.complete(key, started + 35_001);
  assert.equal(h.state.section, null);
});

test('retained data is immutable from the caller while a still-public fresh payload updates the active winners', () => {
  const h = harness();
  h.update(section());
  const all = section({ mode: 'all', scoring: 'ioi' });
  h.update(all);
  h.update(all);
  all.rows[0].team_name = '새 이름';
  assert.equal(h.state.section.rows[0].team_name, 'one');
  assert.equal(h.update(all), undefined);
  assert.equal(h.state.section.rows[0].team_name, '새 이름');
  assert.equal(h.state.section.rows[0].total_score, 300);
});

test('official top-three ranks retain every tie without synthesizing missing medals or leaking hidden identities', () => {
  const s = section({ mode: 'all', ranks: [1, 1, 3], scoring: 'ioi' });
  s.rows.forEach((row) => {
    row.rank_is_final = false;
    row.total_score = row.rank === 1 ? 200.5 : 0;
  });
  assert.deepEqual(
    presentationAwardGroups(s).map((group) => [group.rank, group.teams.length]),
    [
      [1, 2],
      [3, 1],
    ],
  );
  s.rows[0].is_revealed = false;
  s.rows[2].team_name = '   ';
  assert.deepEqual(
    presentationAwardGroups(s).map((group) => [group.rank, group.teams.length]),
    [[1, 1]],
  );
  const tie = section({
    mode: 'all',
    roster: Array.from({ length: 16 }, (_, i) => String(i)),
    ranks: Array(16).fill(1),
  });
  assert.equal(presentationAwardGroups(tie)[0].teams.length, 16);
  assert.equal(
    presentationAwardGroups({
      ...tie,
      release: { ...tie.release, mode: 'partial' },
    }).length,
    0,
  );
});

let root,
  host,
  props,
  result,
  cues,
  timers,
  nextTimer,
  clock,
  media,
  mediaListeners,
  setReady,
  renderTrace;
const nativeNow = Date.now;
const nativeSetTimeout = window.setTimeout;
const nativeClearTimeout = window.clearTimeout;
function Harness() {
  const [ready, updateReady] = React.useState(props.ready);
  setReady = updateReady;
  // Reproduce a preceding motion-hook effect changing the previous idle value.
  React.useEffect(() => {
    if (props.startMotion) updateReady(false);
  }, [props.sections]);
  result = usePresentationAwards({
    ...props,
    ready,
    onCue: (cue) => cues.push(cue),
  });
  renderTrace.push(result.section?.division.division_id ?? null);
  return h('output', null, result.section?.division.division_id ?? 'board');
}
async function renderHook(overrides = {}, strict = false) {
  props = { ...props, ...overrides };
  await act(() =>
    root.render(strict ? h(React.StrictMode, null, h(Harness)) : h(Harness)),
  );
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  cues = [];
  renderTrace = [];
  timers = new Map();
  nextTimer = 0;
  clock = 1_000_000;
  Date.now = () => clock;
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  mediaListeners = new Set();
  media = {
    matches: false,
    addEventListener: (_, listener) => mediaListeners.add(listener),
    removeEventListener: (_, listener) => mediaListeners.delete(listener),
  };
  window.matchMedia = () => media;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  props = {
    scopeKey: 'scope',
    contestId: 'contest',
    sections: [section()],
    ended: true,
    updatedAt: clock,
    ready: true,
    startMotion: false,
  };
});
afterEach(async () => {
  await act(() => root.unmount());
  assert.equal(timers.size, 0);
  assert.equal(mediaListeners.size, 0);
  Date.now = nativeNow;
  window.setTimeout = nativeSetTimeout;
  window.clearTimeout = nativeClearTimeout;
});
after(() => dom.window.close());

test('the hook waits for a preceding motion effect and celebrates once under StrictMode', async () => {
  await renderHook({}, true);
  clock += 100;
  await renderHook(
    {
      sections: [section({ mode: 'all' })],
      updatedAt: clock,
      startMotion: true,
    },
    true,
  );
  assert.equal(result.section, null);
  assert.deepEqual(cues, []);
  await act(() => setReady(true));
  assert.equal(result.section.division.division_id, 'open');
  assert.deepEqual(cues, ['celebration']);
  await renderHook({}, true);
  assert.deepEqual(cues, ['celebration']);
  await act(() => result.complete());
  assert.equal(result.section, null);
  assert.deepEqual(cues, ['celebration']);
});

test('reduced motion retains the completion ceremony and follows preference changes without replay', async () => {
  media.matches = true;
  await renderHook();
  clock += 100;
  await renderHook({ sections: [section({ mode: 'all' })], updatedAt: clock });
  assert.ok(result.section);
  assert.equal(result.reducedMotion, true);
  await act(() => {
    media.matches = false;
    mediaListeners.forEach((listener) => listener());
  });
  assert.equal(result.reducedMotion, false);
  assert.deepEqual(cues, ['celebration']);
});

test('the hook observes an immediate-policy end even when the release stays all during the countdown', async () => {
  const all = section({ strategy: 'immediate', mode: 'all' });
  await renderHook({ sections: [all], ended: false, ready: false });
  clock += 1_000;
  await renderHook({ ended: false, updatedAt: clock });
  assert.equal(result.section, null);
  clock += 1_000;
  await renderHook({ ended: true, updatedAt: clock });
  assert.equal(result.section, null, 'The end announcement is still displayed');
  clock += 2_000;
  await renderHook({ updatedAt: clock });
  assert.deepEqual(cues, []);
  await act(() => setReady(true));
  assert.equal(result.section.division.division_id, 'open');
  assert.deepEqual(cues, ['celebration']);
});

test('fresh live all-public scores update in place without a null render, new cue or timer callback', async () => {
  await renderHook({ sections: [section({ strategy: 'manual_all' })] });
  clock += 100;
  const all = section({ strategy: 'manual_all', mode: 'all', scoring: 'ioi' });
  await renderHook({ sections: [all], updatedAt: clock });
  assert.ok(result.section);
  const complete = result.complete;
  const changed = structuredClone(all);
  changed.rows[0].total_score = 200;
  changed.rows[0].rank = 2;
  changed.rows[1].total_score = 300;
  changed.rows[1].rank = 1;
  const before = renderTrace.length;
  clock += 100;
  await renderHook({ sections: [changed], updatedAt: clock });
  assert.ok(renderTrace.slice(before).length > 0);
  assert.ok(renderTrace.slice(before).every((id) => id === 'open'));
  assert.equal(result.section.rows[0].total_score, 200);
  assert.equal(result.section.rows[1].rank, 1);
  assert.equal(result.complete, complete);
  assert.deepEqual(cues, ['celebration']);
});

test('the hook stops on visibility loss and never catches up after a hidden completion', async () => {
  await renderHook();
  clock += 100;
  await renderHook({ sections: [section({ mode: 'all' })], updatedAt: clock });
  assert.ok(result.section);
  await act(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  assert.equal(result.section, null);
  await act(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  assert.equal(result.section, null);
  assert.deepEqual(cues, ['celebration']);
});

test('an expiry watchdog cancels a ceremony without needing another API response', async () => {
  await renderHook();
  clock += 100;
  await renderHook({ sections: [section({ mode: 'all' })], updatedAt: clock });
  assert.ok(result.section);
  assert.equal(timers.size, 1);
  const timer = [...timers.entries()][0];
  clock += timer[1].delay;
  await act(() => {
    timers.delete(timer[0]);
    timer[1].callback();
  });
  assert.equal(result.section, null);
  clock += 100;
  await renderHook({ updatedAt: clock });
  assert.equal(result.section, null);
  assert.deepEqual(cues, ['celebration']);
});

test('a suppressed overlay, new audience or undo hides the old ceremony before the effect can retain it', async () => {
  await renderHook();
  clock += 100;
  await renderHook({ sections: [section({ mode: 'all' })], updatedAt: clock });
  assert.ok(result.section);
  await renderHook({ suppressed: true });
  assert.equal(result.section, null);
  await renderHook({ suppressed: false, scopeKey: 'new-session' });
  assert.equal(result.section, null);
  clock += 100;
  await renderHook({ sections: [section()], updatedAt: clock });
  clock += 100;
  await renderHook({ sections: [section({ mode: 'all' })], updatedAt: clock });
  assert.ok(result.section);
  assert.deepEqual(cues, ['celebration', 'celebration']);
  await renderHook({ sections: [section()], updatedAt: clock });
  assert.equal(result.section, null);
});
