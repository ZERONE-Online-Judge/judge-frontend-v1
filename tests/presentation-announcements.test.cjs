const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://judge.test/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;
const modules = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (modules.has(file)) return modules.get(file).exports;
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  modules.set(file, compiled);
  const native = compiled.require.bind(compiled);
  compiled.require = (id) =>
    id.startsWith('.')
      ? source(
          path.relative(
            path.resolve(__dirname, '../src'),
            path.resolve(path.dirname(file), `${id}.ts`),
          ),
        )
      : native(id);
  compiled._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return compiled.exports;
}
const {
  PresentationAnnouncementTracker,
  readPresentationAnnouncementMemory,
  PRESENTATION_ANNOUNCEMENT_STORAGE_KEY,
  presentationFreezeCountdown,
} = source('domains/submissionScoreboard/presentationAnnouncements.ts');
const { usePresentationAnnouncements } = source(
  'domains/submissionScoreboard/usePresentationAnnouncements.ts',
);
const { usePresentationSound, playPresentationSound, presentationSoundNotes } =
  source('domains/submissionScoreboard/presentationSound.ts');
const MINUTE = 60_000;
const start = Date.parse('2026-11-12T06:00:00Z');
const contest = {
  contest_id: 'presentation-test',
  status: 'running',
  start_at: new Date(start).toISOString(),
  freeze_at: new Date(start + 180 * MINUTE).toISOString(),
  end_at: new Date(start + 240 * MINUTE).toISOString(),
  scoreboard_freeze_mode: 'auto',
};
const visible = { visible: true };
let root, host;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete window.AudioContext;
  delete window.webkitAudioContext;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});
after(() => dom.window.close());

test('all eight scheduled freeze and submission warnings cross once, despite polling or clock rollback', () => {
  const tracker = new PresentationAnnouncementTracker();
  const events = ['freeze', 'end'].flatMap((kind) =>
    [30, 20, 10, 5].map((minutes) => ({
      kind,
      minutes,
      at: Date.parse(contest[`${kind}_at`]) - minutes * MINUTE,
    })),
  );
  for (const { kind, minutes, at } of events) {
    tracker.update({ ...contest }, at - 1000, visible);
    const result = tracker.update({ ...contest }, at, visible);
    assert.equal(result.cue, 'warning');
    assert.equal(result.announcement.minutes, minutes);
    assert.deepEqual(result.announcement.kinds, [kind]);
    assert.match(
      result.announcement.title,
      new RegExp(`${minutes}분 전입니다`),
    );
    assert.equal(
      tracker.update({ ...contest }, at, visible).announcement,
      undefined,
    );
    tracker.update(contest, at - 1000, visible);
    assert.equal(tracker.update(contest, at, visible).cue, undefined);
  }
});

test('automatic freeze countdown enters at exactly three seconds and leaves at the freeze boundary', () => {
  const freeze = Date.parse(contest.freeze_at);
  for (const [remaining, expected] of [
    [3001, null],
    [3000, 3],
    [2001, 3],
    [2000, 2],
    [1001, 2],
    [1000, 1],
    [1, 1],
    [0, null],
    [-1, null],
  ])
    assert.equal(
      presentationFreezeCountdown(contest, freeze - remaining),
      expected,
      `remaining ${remaining}ms`,
    );
});

test('freeze countdown excludes manual/live/invalid/ended schedules and defers to start and end screens', () => {
  const freeze = Date.parse(contest.freeze_at);
  for (const overrides of [
    { scoreboard_freeze_mode: 'live' },
    { scoreboard_freeze_mode: 'frozen' },
    { status: 'ended' },
    { status: 'finalized' },
    { status: 'archived' },
    { status: 'draft' },
    { status: 'schedule_tbd' },
    { freeze_at: undefined },
    { freeze_at: 'invalid' },
    { freeze_at: contest.end_at },
    { freeze_at: contest.start_at },
    { start_at: 'invalid' },
    { end_at: contest.start_at },
    { end_at: new Date(freeze + 30_000).toISOString() },
    { start_at: new Date(freeze - 1000).toISOString() },
    { start_at: new Date(freeze - 2000).toISOString() },
  ]) {
    const current = { ...contest, ...overrides };
    assert.equal(presentationFreezeCountdown(current, freeze - 1000), null);
    const tracker = new PresentationAnnouncementTracker();
    tracker.update(current, freeze - 4000, visible);
    const withoutFreeze = new PresentationAnnouncementTracker();
    const live = { ...current, scoreboard_freeze_mode: 'live' };
    withoutFreeze.update(live, freeze - 4000, visible);
    assert.equal(
      tracker.update(current, freeze - 3000, visible).cue,
      withoutFreeze.update(live, freeze - 3000, visible).cue,
      'Keep existing start/end audio without adding a freeze tick',
    );
  }
  assert.equal(presentationFreezeCountdown(undefined, freeze - 1000), null);
  assert.equal(presentationFreezeCountdown(contest, NaN), null);
});

