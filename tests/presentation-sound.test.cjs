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
  return {
    envelopes,
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator: () => ({
      frequency: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
    createGain() {
      const events = [];
      envelopes.push(events);
      return {
        gain: {
          setValueAtTime: (value, at) => events.push(['set', value, at]),
          linearRampToValueAtTime: (value, at) =>
            events.push(['ramp', value, at]),
          cancelScheduledValues() {},
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

test('only milestone warnings receive the stronger gain and slower attack', () => {
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
