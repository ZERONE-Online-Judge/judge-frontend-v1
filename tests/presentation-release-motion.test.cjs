const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(
  __dirname,
  '../src/domains/submissionScoreboard/presentationReleaseMotion.ts',
);
const loaded = new Module(filename, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const {
  PresentationReleaseMotionCoordinator: Coordinator,
  PRESENTATION_FOCUS_DURATION,
  PRESENTATION_SUSPENSE_DURATION,
  PRESENTATION_RETURN_DURATION,
  PRESENTATION_BOARD_HOLD_DURATION,
  PRESENTATION_RANK_HIGHLIGHT_DURATION,
  PRESENTATION_RANK_DURATION,
  PRESENTATION_RANK_FADE_DURATION,
  presentationRevealDuration,
  presentationRevealMovedTeamIds,
} = loaded.exports;

function section({
  divisionId = 'division',
  strategy = 'resolver',
  mode = 'partial',
  step = 0,
  totalSteps = 30,
  status = 'accepted',
  scoringMode = 'icpc',
  fromScore,
  toScore,
  scoreDelta,
  revealed = 0,
  finalRanks = [],
  title = '중요한 문제',
  name = '발표할 팀',
  roster = ['team', 'other', 'last'],
} = {}) {
  const rows = roster.map((id, index) => ({
    team_id: id,
    team_name: index ? id : name,
    rank: index ? index + 1 : step ? 1 : 3,
    solved: !index ? step : 0,
    total_score: !index ? (toScore ?? step * 10) : 0,
    submission_count: 3,
    problem_scores: [],
    is_revealed: true,
    ...(strategy === 'manual'
      ? {
          rank_is_final: finalRanks.includes(index + 1),
          rank: index + 1,
          is_revealed: finalRanks.includes(index + 1),
        }
      : {}),
  }));
  return {
    division: { division_id: divisionId, name: '일반부' },
    scoring_mode: scoringMode,
    frozen: mode !== 'all',
    problems: [{ problem_id: 'problem', problem_code: 'A10', title }],
    rows,
    release: {
      strategy,
      mode,
      total_count: roster.length,
      revealed_count: revealed,
      ranks: [1, 2, 3].map((rank) => ({
        rank,
        team_count: 1,
        revealed: finalRanks.includes(rank),
      })),
      ...(strategy === 'resolver'
        ? {
            resolver: {
              step,
              total_steps: totalSteps,
              pending_count: totalSteps - step,
              last_event: step
                ? {
                    team_id: roster[0],
                    team_name: name,
                    problem_code: 'A10',
                    status,
                    from_rank: 3,
                    to_rank: 1,
                    ...(fromScore !== undefined
                      ? { from_score: fromScore }
                      : {}),
                    ...(toScore !== undefined ? { to_score: toScore } : {}),
                    ...(scoreDelta !== undefined
                      ? { score_delta: scoreDelta }
                      : {}),
                  }
                : null,
            },
          }
        : {}),
    },
  };
}
function harness() {
  const coordinator = new Coordinator();
  let now = 1_000_000;
  return {
    coordinator,
    get state() {
      return coordinator.getSnapshot();
    },
    update(sections, options = {}) {
      now += 100;
      return coordinator.update({
        scopeKey: 'scope',
        contestId: 'contest',
        sections: Array.isArray(sections) ? sections : [sections],
        updatedAt: now,
        now,
        ended: true,
        visible: true,
        ...options,
      });
    },
    reveal(sections, options = {}) {
      assert.equal(this.update(sections, options), undefined);
      assert.equal(this.state.stage, 'focusing');
      assert.equal(this.deadline(), undefined);
      assert.equal(this.state.stage, 'suspense');
      return this.deadline();
    },
    deadline() {
      now = coordinator.getSnapshot().nextAt;
      assert.ok(now !== null);
      return coordinator.advance(now);
    },
  };
}
function settleReveal(h) {
  if (h.state.stage === 'focusing') h.deadline();
  if (h.state.stage === 'suspense') h.deadline();
  h.deadline();
  assert.equal(h.state.stage, 'returning');
  h.deadline();
  assert.equal(h.state.stage, 'holding');
  h.deadline();
  assert.equal(h.state.stage, 'highlighting');
  h.deadline();
  assert.equal(h.state.stage, 'moving');
  h.deadline();
  assert.equal(h.state.stage, 'board');
}
function nextReveal(h) {
  assert.equal(h.deadline(), undefined);
  assert.equal(h.state.stage, 'focusing');
  assert.equal(h.deadline(), undefined);
  assert.equal(h.state.stage, 'suspense');
  return h.deadline();
}

test('resolver returns to the old board, emphasizes its moved team, then commits one FLIP frame before clearing emphasis', () => {
  const h = harness();
  assert.equal(h.update(section()), undefined);
  assert.equal(h.update(section({ step: 1 })), undefined);
  assert.equal(h.state.stage, 'focusing');
  assert.equal(h.state.nextAt, 1_000_200 + PRESENTATION_FOCUS_DURATION);
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  // A premature dismiss must neither skip the entry nor play the result cue.
  h.coordinator.finish(1_000_300);
  assert.equal(h.state.stage, 'focusing');
  assert.equal(h.coordinator.advance(h.state.nextAt - 1), undefined);
  const focusEnd = h.state.nextAt;
  assert.equal(h.deadline(), undefined);
  assert.equal(h.state.stage, 'suspense');
  assert.equal(h.state.nextAt, focusEnd + PRESENTATION_SUSPENSE_DURATION);
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  h.coordinator.finish(focusEnd + 100);
  assert.equal(h.state.stage, 'suspense');
  assert.equal(h.state.nextAt, focusEnd + PRESENTATION_SUSPENSE_DURATION);
  assert.equal(h.coordinator.advance(h.state.nextAt - 1), undefined);
  assert.equal(h.deadline(), 'accepted');
  assert.equal(h.state.stage, 'result');
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  assert.equal(h.state.reveal.previous.rows[0].solved, 0);
  assert.equal(h.state.reveal.section.rows[0].solved, 1);
  const resultEnd = h.state.nextAt;
  h.deadline();
  assert.equal(h.state.stage, 'returning');
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  assert.equal(h.state.nextAt, resultEnd + PRESENTATION_RETURN_DURATION);
  h.deadline();
  assert.equal(h.state.stage, 'holding');
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  assert.deepEqual(presentationRevealMovedTeamIds(h.state.reveal), ['team']);
  assert.equal(
    h.state.nextAt,
    resultEnd + PRESENTATION_RETURN_DURATION + PRESENTATION_BOARD_HOLD_DURATION,
  );
  h.deadline();
  assert.equal(h.state.stage, 'highlighting');
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  assert.equal(h.state.sections[0].rows[0].rank, 3);
  assert.equal(
    h.state.nextAt,
    resultEnd +
      PRESENTATION_RETURN_DURATION +
      PRESENTATION_BOARD_HOLD_DURATION +
      PRESENTATION_RANK_HIGHLIGHT_DURATION,
  );
  h.deadline();
  assert.equal(h.state.stage, 'moving');
  assert.equal(h.state.sections[0].rows[0].solved, 1);
  assert.equal(h.state.sections[0].rows[0].rank, 1);
  assert.ok(h.state.reveal);
  const movementEnd = h.state.nextAt;
  assert.equal(
    movementEnd,
    resultEnd +
      PRESENTATION_RETURN_DURATION +
      PRESENTATION_BOARD_HOLD_DURATION +
      PRESENTATION_RANK_HIGHLIGHT_DURATION +
      PRESENTATION_RANK_DURATION,
  );
  h.deadline();
  assert.equal(h.state.stage, 'board');
  assert.equal(h.state.reveal, null);
  assert.equal(h.state.nextAt, movementEnd + PRESENTATION_RANK_FADE_DURATION);
  h.deadline();
  assert.equal(h.state.nextAt, null);
});

test('rapid observed steps queue their own authoritative snapshots instead of jumping from the first to the latest', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  h.update(section({ step: 2, status: 'wrong_answer' }));
  h.update(section({ step: 3 }));
  assert.equal(h.state.reveal.section.release.resolver.step, 1);
  settleReveal(h);
  assert.equal(h.state.sections[0].release.resolver.step, 1);
  assert.equal(nextReveal(h), 'rejected');
  assert.equal(h.state.reveal.section.release.resolver.step, 2);
  settleReveal(h);
  assert.equal(h.state.sections[0].release.resolver.step, 2);
  // Successful background polling keeps the queue eligible while it plays.
  h.update(section({ step: 3 }));
  assert.equal(nextReveal(h), 'accepted');
  assert.equal(h.state.reveal.section.release.resolver.step, 3);
  settleReveal(h);
  h.deadline();
  assert.equal(h.state.sections[0].release.resolver.step, 3);
  assert.equal(h.state.nextAt, null);
});