test('freeze ticks sound once for each current second without a zero cue, reload replay or background burst', () => {
  const freeze = Date.parse(contest.freeze_at);
  const tracker = new PresentationAnnouncementTracker();
  tracker.update(contest, freeze - 4000, visible);
  for (const seconds of [3, 2, 1]) {
    const now = freeze - seconds * 1000;
    assert.equal(tracker.update(contest, now, visible).cue, 'tick');
    assert.equal(tracker.update(contest, now + 100, visible).cue, undefined);
    const reloaded = new PresentationAnnouncementTracker(tracker.memory(now));
    assert.equal(reloaded.update(contest, now + 200, visible).cue, undefined);
  }
  assert.equal(tracker.update(contest, freeze, visible).cue, undefined);
  tracker.update(contest, freeze - 4000, visible);
  assert.equal(tracker.update(contest, freeze - 3000, visible).cue, undefined);
  const hidden = new PresentationAnnouncementTracker();
  hidden.update(contest, freeze - 4000, visible);
  hidden.update(contest, freeze - 3000, { visible: false });
  hidden.update(contest, freeze - 2000, { visible: false });
  assert.equal(hidden.update(contest, freeze - 1000, visible).cue, undefined);
  assert.equal(hidden.update(contest, freeze, visible).cue, undefined);
  const late = new PresentationAnnouncementTracker();
  assert.equal(late.update(contest, freeze - 400, visible).cue, 'tick');
  assert.equal(late.update(contest, freeze + 1, visible).cue, undefined);
});

test('freeze countdown consumes a simultaneous end warning and cancels a previous announcement', () => {
  const freeze = Date.parse(contest.freeze_at);
  const current = {
    ...contest,
    end_at: new Date(freeze - 3000 + 20 * MINUTE).toISOString(),
  };
  const tracker = new PresentationAnnouncementTracker();
  tracker.advance(current, freeze - 4000, visible);
  const result = tracker.advance(current, freeze - 3000, {
    ...visible,
    suppressed: true,
  });
  assert.equal(result.cue, 'tick');
  assert.equal(result.announcement, undefined);
  assert.equal(tracker.getSnapshot(), null);
  assert.equal(
    tracker.update(current, freeze + 1, visible).announcement,
    undefined,
  );
  const warningAt = freeze - 20 * MINUTE;
  const active = new PresentationAnnouncementTracker();
  active.advance(contest, warningAt, visible);
  assert.ok(active.getSnapshot());
  active.advance(contest, warningAt + 1, { ...visible, suppressed: true });
  assert.equal(active.getSnapshot(), null);
});

test('first load allows only a fresh warning and reload never repeats it', () => {
  const at = Date.parse(contest.freeze_at) - 30 * MINUTE;
  const tracker = new PresentationAnnouncementTracker();
  const first = tracker.update(contest, at + 4900, visible);
  assert.equal(first.announcement.minutes, 30);
  const reloaded = new PresentationAnnouncementTracker(
    tracker.memory(at + 4900),
  );
  assert.equal(reloaded.update(contest, at + 4950, visible).cue, undefined);
  const late = new PresentationAnnouncementTracker();
  assert.equal(
    late.update(contest, at + 5000, visible).announcement,
    undefined,
  );
  const muchLater = new PresentationAnnouncementTracker();
  assert.equal(
    muchLater.update(contest, at + 20 * MINUTE + 10_000, visible).cue,
    undefined,
  );
});

