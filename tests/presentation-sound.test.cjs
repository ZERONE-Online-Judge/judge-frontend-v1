const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const file = path.resolve(
  __dirname,
  '../src/domains/submissionScoreboard/presentationSound.ts',
);
const compiled = new Module(file, module);
compiled.filename = file;
compiled.paths = Module._nodeModulePaths(path.dirname(file));
compiled._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  file,
);
const { presentationSoundNotes, playPresentationSound } = compiled.exports;

function output() {
  const envelopes = [];
  const oscillators = [];
  return {
    envelopes,
    oscillators,
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator() {
      const events = [];
      oscillators.push(events);
      return {
        frequency: { setValueAtTime() {} },
        connect() {},
        disconnect() {},
        start: (at) => events.push(['start', at]),
        stop: (at) => events.push(['stop', at]),
      };
    },
    createGain() {
      const events = [];
      envelopes.push(events);
      return {
        gain: {
          setValueAtTime: (value, at) => events.push(['set', value, at]),
          linearRampToValueAtTime: (value, at) =>
            events.push(['ramp', value, at]),
          cancelScheduledValues: (at) => events.push(['cancel', at]),
        },
        connect() {},
        disconnect() {},
      };
    },
  };
}

test('milestone warning has two recognizable phrases with rests over three seconds', () => {
  const notes = presentationSoundNotes('warning');
  assert.equal(notes.length, 6);
  assert.deepEqual(
    notes.map(({ frequency }) => frequency),
    [660, 880, 1100, 660, 880, 1100],
  );
  assert.equal(notes[0].offset, 0);
  assert(notes.at(-1).offset + notes.at(-1).duration >= 2.9);
  assert(notes.at(-1).offset + notes.at(-1).duration <= 3.1);
  for (let index = 1; index < notes.length; index++) {
    const rest =
      notes[index].offset -
      (notes[index - 1].offset + notes[index - 1].duration);
    assert(rest >= 0.039, `No overlap and a clear rest before tone ${index}`);
    if (index === 3) assert(rest >= 0.5, 'Separate the two phrases');
  }
});

test('existing milestone and countdown gains and attacks remain unchanged', () => {
  for (const volume of [0.25, 0.35, 0.75, 1, 2]) {
    for (const cue of ['warning', 'tick', 'start', 'end']) {
      const context = output();
      assert.equal(playPresentationSound(context, cue, volume), true);
      const notes = presentationSoundNotes(cue);
      const expected = Math.min(1, volume) * (cue === 'warning' ? 0.82 : 0.36);
      context.envelopes.forEach((events, index) => {
        assert.deepEqual(events[0], ['set', 0, notes[index].offset]);
        assert.deepEqual(events[1], [
          'ramp',
          expected,
          notes[index].offset + (cue === 'warning' ? 0.02 : 0.012),
        ]);
        assert(expected < 1, 'Retain full-scale headroom');
        assert.equal(events.at(-1)[1], 0, 'Smooth release reaches silence');
      });
    }
  }
});

test('countdown, start and end melodies remain unchanged', () => {
  assert.deepEqual(presentationSoundNotes('tick'), [
    { frequency: 880, offset: 0, duration: 0.085 },
  ]);
  assert.deepEqual(
    presentationSoundNotes('start'),
    [523.25, 659.25, 783.99].map((frequency, index) => ({
      frequency,
      offset: index * 0.15,
      duration: 0.25,
    })),
  );
  assert.deepEqual(
    presentationSoundNotes('end'),
    [783.99, 659.25, 523.25].map((frequency, index) => ({
      frequency,
      offset: index * 0.19,
      duration: 0.32,
    })),
  );
});

const releaseCues = ['reveal', 'accepted', 'rejected', 'result', 'complete'];

test('scoreboard release cues are distinct, brief phrases with no overlapping voices', () => {
  const phrases = releaseCues.map((cue) => presentationSoundNotes(cue));
  assert.equal(new Set(phrases.map((notes) => JSON.stringify(notes))).size, 5);
  for (const [index, notes] of phrases.entries()) {
    const cue = releaseCues[index];
    assert(notes.length >= 2);
    assert.equal(notes[0].offset, 0);
    const duration = notes.at(-1).offset + notes.at(-1).duration;
    assert(duration >= 0.3 && duration <= 1.51, `${cue} duration`);
    for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
      const note = notes[noteIndex];
      assert(note.frequency >= 200 && note.frequency <= 1500);
      assert(note.duration >= 0.1);
      if (noteIndex > 0) {
        const previous = notes[noteIndex - 1];
        assert(
          previous.offset + previous.duration <= note.offset,
          `${cue} must not stack voices`,
        );
      }
    }
  }
  const reveal = phrases[0];
  assert.equal(reveal[0].frequency, reveal[1].frequency);
  for (const cue of ['accepted', 'result']) {
    const notes = presentationSoundNotes(cue);
    assert(
      notes.every(
        (note, index) => !index || note.frequency > notes[index - 1].frequency,
      ),
    );
  }
  const rejected = presentationSoundNotes('rejected');
  assert(rejected[0].frequency > rejected[1].frequency);
  assert(
    rejected[0].frequency < presentationSoundNotes('accepted')[0].frequency,
  );
  const complete = presentationSoundNotes('complete');
  assert(complete.length >= 5);
  assert(complete.at(-1).offset + complete.at(-1).duration >= 1.45);
});

