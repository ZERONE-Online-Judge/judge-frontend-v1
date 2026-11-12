const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(
  __dirname,
  '../src/domains/submissionScoreboard/presentationReleaseSound.ts',
);
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  filename,
);
const { PresentationReleaseSoundTracker } = loaded.exports;

function section({
  divisionId = 'division',
  strategy = 'resolver',
  mode = 'partial',
  total = 3,
  revealed = 0,
  step = 0,
  totalSteps = 4,
  status = null,
  finalTeams = [],
  roster = ['one', 'two', 'three'],
} = {}) {
  return {
    division: { division_id: divisionId },
    frozen: mode !== 'all',
    problems: [],
    rows: roster.map((id, index) => ({
      team_id: id,
      team_name: id,
      rank: index + 1,
      solved: 0,
      submission_count: 0,
      problem_scores: [],
      is_revealed: true,
      is_finalized: false,
      ...(strategy === 'manual'
        ? { rank_is_final: finalTeams.includes(id) }
        : {}),
    })),
    release: {
      strategy,
      mode,
      total_count: total,
      revealed_count: revealed,
      ranks: [],
      ...(strategy === 'resolver'
        ? {
            resolver: {
              step,
              total_steps: totalSteps,
              pending_count: totalSteps - step,
              last_event: status
                ? {
                    team_id: 'one',
                    team_name: 'one',
                    problem_code: 'A',
                    status,
                    from_rank: 3,
                    to_rank: status === 'accepted' ? 1 : 3,
                  }
                : null,
            },
          }
        : {}),
    },
  };
}
function harness() {
  const tracker = new PresentationReleaseSoundTracker();
  let timestamp = 1_000_000;
  return {
    tracker,
    update(sections, options = {}) {
      timestamp += 1000;
      return tracker.update({
        contestId: 'contest',
        sections: Array.isArray(sections) ? sections : [sections],
        ended: true,
        updatedAt: timestamp,
        now: timestamp,
        visible: true,
        ...options,
      });
    },
  };
}

test('first observation, polling and already published results are silent; only fresh cell progress sounds', () => {
  const h = harness();
  assert.equal(h.update(section({ step: 1, status: 'accepted' })), undefined);
  assert.equal(h.update(section({ step: 1, status: 'accepted' })), undefined);
  assert.equal(h.update(section({ step: 2, status: 'accepted' })), 'accepted');
  assert.equal(h.update(section({ step: 2, status: 'accepted' })), undefined);
  const loadedComplete = harness();
  assert.equal(
    loadedComplete.update(section({ mode: 'all', step: 4, revealed: 3 })),
    undefined,
  );
});

test('equal fetch timestamps deduplicate unchanged semantics and accept a real forward event', () => {
  const h = harness();
  const time = { updatedAt: 1000, now: 1000 };
  assert.equal(h.update(section(), time), undefined);
  assert.equal(
    h.update(section({ step: 1, status: 'accepted' }), time),
    'accepted',
  );
  assert.equal(
    h.update(section({ step: 1, status: 'accepted' }), time),
    undefined,
  );
});

test('resolver cell statuses distinguish AC from unsuccessful verdicts without reading rank movement', () => {
  for (const status of [
    'wrong_answer',
    'compile_error',
    'time_limit_exceeded',
    'runtime_error',
    'system_error',
  ]) {
    const h = harness();
    h.update(section());
    assert.equal(h.update(section({ step: 1, status })), 'rejected', status);
  }
  const missing = harness();
  missing.update(section());
  assert.equal(missing.update(section({ step: 1 })), undefined);
});

test('starting initializes count zero to the same roster; empty contests do not announce completion', () => {
  for (const strategy of ['resolver', 'manual']) {
    const h = harness();
    h.update(
      section({ strategy, mode: 'not_started', total: 0, totalSteps: 0 }),
    );
    assert.equal(h.update(section({ strategy })), 'reveal');
    assert.equal(h.update(section({ strategy })), undefined);
  }
  const direct = harness();
  direct.update(section({ mode: 'not_started', total: 0, totalSteps: 0 }));
  assert.equal(
    direct.update(section({ mode: 'all', step: 4, revealed: 3 })),
    'complete',
  );
  const empty = harness();
  empty.update(
    section({ mode: 'not_started', total: 0, roster: [], totalSteps: 0 }),
  );
  assert.equal(
    empty.update(section({ mode: 'all', total: 0, roster: [], totalSteps: 0 })),
    undefined,
  );
});