test('hidden tabs and suspended devices consume milestones without late audio bursts', () => {
  const at = Date.parse(contest.freeze_at) - 10 * MINUTE;
  const tracker = new PresentationAnnouncementTracker();
  tracker.update(contest, at - 1000, visible);
  assert.equal(tracker.update(contest, at, { visible: false }).cue, undefined);
  assert.equal(
    tracker.update(contest, at + 1000, visible).announcement,
    undefined,
  );
  const paused = new PresentationAnnouncementTracker();
  paused.update(contest, at - 1000, visible);
  paused.pause();
  assert.equal(paused.update(contest, at, visible).cue, undefined);
  const sleeping = new PresentationAnnouncementTracker();
  sleeping.update(contest, at - 6000, visible);
  assert.equal(sleeping.update(contest, at, visible).cue, undefined);
});

test('countdown priority consumes a warning without hiding countdown sound', () => {
  const freeze = start + 31 * MINUTE;
  const closeFreeze = { ...contest, freeze_at: new Date(freeze).toISOString() };
  const at = freeze - 30 * MINUTE;
  const tracker = new PresentationAnnouncementTracker();
  tracker.update(closeFreeze, at - 1000, visible);
  const suppressed = tracker.update(closeFreeze, at, {
    ...visible,
    suppressed: true,
  });
  assert.equal(suppressed.announcement, undefined);
  assert.equal(suppressed.cue, undefined);
  assert.equal(
    tracker.update(closeFreeze, at + 1000, visible).announcement,
    undefined,
  );
  const countdown = new PresentationAnnouncementTracker();
  countdown.update(contest, start - 11_000, visible);
  assert.equal(
    countdown.update(contest, start - 10_000, { ...visible, suppressed: true })
      .cue,
    'tick',
  );
});

test('start and end beep only in their final ten seconds with distinct zero cues', () => {
  for (const kind of ['start', 'end']) {
    const target = Date.parse(contest[`${kind}_at`]);
    const tracker = new PresentationAnnouncementTracker();
    tracker.update(contest, target - 61_000, visible);
    assert.equal(
      tracker.update(contest, target - 60_000, visible).cue,
      undefined,
    );
    tracker.update(contest, target - 11_000, visible);
    for (let seconds = 10; seconds >= 0; seconds--) {
      const result = tracker.update(contest, target - seconds * 1000, visible);
      assert.equal(result.cue, seconds ? 'tick' : kind);
      assert.equal(
        tracker.update(contest, target - seconds * 1000 + 100, visible).cue,
        undefined,
      );
    }
  }
  const initial = new PresentationAnnouncementTracker();
  assert.equal(initial.update(contest, start - 5500, visible).cue, 'tick');
  const end = Date.parse(contest.end_at);
  const statusChanged = new PresentationAnnouncementTracker();
  statusChanged.update(contest, end - 1000, visible);
  assert.equal(
    statusChanged.update({ ...contest, status: 'ended' }, end, visible).cue,
    'end',
  );
});

test('live/manual freeze, unknown schedules and already ended contests never forecast a freeze', () => {
  const at = Date.parse(contest.freeze_at) - 30 * MINUTE;
  for (const overrides of [
    { scoreboard_freeze_mode: 'live' },
    { scoreboard_freeze_mode: 'frozen' },
    { freeze_at: contest.end_at },
    { freeze_at: contest.start_at },
    { start_at: 'invalid' },
    { end_at: contest.start_at },
    { status: 'draft' },
    { status: 'schedule_tbd' },
    { status: 'ended' },
    { status: 'archived' },
  ]) {
    const tracker = new PresentationAnnouncementTracker();
    assert.equal(
      tracker.update({ ...contest, ...overrides }, at, visible).cue,
      undefined,
    );
  }
  const stopped = new PresentationAnnouncementTracker();
  const end = Date.parse(contest.end_at);
  stopped.update(contest, end - 2000, visible);
  stopped.update({ ...contest, status: 'ended' }, end - 1000, visible);
  assert.equal(
    stopped.update({ ...contest, status: 'ended' }, end, visible).cue,
    undefined,
  );
});