test('rank emphasis includes only announced movers, including tied teams, and leaves displaced neighbors unhighlighted', () => {
  const before = section({ roster: ['team', 'tied', 'stays', 'neighbor'] });
  before.rows.forEach((row, index) => {
    row.rank = [5, 6, 2, 1][index];
  });
  const after = global.structuredClone(before);
  after.rows.forEach((row, index) => {
    row.rank = [1, 1, 2, 3][index];
  });
  const reveal = {
    kind: 'rank',
    previous: before,
    section: after,
    teams: [after.rows[0], after.rows[1], after.rows[2], after.rows[0]],
  };
  assert.deepEqual(presentationRevealMovedTeamIds(reveal), ['team', 'tied']);
  assert.deepEqual(
    presentationRevealMovedTeamIds({ ...reveal, teams: [after.rows[2]] }),
    [],
  );
  assert.deepEqual(
    presentationRevealMovedTeamIds({
      ...reveal,
      teams: [{ team_id: 'unknown', rank: 1 }, { rank: 1 }],
    }),
    [],
  );
});

test('simultaneous divisions publish only the currently announced section patch, with collision-safe event identities', () => {
  const h = harness();
  const first = 'a\u0000b';
  const second = 'a';
  h.update([section({ divisionId: first }), section({ divisionId: second })]);
  h.update([
    section({ divisionId: first, step: 1 }),
    section({ divisionId: second, step: 1 }),
  ]);
  const key = h.state.reveal.key;
  settleReveal(h);
  assert.deepEqual(
    h.state.sections.map((s) => s.release.resolver.step),
    [1, 0],
  );
  h.deadline();
  assert.notEqual(h.state.reveal.key, key);
  assert.equal(h.state.reveal.divisionId, second);
  settleReveal(h);
  assert.deepEqual(
    h.state.sections.map((s) => s.release.resolver.step),
    [1, 1],
  );
});

