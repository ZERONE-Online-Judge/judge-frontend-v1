const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const loaded = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const entry = new Module(filename, module);
  entry.filename = filename;
  entry.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.set(filename, entry);
  const native = entry.require.bind(entry);
  entry.require = (id) =>
    id.startsWith('.')
      ? source(
          path.relative(
            path.resolve(__dirname, '../src'),
            path.resolve(path.dirname(filename), `${id}.ts`),
          ),
        )
      : native(id);
  entry._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return entry.exports;
}
const {
  DEFAULT_PRESENTATION_ALERT_MINUTES,
  normalizePresentationAlertMinutes: normalize,
  parsePresentationAlertMinutes: parse,
} = source('domains/submissionScoreboard/presentationAlertMinutes.ts');
const {
  PresentationAnnouncementTracker: Tracker,
  presentationFreezeCountdown,
} = source('domains/submissionScoreboard/presentationAnnouncements.ts');
const { contestTimerState } = source(
  'domains/contestAdministration/contestTimer.ts',
);
const MINUTE = 60_000;
const start = Date.parse('2026-11-13T01:00:00Z');
const freeze = start + 180 * MINUTE;
const end = start + 240 * MINUTE;
const contest = {
  contest_id: 'custom-alert-minutes',
  status: 'running',
  start_at: new Date(start).toISOString(),
  freeze_at: new Date(freeze).toISOString(),
  end_at: new Date(end).toISOString(),
  scoreboard_freeze_mode: 'auto',
};
const visible = { visible: true };
function cross(current, at) {
  const tracker = new Tracker();
  tracker.update(current, at - 1000, visible);
  return tracker.update(current, at, visible);
}

test('legacy settings use independent defaults and only an empty array turns minute warnings off', () => {
  assert.deepEqual(DEFAULT_PRESENTATION_ALERT_MINUTES, [30, 20, 10, 5]);
  for (const value of [undefined, null, '30,20', {}, [0, NaN, '30']])
    assert.deepEqual(normalize(value), [30, 20, 10, 5]);
  assert.deepEqual(normalize([]), []);
  const first = normalize(undefined);
  first.pop();
  assert.deepEqual(normalize(null), [30, 20, 10, 5]);
  const current = { ...contest, presentation_end_alert_minutes: [7] };
  assert.equal(cross(current, freeze - 30 * MINUTE).cue, 'warning');
  assert.equal(cross(current, end - 30 * MINUTE).cue, undefined);
  assert.deepEqual(cross(current, end - 7 * MINUTE).announcement.milestones, [
    { kind: 'end', minutes: 7 },
  ]);
});

test('normalization canonicalizes duplicate and unsorted server values without mutating them', () => {
  const values = [5, 30, 5, 20, 0, 1.5, '10', 10081, -3, 10080];
  const original = [...values];
  assert.deepEqual(normalize(values), [10080, 30, 20, 5]);
  assert.deepEqual(values, original);
  assert.deepEqual(
    normalize(Array.from({ length: 40 }, (_, index) => index + 1)),
    Array.from({ length: 32 }, (_, index) => 40 - index),
  );
});

test('form parsing accepts common separators, canonical order and empty input without allowing numeric coercion', () => {
  assert.deepEqual(parse('5, 30 20\n10，20、5·30ㆍ10'), {
    minutes: [30, 20, 10, 5],
    error: null,
  });
  assert.deepEqual(parse('10080,1, 00005,'), {
    minutes: [10080, 5, 1],
    error: null,
  });
  for (const raw of ['', ' \n\t '])
    assert.deepEqual(parse(raw), { minutes: [], error: null });
  for (const raw of [
    '0',
    '-1',
    '+30',
    '1.5',
    '30.0',
    '1e2',
    '0x10',
    'Infinity',
    'NaN',
    '10081',
    '30분',
    '30,invalid,5',
    ',，·',
  ]) {
    const result = parse(raw);
    assert(result.error, `Reject ${JSON.stringify(raw)}`);
    assert.deepEqual(result.minutes, []);
  }
});