test('coincident freeze and end milestones retain their own durations in one announcement', () => {
  const revised = {
    ...contest,
    freeze_at: new Date(Date.parse(contest.end_at) - 20 * MINUTE).toISOString(),
  };
  const at = Date.parse(contest.end_at) - 30 * MINUTE;
  const tracker = new PresentationAnnouncementTracker();
  tracker.update(revised, at - 1000, visible);
  const result = tracker.update(revised, at, visible);
  assert.deepEqual(result.announcement.milestones, [
    { kind: 'freeze', minutes: 10 },
    { kind: 'end', minutes: 30 },
  ]);
  assert.match(result.announcement.title, /프리즈 10분 전입니다/);
  assert.match(result.announcement.title, /제출 마감 30분 전입니다/);
  assert.equal(result.cue, 'warning');
});

test('rescheduling and contest changes invalidate visible announcements without replaying old targets', () => {
  const at = Date.parse(contest.freeze_at) - 30 * MINUTE;
  const tracker = new PresentationAnnouncementTracker();
  const announcement = tracker.update(contest, at, visible).announcement;
  assert.equal(tracker.isCurrent(announcement, contest), true);
  const changed = {
    ...contest,
    freeze_at: new Date(Date.parse(contest.freeze_at) + MINUTE).toISOString(),
  };
  assert.equal(tracker.isCurrent(announcement, changed), false);
  assert.equal(
    tracker.isCurrent(announcement, { ...contest, contest_id: 'different' }),
    false,
  );
  tracker.update(changed, at + 59_000, visible);
  assert.equal(tracker.update(changed, at + MINUTE, visible).cue, 'warning');
});

test('bounded persisted memory validates untrusted storage and rejects malformed values', () => {
  assert.deepEqual(readPresentationAnnouncementMemory('not-json'), []);
  assert.deepEqual(readPresentationAnnouncementMemory('{"seen":[]}'), []);
  assert.deepEqual(
    readPresentationAnnouncementMemory('[["okay",5],[{},4],["bad","5"]]'),
    [['okay', 5]],
  );
  const values = Array.from({ length: 400 }, (_, i) => [`event:${i}`, start]);
  const tracker = new PresentationAnnouncementTracker(values);
  assert.equal(tracker.memory(start).length, 256);
  assert.equal(tracker.memory(start + 8 * 24 * 60 * MINUTE).length, 0);
});

test('React StrictMode, storage reload, dismiss and expiration preserve once-only cues', async () => {
  const at = Date.parse(contest.freeze_at) - 5 * MINUTE;
  const cues = [];
  let state;
  function Harness({ now, current = contest }) {
    state = usePresentationAnnouncements({
      contest: current,
      now,
      onCue: (cue) => cues.push(cue),
    });
    return h('p', null, state.activeAnnouncement?.title ?? 'scoreboard');
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (now, current) =>
    act(() =>
      root.render(h(React.StrictMode, null, h(Harness, { now, current }))),
    );
  await render(at);
  assert.equal(cues.length, 1);
  assert.match(host.textContent, /5분 전입니다/);
  assert.ok(
    window.sessionStorage.getItem(PRESENTATION_ANNOUNCEMENT_STORAGE_KEY),
  );
  await act(() => state.dismiss());
  await render(at + 1000);
  assert.equal(host.textContent, 'scoreboard');
  await act(() => root.unmount());
  root = createRoot(host);
  await render(at + 2000);
  assert.equal(cues.length, 1);
  assert.equal(host.textContent, 'scoreboard');
  const next = { ...contest, contest_id: 'second' };
  await render(at + 2000, next);
  assert.match(host.textContent, /5분 전입니다/);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  await act(() => document.dispatchEvent(new window.Event('visibilitychange')));
  assert.equal(host.textContent, 'scoreboard');
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  await render(at + 3000, next);
  assert.equal(host.textContent, 'scoreboard');
  const third = { ...contest, contest_id: 'third' };
  await render(at + 3000, third);
  assert.match(host.textContent, /5분 전입니다/);
  await render(at + 12_000, third);
  assert.equal(host.textContent, 'scoreboard');
});

function fakeAudioContext() {
  const trace = [];
  const context = {
    trace,
    oscillators: [],
    state: 'running',
    currentTime: 100,
    destination: {},
    createOscillator() {
      const oscillator = {
        type: '',
        frequency: {
          setValueAtTime: (value, time) =>
            trace.push(['frequency', value, time]),
        },
        connect: () => {},
        disconnect: () => trace.push(['disconnect']),
        start: (at) => trace.push(['start', at]),
        stop: (at) => trace.push(['stop', at]),
      };
      context.oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: (value, at) => trace.push(['set-gain', value, at]),
          linearRampToValueAtTime: (value, at) =>
            trace.push(['gain', value, at]),
          exponentialRampToValueAtTime: () => {},
          cancelScheduledValues: (at) => trace.push(['cancel', at]),
          cancelAndHoldAtTime: (at) => trace.push(['hold', at]),
        },
        connect: () => {},
        disconnect: () => {},
      };
    },
    async resume() {
      this.state = 'running';
      trace.push(['resume']);
      this.onstatechange?.();
    },
    async suspend() {
      this.state = 'suspended';
      trace.push(['suspend']);
      this.onstatechange?.();
    },
    async close() {
      this.state = 'closed';
      trace.push(['close']);
    },
  };
  return context;
}