test('release sound volume keeps full-scale headroom and a softer non-accepted cue', () => {
  for (const volume of [0.25, 0.75, 1, 2]) {
    for (const cue of releaseCues) {
      const context = output();
      assert.equal(playPresentationSound(context, cue, volume), true);
      const notes = presentationSoundNotes(cue);
      const expected = Math.min(1, volume) * (cue === 'rejected' ? 0.42 : 0.55);
      assert.equal(context.envelopes.length, notes.length);
      context.envelopes.forEach((events, index) => {
        assert.deepEqual(events[0], ['set', 0, notes[index].offset]);
        assert.deepEqual(events[1], [
          'ramp',
          expected,
          notes[index].offset + 0.012,
        ]);
        assert.equal(events.at(-1)[1], 0);
        assert(expected < 1);
      });
      const boundaries = notes.flatMap((note) => [
        note.offset,
        note.offset + note.duration,
      ]);
      for (const at of boundaries) {
        const active = notes.filter(
          (note) => at >= note.offset && at < note.offset + note.duration,
        );
        assert(active.length * expected < 1, `${cue} combined peak at ${at}`);
      }
    }
  }
});

test('a newer release cue cancels every scheduled celebration note, and zero or blocked audio stays silent', () => {
  const context = output();
  playPresentationSound(context, 'complete', 1);
  const celebrationVoices = context.oscillators.slice();
  const celebrationEnvelopes = context.envelopes.slice();
  context.currentTime = 0.2;
  playPresentationSound(context, 'accepted', 1);
  celebrationVoices.forEach((events) => {
    assert.deepEqual(events.at(-1), ['stop', context.currentTime]);
  });
  celebrationEnvelopes.forEach((events) => {
    assert(
      events.some(
        ([kind, at]) => kind === 'cancel' && at === context.currentTime,
      ),
    );
    assert.deepEqual(events.at(-1), ['set', 0, context.currentTime]);
  });
  const count = context.oscillators.length;
  assert.equal(playPresentationSound(context, 'result', 0), false);
  assert.equal(context.oscillators.length, count);
  for (const cue of releaseCues) {
    const muted = output();
    assert.equal(playPresentationSound(muted, cue, 0), false);
    assert.equal(muted.oscillators.length, 0);
    const suspended = output();
    suspended.state = 'suspended';
    assert.equal(playPresentationSound(suspended, cue, 1), false);
    assert.equal(suspended.oscillators.length, 0);
  }
});

test('the completion celebration is a distinct 3–4 second fanfare with single-voice headroom', () => {
  const notes = presentationSoundNotes('celebration');
  assert(notes.length >= 8);
  assert.equal(notes[0].offset, 0);
  assert(notes.at(-1).offset + notes.at(-1).duration >= 3);
  assert(notes.at(-1).offset + notes.at(-1).duration <= 4);
  assert.notDeepEqual(notes, presentationSoundNotes('complete'));
  assert(notes.at(-1).frequency > notes[0].frequency);
  assert(notes.at(-1).duration >= 0.6);
  for (let index = 1; index < notes.length; index++) {
    assert(
      notes[index].offset >=
        notes[index - 1].offset + notes[index - 1].duration,
    );
  }
  const context = output();
  assert.equal(playPresentationSound(context, 'celebration', 1), true);
  assert.equal(context.oscillators.length, notes.length);
  assert(
    context.envelopes.every(
      (events) => events[1][1] === 0.64 && events.at(-1)[1] === 0,
    ),
  );
  context.currentTime = 0.5;
  const old = context.oscillators.slice();
  assert.equal(playPresentationSound(context, 'tick', 1), true);
  assert(
    old.every(
      (events) => events.at(-1)[0] === 'stop' && events.at(-1)[1] <= 0.508,
    ),
  );
});