test('the 32-point form limit applies after deduplication', () => {
  const values = Array.from({ length: 33 }, (_, index) => index + 1);
  assert.equal(parse(values.slice(0, 32).join(',')).error, null);
  assert.match(parse(values.join(',')).error, /32/);
  assert.deepEqual(parse(Array(100).fill('7').join(',')), {
    minutes: [7],
    error: null,
  });
});

test('each configured minute fires once with its own event kind and no implicit default warnings', () => {
  const current = {
    ...contest,
    presentation_freeze_alert_minutes: [45, 15, 2],
    presentation_end_alert_minutes: [40, 7, 1],
  };
  const tracker = new Tracker();
  const events = [
    ...[45, 15, 2].map((minutes) => ({ kind: 'freeze', minutes, at: freeze })),
    ...[40, 7, 1].map((minutes) => ({ kind: 'end', minutes, at: end })),
  ].sort((a, b) => a.at - a.minutes * MINUTE - (b.at - b.minutes * MINUTE));
  for (const { kind, minutes, at: target } of events) {
    const at = target - minutes * MINUTE;
    tracker.update(current, at - 1000, visible);
    const result = tracker.update(current, at, visible);
    assert.equal(result.cue, 'warning');
    assert.deepEqual(result.announcement.milestones, [{ kind, minutes }]);
    assert.equal(
      tracker.update({ ...current }, at + 1, visible).cue,
      undefined,
    );
  }
  for (const minutes of [30, 20, 10, 5]) {
    assert.equal(cross(current, freeze - minutes * MINUTE).cue, undefined);
    assert.equal(cross(current, end - minutes * MINUTE).cue, undefined);
  }
  const duplicate = {
    ...contest,
    presentation_freeze_alert_minutes: [7, 15, 7, 15],
    presentation_end_alert_minutes: [],
  };
  assert.deepEqual(
    cross(duplicate, freeze - 7 * MINUTE).announcement.milestones,
    [{ kind: 'freeze', minutes: 7 }],
  );
});

test('empty configuration disables only its selected kind of minute warnings', () => {
  for (const disabled of ['freeze', 'end']) {
    const current = {
      ...contest,
      [`presentation_${disabled}_alert_minutes`]: [],
    };
    const other = disabled === 'freeze' ? 'end' : 'freeze';
    const targets = { freeze, end };
    assert.equal(
      cross(current, targets[disabled] - 20 * MINUTE).cue,
      undefined,
    );
    assert.equal(cross(current, targets[other] - 20 * MINUTE).cue, 'warning');
  }
});

test('disabling both warning lists leaves freeze3/2/1 and start/end10/zero timing unchanged', () => {
  const current = {
    ...contest,
    presentation_freeze_alert_minutes: [],
    presentation_end_alert_minutes: [],
  };
  for (const target of [freeze, end])
    for (const minutes of [30, 20, 10, 5])
      assert.equal(cross(current, target - minutes * MINUTE).cue, undefined);
  const freezeTracker = new Tracker();
  freezeTracker.update(current, freeze - 4000, visible);
  for (const seconds of [3, 2, 1]) {
    const now = freeze - seconds * 1000;
    assert.equal(presentationFreezeCountdown(current, now), seconds);
    assert.equal(freezeTracker.update(current, now, visible).cue, 'tick');
  }
  assert.equal(presentationFreezeCountdown(current, freeze), null);
  assert.equal(freezeTracker.update(current, freeze, visible).cue, undefined);
  for (const [kind, at] of [
    ['start', start],
    ['end', end],
  ]) {
    const tracker = new Tracker();
    tracker.update(current, at - 11000, visible);
    for (let seconds = 10; seconds >= 0; seconds--)
      assert.equal(
        tracker.update(current, at - seconds * 1000, visible).cue,
        seconds ? 'tick' : kind,
      );
  }
  assert.equal(
    contestTimerState(current, end - 60000, true).view,
    'endCountdown',
  );
  const ended = new Tracker();
  ended.update(current, end - 1000, visible);
  assert.equal(
    ended.update({ ...current, status: 'ended' }, end, visible).cue,
    'end',
  );
});