test('initial, duplicate and reordered polling snapshots never replay an existing result', () => {
  const h = harness();
  assert.equal(h.update(section({ step: 1 })), undefined);
  assert.equal(h.update(section({ step: 1 })), undefined);
  assert.equal(h.state.stage, 'board');
  const oldAt = 1_000_000;
  assert.equal(h.update(section(), { updatedAt: oldAt }), undefined);
  assert.equal(h.state.sections[0].release.resolver.step, 1);
  assert.equal(h.reveal(section({ step: 2 })), 'accepted');
});

test('a real event at an equal millisecond timestamp is accepted once while non-event row updates remain live', () => {
  const h = harness();
  const timing = { updatedAt: 1000, now: 1000 };
  h.update(section(), timing);
  const rename = section({ name: '바뀐 이름' });
  h.update(rename, timing);
  assert.equal(h.state.sections[0].rows[0].team_name, '바뀐 이름');
  assert.equal(h.reveal(section({ step: 1 }), timing), 'accepted');
  assert.equal(h.update(section({ step: 1 }), timing), undefined);
});

test('undo cancels an active reveal and its pending actions; an intentional new forward action can play again', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  h.update(section({ step: 2 }));
  assert.equal(h.update(section()), undefined);
  assert.equal(h.state.stage, 'board');
  assert.equal(h.state.nextAt, null);
  assert.equal(h.state.sections[0].release.resolver.step, 0);
  assert.equal(h.reveal(section({ step: 1 })), 'accepted');
});

test('missed steps, resolver generation changes, roster changes and cross-contest changes flush without fabricating events', () => {
  for (const change of [
    { step: 3 },
    { step: 1, totalSteps: 31 },
    { step: 1, roster: ['team', 'changed', 'last'] },
  ]) {
    const h = harness();
    h.update(section());
    h.update(section({ step: 1 }));
    assert.equal(h.update(section(change)), undefined);
    assert.equal(h.state.reveal, null);
    assert.equal(h.state.nextAt, null);
  }
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  assert.equal(
    h.update(section({ step: 2 }), {
      scopeKey: 'other-scope',
      contestId: 'other',
    }),
    undefined,
  );
  assert.equal(h.state.scopeKey, 'other-scope');
  assert.equal(h.state.stage, 'board');
});