test('generated cues hold an audible tone with headroom, distinct melodies and no suspended playback', () => {
  for (const cue of ['warning', 'tick', 'start', 'end']) {
    const context = fakeAudioContext();
    const noteCount = presentationSoundNotes(cue).length;
    const amplitude = 0.75 * (cue === 'warning' ? 0.82 : 0.36);
    assert.equal(playPresentationSound(context, cue), true);
    assert.equal(
      context.trace.filter(([type]) => type === 'start').length,
      noteCount,
    );
    assert.ok(
      context.trace
        .filter(([type]) => type === 'gain')
        .every(([, gain]) => gain <= amplitude),
    );
    assert(
      context.trace.some(
        ([type, gain]) => type === 'gain' && gain === amplitude,
      ),
    );
    const holds = context.trace.filter(
      ([type, gain]) => type === 'set-gain' && gain === amplitude,
    );
    assert.equal(holds.length, noteCount);
    const notes = presentationSoundNotes(cue);
    holds.forEach(([, , at], index) =>
      assert(
        at >=
          context.currentTime +
            notes[index].offset +
            notes[index].duration * 0.5,
      ),
    );
  }
  assert.notDeepEqual(
    presentationSoundNotes('start'),
    presentationSoundNotes('end'),
  );
  const context = fakeAudioContext();
  assert.equal(playPresentationSound(context, 'tick', 0), false);
  context.state = 'suspended';
  assert.equal(playPresentationSound(context, 'warning', 1), false);
  assert.equal(context.trace.length, 0);
});

test('new cues replace old active and future notes instead of stacking or playing a backlog', () => {
  const context = fakeAudioContext();
  assert.equal(playPresentationSound(context, 'warning', 1), true);
  const oldVoices = [...context.oscillators];
  context.currentTime += 0.05;
  const before = context.trace.length;
  assert.equal(playPresentationSound(context, 'tick', 1), true);
  const replacement = context.trace.slice(before);
  const stops = replacement.filter(([type]) => type === 'stop');
  assert.equal(stops.length, 7); // Six warning voices stop, plus the tick's end.
  assert(
    stops.slice(0, 6).every(([, at]) => at <= context.currentTime + 0.008),
  );
  assert.equal(replacement.filter(([type]) => type === 'cancel').length, 5);
  assert.equal(replacement.filter(([type]) => type === 'hold').length, 1);
  oldVoices.forEach((voice) => voice.onended());
  const tick = context.oscillators.at(-1);
  tick.onended();
  const ended = context.trace.length;
  assert.equal(playPresentationSound(context, 'end', 0), false);
  assert.equal(context.trace.length, ended);
});

test('cue replacement stays isolated to its own audio output and invalid volumes schedule nothing', () => {
  const first = fakeAudioContext(),
    second = fakeAudioContext();
  playPresentationSound(first, 'warning', 1);
  const before = first.trace.length;
  playPresentationSound(second, 'start', 1);
  playPresentationSound(second, 'tick', 1);
  assert.equal(first.trace.length, before);
  for (const value of [NaN, Infinity, -Infinity]) {
    const player = fakeAudioContext();
    assert.equal(playPresentationSound(player, 'warning', value), false);
    assert.deepEqual(player.trace, []);
  }
});