test('config edits retain stable event keys, never replay seen or newly added past warnings', () => {
  const at = freeze - 20 * MINUTE;
  const current = { ...contest, presentation_freeze_alert_minutes: [20] };
  const tracker = new Tracker();
  tracker.advance(current, at - 1000, visible);
  const first = tracker.advance(current, at, visible).announcement;
  const reordered = { ...current, presentation_freeze_alert_minutes: [20, 20] };
  assert.equal(tracker.advance(reordered, at + 1000, visible).cue, undefined);
  assert.equal(tracker.getSnapshot(), first);
  const disabled = { ...current, presentation_freeze_alert_minutes: [] };
  tracker.advance(disabled, at + 2000, visible);
  assert.equal(tracker.getSnapshot(), null);
  assert.equal(tracker.advance(current, at + 3000, visible).cue, undefined);
  assert.equal(tracker.getSnapshot(), null);
  const reloaded = new Tracker(tracker.memory(at + 3000));
  assert.equal(reloaded.update(current, at + 3100, visible).cue, undefined);
  const addedPast = new Tracker();
  addedPast.update(disabled, at + 1000, visible);
  assert.equal(addedPast.update(current, at + 2000, visible).cue, undefined);
  const future = { ...current, presentation_freeze_alert_minutes: [15] };
  addedPast.update(future, freeze - 15 * MINUTE - 1000, visible);
  assert.equal(
    addedPast.update(future, freeze - 15 * MINUTE, visible).cue,
    'warning',
  );
});

test('removing one simultaneous warning prunes its block without replaying or extending the other', () => {
  const current = {
    ...contest,
    end_at: new Date(freeze + 10 * MINUTE).toISOString(),
    presentation_freeze_alert_minutes: [20],
    presentation_end_alert_minutes: [30],
  };
  const at = freeze - 20 * MINUTE;
  const tracker = new Tracker();
  const first = tracker.advance(current, at, visible).announcement;
  assert.equal(first.milestones.length, 2);
  const changed = { ...current, presentation_freeze_alert_minutes: [] };
  const update = tracker.advance(changed, at + 1000, visible);
  assert.equal(update.cue, undefined);
  const remaining = tracker.getSnapshot();
  assert.deepEqual(remaining.milestones, [{ kind: 'end', minutes: 30 }]);
  assert.equal(remaining.expiresAt, first.expiresAt);
  assert.equal(remaining.key, first.key.split('|')[1]);
  assert.equal(remaining.minutes, 30);
  assert.doesNotMatch(remaining.title, /프리즈/);
  tracker.advance(changed, first.expiresAt, visible);
  assert.equal(tracker.getSnapshot(), null);
});

test('custom warnings retain countdown priority, visibility and manual-freeze exclusions', () => {
  const current = {
    ...contest,
    presentation_freeze_alert_minutes: [7],
    presentation_end_alert_minutes: [1],
  };
  const endTracker = new Tracker();
  endTracker.update(current, end - MINUTE - 1000, visible);
  assert.equal(
    endTracker.update(current, end - MINUTE, { ...visible, suppressed: true })
      .cue,
    undefined,
  );
  const at = freeze - 7 * MINUTE;
  for (const mode of ['live', 'frozen'])
    assert.equal(
      cross({ ...current, scoreboard_freeze_mode: mode }, at).cue,
      undefined,
    );
  const hidden = new Tracker();
  hidden.update(current, at - 1000, visible);
  assert.equal(hidden.update(current, at, { visible: false }).cue, undefined);
  assert.equal(hidden.update(current, at + 1000, visible).cue, undefined);
});