test('hidden, reduced-motion, live and suppressed contexts cancel entry, suspense and playback without delayed replay', () => {
  for (const stage of [
    'focusing',
    'suspense',
    'result',
    'returning',
    'holding',
    'highlighting',
    'moving',
    'board',
  ]) {
    for (const option of [
      { visible: false },
      { reducedMotion: true },
      { ended: false },
      { suppressed: true },
    ]) {
      const h = harness();
      h.update(section());
      h.update(section({ step: 1 }));
      while (h.state.stage !== stage) h.deadline();
      h.update(section({ step: 2 }), option);
      assert.equal(h.state.reveal, null);
      assert.equal(h.state.sections[0].release.resolver.step, 2);
      assert.equal(h.state.nextAt, null);
      assert.equal(h.update(section({ step: 2 })), undefined);
      assert.equal(h.reveal(section({ step: 3 })), 'accepted');
    }
  }
});

test('undo, changed scope, roster reset, stale data and explicit pause cancel silent suspense and its queued results', () => {
  for (const cancel of [
    (h) => h.update(section()),
    (h) =>
      h.update(section({ step: 7 }), {
        scopeKey: 'other-scope',
        contestId: 'other-contest',
      }),
    (h) => h.update(section({ step: 2, roster: ['team', 'new-team'] })),
    (h) =>
      h.update(section({ step: 2 }), {
        updatedAt: 1_001_000,
        now: 1_012_000,
      }),
    (h) => h.coordinator.pause(),
  ]) {
    const h = harness();
    h.update(section());
    h.update(section({ step: 1 }));
    h.update(section({ step: 2 }));
    assert.equal(h.deadline(), undefined);
    assert.equal(h.state.stage, 'suspense');
    const abandonedDeadline = h.state.nextAt;
    assert.equal(cancel(h), undefined);
    assert.equal(h.state.stage, 'board');
    assert.equal(h.state.reveal, null);
    assert.equal(h.state.nextAt, null);
    assert.equal(h.coordinator.advance(abandonedDeadline), undefined);
    assert.equal(h.state.reveal, null);
  }
});

test('an explicit pause with no hidden poll discards backlog and the first fresh snapshot quietly establishes its baseline', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  h.coordinator.pause();
  assert.equal(h.state.nextAt, null);
  assert.equal(h.update(section({ step: 2 })), undefined);
  assert.equal(h.state.sections[0].release.resolver.step, 2);
  assert.equal(h.reveal(section({ step: 3 })), 'accepted');
});

test('stale snapshots and reconnect gaps cancel a pending presentation', () => {
  for (const timing of [
    { updatedAt: 1_001_000, now: 1_012_000 },
    { updatedAt: 1_031_000, now: 1_031_000 },
  ]) {
    const h = harness();
    h.update(section());
    h.update(section({ step: 1 }));
    assert.equal(h.update(section({ step: 2 }), timing), undefined);
    assert.equal(h.state.nextAt, null);
    assert.equal(h.state.reveal, null);
  }
});

test('manual rank publication uses the final selected position and includes every tied team while preserving masked rows', () => {
  const h = harness();
  const before = section({ strategy: 'manual' });
  h.update(before);
  const after = section({ strategy: 'manual', revealed: 2, finalRanks: [2] });
  after.rows[2] = {
    ...after.rows[2],
    rank: 2,
    rank_is_final: true,
    is_revealed: true,
  };
  assert.equal(h.reveal(after), 'result');
  assert.equal(h.state.reveal.kind, 'rank');
  assert.deepEqual(
    h.state.reveal.teams.map((row) => row.rank),
    [2, 2],
  );
  assert.equal(h.state.sections[0].rows[1].is_revealed, false);
  settleReveal(h);
  assert.equal(h.state.sections[0].rows[0].is_revealed, false);
  assert.deepEqual(
    h.state.sections[0].rows.slice(1).map((row) => row.rank),
    [2, 2],
  );
});

test('batch publication has one all-results reveal, including the final single resolver event only once', () => {
  for (const strategy of ['manual_all', 'immediate', 'manual']) {
    const h = harness();
    h.update(section({ strategy }));
    assert.equal(
      h.reveal(
        section({ strategy, mode: 'all', revealed: 3, finalRanks: [1, 2, 3] }),
      ),
      'complete',
    );
    assert.equal(h.state.reveal.kind, 'all');
    assert.equal(h.state.reveal.teams.length, 3);
  }
  const h = harness();
  h.update(section());
  assert.equal(
    h.reveal(section({ step: 1, mode: 'all', revealed: 3 })),
    'accepted',
  );
  assert.equal(h.state.reveal.kind, 'resolver');
  settleReveal(h);
  assert.equal(h.deadline(), undefined);
  assert.equal(h.state.reveal, null);
});