test('manual final-rank groups and all-publication use distinct cues; optional public flags are not rank events', () => {
  const h = harness();
  h.update(section({ strategy: 'manual' }));
  assert.equal(
    h.update(section({ strategy: 'manual', revealed: 1, finalTeams: ['one'] })),
    'result',
  );
  assert.equal(
    h.update(section({ strategy: 'manual', revealed: 1, finalTeams: ['one'] })),
    undefined,
  );
  assert.equal(
    h.update(section({ strategy: 'manual', mode: 'all', revealed: 3 })),
    'complete',
  );
  const resolver = harness();
  resolver.update(section());
  const finalized = section();
  finalized.rows[0].is_finalized = true;
  finalized.rows[0].rank = 1;
  finalized.rows[0].solved = 3;
  assert.equal(resolver.update(finalized), undefined);
});

test('all and automatic publication complete once, with precedence over the last accepted resolver cell', () => {
  for (const strategy of ['resolver', 'manual', 'manual_all', 'immediate']) {
    const h = harness();
    h.update(section({ strategy }));
    const all = section({
      strategy,
      mode: 'all',
      revealed: 3,
      step: 4,
      status: 'accepted',
    });
    assert.equal(h.update(all), 'complete', strategy);
    assert.equal(h.update(all), undefined, strategy);
  }
});

test('undo and reset are silent, and a deliberate forward action after undo can sound again', () => {
  const h = harness();
  h.update(section());
  assert.equal(h.update(section({ step: 1, status: 'accepted' })), 'accepted');
  assert.equal(h.update(section()), undefined);
  assert.equal(h.update(section({ step: 1, status: 'accepted' })), 'accepted');
  assert.equal(
    h.update(section({ mode: 'not_started', total: 0, totalSteps: 0 })),
    undefined,
  );
  const manual = harness();
  manual.update(
    section({ strategy: 'manual', revealed: 1, finalTeams: ['one'] }),
  );
  assert.equal(manual.update(section({ strategy: 'manual' })), undefined);
  assert.equal(
    manual.update(
      section({ strategy: 'manual', revealed: 1, finalTeams: ['one'] }),
    ),
    'result',
  );
  // A lost final-rank flag must not be misread as a different forward rank group.
  assert.equal(
    manual.update(
      section({ strategy: 'manual', revealed: 2, finalTeams: ['two'] }),
    ),
    undefined,
  );
});

test('roster, strategy, total-count and active resolver-generation changes silently rebase', () => {
  for (const change of [
    { roster: ['one', 'two'] },
    { strategy: 'manual' },
    { total: 4 },
    { totalSteps: 5 },
  ]) {
    const h = harness();
    h.update(section());
    assert.equal(
      h.update(section({ ...change, step: 1, status: 'accepted' })),
      undefined,
    );
  }
  const order = harness();
  order.update(section());
  assert.equal(
    order.update(
      section({ roster: ['three', 'two', 'one'], step: 1, status: 'accepted' }),
    ),
    'accepted',
  );
});

test('newly selected divisions are quiet and removing a filter resets only its baseline', () => {
  const h = harness();
  h.update(section());
  assert.equal(
    h.update([
      section(),
      section({ divisionId: 'new', step: 1, status: 'accepted' }),
    ]),
    undefined,
  );
  assert.equal(
    h.update([
      section(),
      section({ divisionId: 'new', step: 2, status: 'accepted' }),
    ]),
    'accepted',
  );
  h.update(section());
  assert.equal(
    h.update([
      section(),
      section({ divisionId: 'new', mode: 'all', revealed: 3, step: 4 }),
    ]),
    undefined,
  );
  assert.equal(
    h.update(section({ step: 1, status: 'accepted' }), {
      contestId: 'different',
    }),
    undefined,
  );
});