test('sound requires a gesture even with a saved preference, and mute/test/volume stay controlled', async () => {
  const contexts = [];
  window.AudioContext = class {
    constructor() {
      const instance = fakeAudioContext();
      instance.state = 'suspended';
      contexts.push(instance);
      return instance;
    }
  };
  window.localStorage.setItem('zoj.presentation.sound.v1', 'true');
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(h(React.StrictMode, null, h(Harness))));
  assert.equal(state.enabled, true);
  assert.equal(state.unlocked, false);
  state.play('tick');
  assert.equal(contexts.length, 0);
  await act(async () => assert.equal(await state.test(), true));
  assert.equal(state.unlocked, true);
  assert.equal(contexts.length, 1);
  assert.equal(
    contexts[0].trace.filter(([type]) => type === 'start').length,
    6,
  );
  await act(() => state.setVolume(0));
  state.play('tick');
  assert.equal(
    contexts[0].trace.filter(([type]) => type === 'start').length,
    6,
  );
  await act(() => state.setVolume(2));
  assert.equal(state.volume, 1);
  await act(() => state.disable());
  assert.equal(state.enabled, false);
  assert.equal(state.unlocked, false);
  state.play('tick');
  assert.equal(
    contexts[0].trace.filter(([type]) => type === 'start').length,
    6,
  );
  assert.equal(contexts[0].state, 'closed');
  await act(async () => assert.equal(await state.test(), true));
  assert.equal(contexts.length, 2);
  assert.equal(
    contexts[1].trace.filter(([type]) => type === 'start').length,
    6,
  );
  await act(() => root.unmount());
  root = undefined;
  assert.equal(contexts[0].state, 'closed');
  assert.equal(contexts[1].state, 'closed');
});

test('unsupported or blocked audio never prevents announcements or marks output ready', async () => {
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(h(Harness)));
  assert.equal(state.supported, false);
  await act(async () => assert.equal(await state.test(), false));
  assert.equal(state.enabled, true);
  assert.equal(state.unlocked, false);
  await act(() => root.unmount());
  root = createRoot(host);
  window.AudioContext = class {
    constructor() {
      const player = fakeAudioContext();
      player.resume = async () => {
        throw new Error('gesture blocked');
      };
      return player;
    }
  };
  await act(() => root.render(h(Harness)));
  await act(async () => assert.equal(await state.enable(), false));
  assert.equal(state.unlocked, false);
  assert.equal(state.enabled, true);
});

test('sound defaults on but stays silent until the first pointer or keyboard gesture', async () => {
  const contexts = [];
  window.AudioContext = class {
    constructor() {
      const instance = fakeAudioContext();
      instance.state = 'suspended';
      contexts.push(instance);
      return instance;
    }
  };
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  for (const [stored, gesture] of [
    [null, 'pointerdown'],
    ['invalid-preference', 'keydown'],
  ]) {
    if (stored === null)
      window.localStorage.removeItem('zoj.presentation.sound.v1');
    else window.localStorage.setItem('zoj.presentation.sound.v1', stored);
    root = createRoot(host);
    await act(() => root.render(h(React.StrictMode, null, h(Harness))));
    assert.equal(state.enabled, true);
    assert.equal(state.unlocked, false);
    const before = contexts.length;
    state.play('warning');
    assert.equal(contexts.length, before);
    await act(async () => {
      document.dispatchEvent(new window.Event(gesture));
    });
    assert.equal(state.unlocked, true);
    assert.equal(contexts.length, before + 1);
    const player = contexts.at(-1);
    assert.deepEqual(player.trace, [['resume']]);
    await act(async () => {
      document.dispatchEvent(new window.Event(gesture));
    });
    assert.deepEqual(player.trace, [['resume']]);
    state.play('tick');
    assert.equal(player.trace.filter(([type]) => type === 'start').length, 1);
    await act(() => root.unmount());
    root = undefined;
    assert.equal(player.state, 'closed');
    await act(async () => {
      document.dispatchEvent(new window.Event('pointerdown'));
      document.dispatchEvent(new window.Event('keydown'));
    });
    assert.equal(contexts.length, before + 1);
  }
});

test('an explicit saved mute prevents all automatic gesture resumes after reload', async () => {
  const contexts = [];
  window.AudioContext = class {
    constructor() {
      const instance = fakeAudioContext();
      instance.state = 'suspended';
      contexts.push(instance);
      return instance;
    }
  };
  window.localStorage.setItem('zoj.presentation.sound.v1', 'false');
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  for (let reload = 0; reload < 2; reload++) {
    root = createRoot(host);
    await act(() => root.render(h(React.StrictMode, null, h(Harness))));
    assert.equal(state.enabled, false);
    await act(async () => {
      document.dispatchEvent(new window.Event('pointerdown'));
      document.dispatchEvent(new window.Event('keydown'));
    });
    state.play('warning');
    assert.equal(contexts.length, 0);
    await act(() => root.unmount());
    root = undefined;
  }
});