test('IOI uses actual partial score gain or unchanged score independently of raw AC/WA verdict', () => {
  for (const [fromScore, toScore, status, expected] of [
    [25, 42.75, 'wrong_answer', 'accepted'],
    [75, 75, 'accepted', 'result'],
    [0, 0, 'wrong_answer', 'result'],
    [40, 100, 'wrong_answer', 'accepted'],
  ]) {
    const h = harness();
    h.update(section({ scoringMode: 'ioi', toScore: fromScore }));
    assert.equal(
      h.reveal(
        section({
          step: 1,
          scoringMode: 'ioi',
          fromScore,
          toScore,
          scoreDelta: toScore - fromScore,
          status,
        }),
      ),
      expected,
    );
    assert.equal(
      h.state.reveal.section.release.resolver.last_event.to_score,
      toScore,
    );
    assert.equal(h.state.sections[0].rows[0].total_score, fromScore);
    settleReveal(h);
    assert.equal(h.state.sections[0].rows[0].total_score, toScore);
  }
});

test('long names and tied groups get bounded reading time, and source mutation cannot alter retained result snapshots', () => {
  const h = harness();
  const source = section();
  h.update(source);
  source.rows[0].solved = 999;
  assert.equal(h.state.sections[0].rows[0].solved, 0);
  const next = section({
    step: 1,
    name: '아주 긴 팀 이름 '.repeat(30),
    title: '아주 긴 문제 제목 '.repeat(30),
  });
  h.update(next);
  assert.equal(presentationRevealDuration(h.state.reveal), 2600);
  next.rows[0].team_name = '변조';
  next.release.resolver.last_event.status = 'wrong_answer';
  assert.notEqual(h.state.reveal.teams[0].team_name, '변조');
  assert.equal(
    h.state.reveal.section.release.resolver.last_event.status,
    'accepted',
  );
});

test('bounded queues drop a runaway backlog and show the latest truth instead of playing minutes of old results', () => {
  const h = harness();
  h.update(section());
  for (let step = 1; step <= 14; step++) h.update(section({ step }));
  assert.equal(h.state.stage, 'board');
  assert.equal(h.state.reveal, null);
  assert.equal(h.state.sections[0].release.resolver.step, 14);
  assert.equal(h.state.nextAt, null);
});

test('resolver all-at-once publication with no last event remains a batch reveal even when steps jump', () => {
  const h = harness();
  h.update(section({ step: 2 }));
  const all = section({ step: 30, mode: 'all', revealed: 3 });
  all.release.resolver.last_event = null;
  assert.equal(h.reveal(all), 'complete');
  assert.equal(h.state.reveal.kind, 'all');
  assert.equal(h.state.reveal.teams.length, 3);
});

test('the last manual single rank stays a final-rank spotlight rather than a batch-results replay', () => {
  const h = harness();
  h.update(section({ strategy: 'manual', revealed: 2, finalRanks: [1, 2] }));
  h.update(
    section({
      strategy: 'manual',
      mode: 'all',
      revealed: 3,
      finalRanks: [1, 2, 3],
    }),
  );
  assert.equal(h.state.reveal.kind, 'rank');
  assert.deepEqual(
    h.state.reveal.teams.map((row) => row.rank),
    [3],
  );
});

test('a lost data feed cannot keep playing queued stale results merely because its timers still fire', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1, name: '긴 이름 '.repeat(50) }));
  h.update(section({ step: 2, name: '긴 이름 '.repeat(50) }));
  settleReveal(h);
  assert.equal(nextReveal(h), 'accepted');
  h.coordinator.advance(1_020_000);
  assert.equal(h.state.stage, 'board');
  assert.equal(h.state.reveal, null);
  assert.equal(h.state.nextAt, null);
  assert.equal(h.state.sections[0].release.resolver.step, 2);
});

test('nullable score metadata on an ICPC event does not turn its AC cue into an IOI no-gain result', () => {
  const h = harness();
  h.update(section());
  const next = section({ step: 1 });
  Object.assign(next.release.resolver.last_event, {
    from_score: null,
    to_score: null,
    score_delta: null,
  });
  assert.equal(h.reveal(next), 'accepted');
});