test('hidden updates and explicit pause make the first fresh visible result quiet, without replaying cached data', () => {
  for (const hiddenPoll of [false, true]) {
    const h = harness();
    h.update(section());
    h.tracker.pause();
    if (hiddenPoll)
      h.update(section({ step: 1, status: 'accepted' }), { visible: false });
    assert.equal(h.update(section({ step: 2, status: 'accepted' })), undefined);
    assert.equal(
      h.update(section({ step: 3, status: 'accepted' })),
      'accepted',
    );
  }
  const h = harness();
  h.update(section(), { updatedAt: 1000, now: 1000 });
  h.tracker.pause();
  h.update(section(), { updatedAt: 1000, now: 1100 });
  assert.equal(
    h.update(section({ step: 1, status: 'accepted' }), {
      updatedAt: 2000,
      now: 2000,
    }),
    undefined,
  );
});

test('suppressed and live-standing transitions are consumed without delayed playback', () => {
  const h = harness();
  h.update(section());
  assert.equal(
    h.update(section({ step: 1, status: 'accepted' }), { suppressed: true }),
    undefined,
  );
  assert.equal(h.update(section({ step: 1, status: 'accepted' })), undefined);
  assert.equal(h.update(section({ step: 2, status: 'accepted' })), 'accepted');
  const live = harness();
  live.update(section(), { ended: false });
  assert.equal(
    live.update(section({ step: 1, status: 'accepted' }), { ended: false }),
    undefined,
  );
  assert.equal(
    live.update(section({ step: 1, status: 'accepted' })),
    undefined,
  );
});

test('long gaps, stale snapshots and clock rollbacks silently rebase instead of playing a backlog', () => {
  for (const timing of [
    { updatedAt: 30_000, now: 30_000 },
    { updatedAt: 2000, now: 12_001 },
    { updatedAt: 900, now: 1100 },
    { updatedAt: 1100, now: 900 },
  ]) {
    const h = harness();
    h.update(section(), { updatedAt: 1000, now: 1000 });
    assert.equal(
      h.update(section({ step: 1, status: 'accepted' }), timing),
      undefined,
    );
  }
  const stale = harness();
  stale.update(section(), { updatedAt: 1000, now: 1000 });
  stale.update(section(), { updatedAt: 1000, now: 12_000 });
  assert.equal(
    stale.update(section({ step: 1, status: 'accepted' }), {
      updatedAt: 12_001,
      now: 12_001,
    }),
    undefined,
  );
});

test('multiple divisions coalesce into one highest-priority cue independent of ordering', () => {
  const pairs = [
    [
      section({ step: 1, status: 'wrong_answer' }),
      section({ divisionId: 'b', step: 1, status: 'accepted' }),
      'accepted',
    ],
    [
      section({ step: 1, status: 'accepted' }),
      section({
        divisionId: 'b',
        strategy: 'manual',
        revealed: 1,
        finalTeams: ['one'],
      }),
      'result',
    ],
    [
      section({ strategy: 'manual', revealed: 1, finalTeams: ['one'] }),
      section({ divisionId: 'b', mode: 'all', revealed: 3, step: 4 }),
      'complete',
    ],
  ];
  for (const [first, second, expected] of pairs) {
    for (const reversed of [false, true]) {
      const h = harness();
      h.update([
        section({ strategy: first.release.strategy }),
        section({ divisionId: 'b', strategy: second.release.strategy }),
      ]);
      assert.equal(
        h.update(reversed ? [second, first] : [first, second]),
        expected,
      );
    }
  }
});

test('retained snapshots cannot be mutated by callers or malformed rows to fabricate a reveal', () => {
  const h = harness();
  const mutable = section();
  h.update(mutable);
  mutable.release.resolver.step = 1;
  mutable.release.resolver.last_event = section({
    status: 'accepted',
  }).release.resolver.last_event;
  assert.equal(h.update(mutable), 'accepted');
  const invalid = section({ mode: 'all', revealed: 3 });
  invalid.rows[0].team_id = undefined;
  assert.equal(h.update(invalid), undefined);
  assert.equal(h.update(section({ mode: 'all', revealed: 3 })), undefined);
});