test('blocked storage still defaults sound on without attempting autoplay', async () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('storage unavailable');
    },
  });
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  try {
    await act(() => root.render(h(Harness)));
    assert.equal(state.enabled, true);
    assert.equal(state.unlocked, false);
    assert.equal(state.volume, 0.75);
  } finally {
    Object.defineProperty(window, 'localStorage', original);
  }
});

test('volume defaults are audible for missing or corrupt values without replacing saved choices', async () => {
  const contexts = [];
  window.AudioContext = class {
    constructor() {
      contexts.push(fakeAudioContext());
      return contexts.at(-1);
    }
  };
  let state;
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  const key = 'zoj.presentation.volume.v1';
  for (const [stored, expected] of [
    [null, 0.75],
    ['', 0.75],
    [' \n ', 0.75],
    ['broken', 0.75],
    ['NaN', 0.75],
    ['Infinity', 0.75],
    ['0.35', 0.35],
    ['0', 0],
    ['1', 1],
    ['2', 1],
    ['-1', 0],
  ]) {
    if (stored === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, stored);
    root = createRoot(host);
    await act(() => root.render(h(Harness)));
    assert.equal(
      state.volume,
      expected,
      `stored volume ${JSON.stringify(stored)}`,
    );
    assert.equal(window.localStorage.getItem(key), stored);
    state.play('warning');
    assert.equal(contexts.length, 0, 'Reading volume must not enable autoplay');
    await act(() => root.unmount());
    root = undefined;
  }
});

test('zero volume immediately cancels the current cue and persists separately from mute', async () => {
  let player, state;
  window.AudioContext = class {
    constructor() {
      player = fakeAudioContext();
      player.state = 'suspended';
      return player;
    }
  };
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(h(Harness)));
  await act(async () => state.test());
  player.currentTime += 0.05;
  const before = player.trace.length;
  await act(() => state.setVolume(0));
  const stops = player.trace.slice(before).filter(([type]) => type === 'stop');
  assert.equal(stops.length, 6);
  assert(stops.every(([, at]) => at <= player.currentTime + 0.008));
  assert.equal(state.volume, 0);
  assert.equal(state.enabled, true);
  assert.equal(player.state, 'running');
  assert.equal(window.localStorage.getItem('zoj.presentation.volume.v1'), '0');
  const starts = player.trace.filter(([type]) => type === 'start').length;
  state.play('tick');
  assert.equal(
    player.trace.filter(([type]) => type === 'start').length,
    starts,
  );
  await act(() => state.setVolume(0.35));
  state.play('tick');
  assert.equal(
    window.localStorage.getItem('zoj.presentation.volume.v1'),
    '0.35',
  );
  assert(
    player.trace.some(([type, gain]) => type === 'gain' && gain === 0.126),
  );
  for (const value of [NaN, Infinity, -Infinity])
    await act(() => state.setVolume(value));
  assert.equal(state.volume, 0.35);
});

test('suspending output drops scheduled notes so a later gesture cannot replay an old cue', async () => {
  let player, state;
  window.AudioContext = class {
    constructor() {
      player = fakeAudioContext();
      player.state = 'suspended';
      return player;
    }
  };
  function Harness() {
    state = usePresentationSound();
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(h(Harness)));
  await act(async () => state.test());
  player.currentTime += 0.1;
  const before = player.trace.length;
  await act(async () => player.suspend());
  assert.equal(state.unlocked, false);
  assert.equal(state.enabled, true);
  assert.equal(
    player.trace.slice(before).filter(([type]) => type === 'cancel').length,
    6,
  );
  const starts = player.trace.filter(([type]) => type === 'start').length;
  state.play('end');
  await act(async () => state.enable());
  assert.equal(
    player.trace.filter(([type]) => type === 'start').length,
    starts,
  );
  state.play('tick');
  assert.equal(
    player.trace.filter(([type]) => type === 'start').length,
    starts + 1,
  );
});