test('actual public manual payloads use row metadata with empty rank controls and lose final flags when fully public', () => {
  const h = harness();
  const before = section({ strategy: 'manual' });
  before.release.ranks = [];
  h.update(before);
  const partial = section({
    strategy: 'manual',
    revealed: 1,
    finalRanks: [3],
  });
  partial.release.ranks = [];
  assert.equal(h.reveal(partial), 'result');
  assert.equal(h.state.reveal.kind, 'rank');
  assert.deepEqual(
    h.state.reveal.teams.map((row) => row.rank),
    [3],
  );
  settleReveal(h);
  h.deadline();
  const second = section({
    strategy: 'manual',
    revealed: 2,
    finalRanks: [2, 3],
  });
  second.release.ranks = [];
  h.update(second);
  assert.deepEqual(
    h.state.reveal.teams.map((row) => row.rank),
    [2],
  );
  settleReveal(h);
  h.deadline();
  const all = section({
    strategy: 'manual',
    mode: 'all',
    revealed: 3,
    finalRanks: [1, 2, 3],
  });
  all.rows.forEach((row) => {
    delete row.rank_is_final;
  });
  assert.equal(h.reveal(all), 'result');
  assert.equal(h.state.reveal.kind, 'rank');
  assert.deepEqual(
    h.state.reveal.teams.map((row) => row.rank),
    [1],
  );
});

test('normal results preserve the old board beat, move rows within 3.8 seconds and finish within 4.7 seconds', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  const readDuration = presentationRevealDuration(h.state.reveal);
  assert.equal(readDuration, 1400);
  assert.ok(
    PRESENTATION_FOCUS_DURATION +
      PRESENTATION_SUSPENSE_DURATION +
      readDuration +
      PRESENTATION_RETURN_DURATION +
      PRESENTATION_BOARD_HOLD_DURATION +
      PRESENTATION_RANK_HIGHLIGHT_DURATION <=
      3800,
  );
  assert.ok(
    PRESENTATION_FOCUS_DURATION +
      PRESENTATION_SUSPENSE_DURATION +
      readDuration +
      PRESENTATION_RETURN_DURATION +
      PRESENTATION_BOARD_HOLD_DURATION +
      PRESENTATION_RANK_HIGHLIGHT_DURATION +
      PRESENTATION_RANK_DURATION +
      PRESENTATION_RANK_FADE_DURATION <=
      4700,
  );
  settleReveal(h);
  assert.equal(h.state.sections[0].release.resolver.step, 1);
  assert.equal(h.state.nextAt !== null, true);
  h.deadline();
  assert.equal(h.state.nextAt, null);
});

test('long names and tied groups preserve the board return and bounded reading time within 5.9 seconds', () => {
  const h = harness();
  h.update(section());
  h.update(
    section({
      step: 1,
      name: '긴 팀 이름 '.repeat(30),
      title: '긴 문제 이름 '.repeat(30),
    }),
  );
  const duration = presentationRevealDuration(h.state.reveal);
  assert.equal(duration, 2600);
  assert.ok(
    PRESENTATION_FOCUS_DURATION +
      PRESENTATION_SUSPENSE_DURATION +
      duration +
      PRESENTATION_RETURN_DURATION +
      PRESENTATION_BOARD_HOLD_DURATION +
      PRESENTATION_RANK_HIGHLIGHT_DURATION +
      PRESENTATION_RANK_DURATION +
      PRESENTATION_RANK_FADE_DURATION <=
      5900,
  );
  const tied = {
    ...h.state.reveal,
    kind: 'rank',
    teams: Array.from({ length: 16 }, (_, index) => ({
      ...h.state.reveal.teams[0],
      team_id: `tie-${index}`,
      rank: 1,
    })),
  };
  assert.equal(presentationRevealDuration(tied), 2600);
});

test('a batch-results headline does not wait longer merely because its undisplayed roster is large', () => {
  const h = harness();
  h.update(section());
  h.update(section({ step: 1 }));
  const all = {
    ...h.state.reveal,
    kind: 'all',
    teams: Array.from({ length: 100 }, (_, index) => ({
      ...h.state.reveal.teams[0],
      team_id: `team-${index}`,
      team_name: '아주 긴 팀 이름 '.repeat(50),
    })),
  };
  assert.equal(presentationRevealDuration(all), 1400);
});
