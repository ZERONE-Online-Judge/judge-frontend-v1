const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/operator',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');

const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('./')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const resolved = ['.ts', '.tsx']
        .map((extension) => base + extension)
        .find(fs.existsSync);
      if (resolved)
        return source(
          path.relative(path.resolve(__dirname, '../src'), resolved),
        );
    }
    return nativeRequire(id);
  };
  modules.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { MotionNumber, MotionProgressText, MotionProgress, ResultTransition } =
  source('shared/ui/ProgressMotion.tsx');
const { useAnimatedValue } = source('shared/hooks/useAnimatedValue.ts');
const ScoreDetails = source(
  'components/contest/submissions/SubmissionScoreDetails.tsx',
).default;

let root, host, raf, nextRaf, cancellations, hidden, reduced, mediaListeners;
const media = {
  get matches() {
    return reduced;
  },
  addEventListener(_event, listener) {
    mediaListeners.add(listener);
  },
  removeEventListener(_event, listener) {
    mediaListeners.delete(listener);
  },
};
Object.defineProperty(document, 'hidden', {
  configurable: true,
  get: () => hidden,
});
function installRaf() {
  window.requestAnimationFrame = (callback) => {
    const id = nextRaf++;
    raf.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    cancellations.push(id);
    raf.delete(id);
  };
}
beforeEach(() => {
  raf = new Map();
  nextRaf = 1;
  cancellations = [];
  hidden = false;
  reduced = false;
  mediaListeners = new Set();
  window.matchMedia = () => media;
  installRaf();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  assert.equal(
    raf.size,
    0,
    'unmount must cancel every scheduled animation frame',
  );
  assert.equal(
    mediaListeners.size,
    0,
    'unmount must remove motion preference listeners',
  );
  document.body.innerHTML = '';
});
after(() => dom.window.close());
async function render(element) {
  await act(async () => root.render(element));
  return host;
}
async function frame(timestamp) {
  const pending = [...raf.values()];
  raf.clear();
  await act(async () => pending.forEach((callback) => callback(timestamp)));
}
async function setReduced(value) {
  await act(async () => {
    reduced = value;
    [...mediaListeners].forEach((listener) => listener());
  });
}
async function setHidden(value) {
  await act(async () => {
    hidden = value;
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
}
function visible(index = 0) {
  return host
    .querySelectorAll('[data-motion-value]')
    [index].getAttribute('data-motion-value');
}
function visualNumber(index = 0) {
  return Number(visible(index).replaceAll(',', ''));
}
function fillWidth() {
  return Number.parseFloat(
    host.querySelector('.zoj-motion-progress-fill').style.width,
  );
}
function HookProbe({ value, scope = 'run', duration = 420 }) {
  const display = useAnimatedValue(value, scope, duration);
  return h('output', { 'data-probe': display ?? 'unknown' }, String(display));
}

// Deliberately manual RAF timestamps: no wall-clock sleeps or polling.
test('a known initial value and server rendering show the confirmed value immediately', async () => {
  await render(
    h(MotionNumber, { value: 1234.5, scope: 'run', fractionDigits: 1 }),
  );
  assert.equal(visible(), '1,234.5');
  assert.equal(host.querySelector('.sr-only').textContent, '1,234.5');
  assert.equal(raf.size, 0);
  const ssr = renderToStaticMarkup(
    h(MotionNumber, { value: 37, scope: 'server' }),
  );
  assert.match(ssr, /data-motion-value="37"/);
  assert.match(ssr, /class="sr-only">37</);
});

test('screen reader text updates immediately while visible numbers interpolate within confirmed bounds', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 80, scope: 'run' }));
  const accessible = host.querySelector('.sr-only');
  assert.equal(accessible.textContent, '80');
  assert.equal(visible(), '0');
  assert.equal(
    host.querySelector('[data-motion-value]').getAttribute('aria-hidden'),
    'true',
  );
  const observations = [];
  for (const timestamp of [0, 105, 210, 315, 420]) {
    await frame(timestamp);
    observations.push(visualNumber());
    assert.equal(host.querySelector('.sr-only'), accessible);
    assert.equal(accessible.textContent, '80');
  }
  assert.deepEqual(observations, [0, 46, 70, 79, 80]);
  assert.ok(
    observations.every(
      (value, index) =>
        value >= 0 &&
        value <= 80 &&
        (index === 0 || value >= observations[index - 1]),
    ),
  );
  assert.equal(raf.size, 0);
  await frame(10000);
  assert.equal(
    visible(),
    '80',
    'confirmed progress must never drift on its own',
  );
});

test('decimal values finish exactly at the confirmed value without rounding the underlying hook', async () => {
  await render(h(HookProbe, { value: 0 }));
  await render(h(HookProbe, { value: 3.75 }));
  const values = [];
  for (const timestamp of [0, 70, 140, 210, 280, 350, 420]) {
    await frame(timestamp);
    values.push(Number(host.querySelector('output').dataset.probe));
  }
  assert.equal(values.at(-1), 3.75);
  assert.ok(
    values.every(
      (value, index) =>
        value <= 3.75 && (index === 0 || value >= values[index - 1]),
    ),
  );
  assert.equal(raf.size, 0);
});

test('a newer larger snapshot cancels the old animation and continues from the visible value', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 40, scope: 'run' }));
  await frame(0);
  await frame(210);
  const previous = visualNumber();
  assert.equal(previous, 35);
  const oldFrame = [...raf.keys()][0];
  await render(h(MotionNumber, { value: 100, scope: 'run' }));
  assert.equal(visualNumber(), previous);
  assert.equal(host.querySelector('.sr-only').textContent, '100');
  assert.ok(cancellations.includes(oldFrame));
  assert.equal(raf.size, 1);
  await frame(300);
  assert.equal(visualNumber(), previous);
  await frame(720);
  assert.equal(visible(), '100');
  assert.equal(raf.size, 0);
});

test('a lower confirmed snapshot snaps immediately and cannot restart from an older visible value', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 100, scope: 'run' }));
  await frame(0);
  await frame(42);
  assert.ok(visualNumber() < 60);
  await render(h(MotionNumber, { value: 60, scope: 'run' }));
  assert.equal(visible(), '60');
  assert.equal(
    raf.size,
    0,
    'a decreasing snapshot must stop, not schedule a backward jump',
  );
  await frame(500);
  assert.equal(visible(), '60');
});

test('a lower confirmed snapshot before the first RAF resets the requested target rather than the last painted target', async () => {
  await render(h(MotionNumber, { value: 20, scope: 'run' }));
  await render(h(MotionNumber, { value: 80, scope: 'run' }));
  const queuedFrame = [...raf.keys()][0];
  assert.equal(visible(), '20');
  await render(h(MotionNumber, { value: 40, scope: 'run' }));
  assert.equal(visible(), '40');
  assert.equal(host.querySelector('.sr-only').textContent, '40');
  assert.ok(cancellations.includes(queuedFrame));
  assert.equal(raf.size, 0);
  await frame(1000);
  assert.equal(visible(), '40');
});

test('switching execution scope snaps and prevents an obsolete callback from restoring previous progress', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'first' }));
  await render(h(MotionNumber, { value: 100, scope: 'first' }));
  await frame(0);
  await frame(42);
  const previousFrame = [...raf.keys()][0];
  await render(h(MotionNumber, { value: 70, scope: 'second' }));
  assert.equal(visible(), '70');
  assert.ok(cancellations.includes(previousFrame));
  assert.equal(raf.size, 0);
  await frame(1000);
  assert.equal(visible(), '70');
});

test('unknown, invalid, restored and zero values clear or reset previous interpolation', async () => {
  await render(h(MotionNumber, { value: 10, scope: 'run' }));
  await render(h(MotionNumber, { value: 80, scope: 'run' }));
  await frame(0);
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    await render(h(MotionNumber, { value, scope: 'run' }));
    assert.equal(visible(), '—');
    assert.equal(host.querySelector('.sr-only').textContent, '—');
    assert.equal(raf.size, 0);
  }
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  assert.equal(visible(), '0');
  assert.equal(raf.size, 0);
  await render(h(MotionNumber, { value: 5, scope: 'run' }));
  await frame(0);
  await frame(420);
  assert.equal(visible(), '5');
});

test('progress accessibility follows the latest snapshot before visual interpolation finishes', async () => {
  await render(
    h(MotionProgress, {
      value: 2,
      max: 10,
      scope: 'run',
      label: '검증',
      valueText: '2 / 10개',
    }),
  );
  await render(
    h(MotionProgress, {
      value: 8,
      max: 10,
      scope: 'run',
      label: '검증',
      valueText: '8 / 10개',
    }),
  );
  const bar = host.querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '80');
  assert.equal(bar.getAttribute('aria-valuetext'), '8 / 10개');
  assert.equal(fillWidth(), 20);
  await frame(0);
  await frame(210);
  assert.ok(fillWidth() > 20 && fillWidth() < 80);
  assert.equal(bar.getAttribute('aria-valuenow'), '80');
  await frame(420);
  assert.equal(fillWidth(), 80);
});

test('a changed denominator resets its progress baseline even when the new percentage is higher', async () => {
  await render(
    h(MotionProgress, { value: 2, max: 10, scope: 'run', label: '검증' }),
  );
  await render(
    h(MotionProgress, { value: 8, max: 10, scope: 'run', label: '검증' }),
  );
  await frame(0);
  await render(
    h(MotionProgress, { value: 9, max: 12, scope: 'run', label: '검증' }),
  );
  assert.equal(fillWidth(), 75);
  assert.equal(
    host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    '75',
  );
  assert.equal(raf.size, 0);
});

test('progress bounds are clamped and unknown values never announce fabricated percentages', async () => {
  for (const [value, max, expected] of [
    [-5, 100, 0],
    [150, 100, 100],
    [0, 100, 0],
  ]) {
    await render(
      h(MotionProgress, { value, max, scope: `${value}`, label: '검증' }),
    );
    assert.equal(
      host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
      String(expected),
    );
    assert.equal(fillWidth(), expected);
  }
  for (const [value, max] of [
    [null, 100],
    [undefined, 100],
    [Number.NaN, 100],
    [10, 0],
    [10, -1],
    [10, Number.NaN],
    [10, Number.POSITIVE_INFINITY],
  ]) {
    await render(
      h(MotionProgress, { value, max, scope: 'unknown', label: '검증' }),
    );
    assert.equal(
      host.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'),
      false,
    );
    assert.ok(host.querySelector('.zoj-motion-indeterminate'));
    assert.equal(raf.size, 0);
  }
});

test('reduced motion starts with confirmed values and schedules no frames', async () => {
  reduced = true;
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 70, scope: 'run' }));
  assert.equal(visible(), '70');
  assert.equal(raf.size, 0);
});

test('enabling reduced motion during a transition cancels it and immediately reveals the confirmed value', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 90, scope: 'run' }));
  await frame(0);
  await frame(100);
  assert.ok(visualNumber() < 90);
  const oldFrame = [...raf.keys()][0];
  await setReduced(true);
  assert.equal(visible(), '90');
  assert.equal(raf.size, 0);
  assert.ok(cancellations.includes(oldFrame));
  await setReduced(false);
  await render(h(MotionNumber, { value: 100, scope: 'run' }));
  assert.equal(visible(), '90');
  await frame(500);
  await frame(920);
  assert.equal(visible(), '100');
});

test('hidden documents snap, cancel active frames and resume without replaying obsolete progress', async () => {
  hidden = true;
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 50, scope: 'run' }));
  assert.equal(visible(), '50');
  assert.equal(raf.size, 0);
  await setHidden(false);
  assert.equal(raf.size, 0);
  await render(h(MotionNumber, { value: 80, scope: 'run' }));
  await frame(0);
  await frame(100);
  assert.ok(visualNumber() < 80);
  await setHidden(true);
  assert.equal(visible(), '80');
  assert.equal(raf.size, 0);
});

test('environments without requestAnimationFrame fall back to confirmed values without throwing', async () => {
  window.requestAnimationFrame = undefined;
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 37, scope: 'run' }));
  assert.equal(visible(), '37');
  assert.equal(raf.size, 0);
});

test('zero and negative animation durations update immediately', async () => {
  for (const duration of [0, -20]) {
    await render(
      h(HookProbe, { value: 0, duration, scope: `duration:${duration}` }),
    );
    await render(
      h(HookProbe, { value: 50, duration, scope: `duration:${duration}` }),
    );
    assert.equal(host.querySelector('output').dataset.probe, '50');
    assert.equal(raf.size, 0);
  }
});

test('unmount cancels active frames and removes preference subscriptions', async () => {
  await render(h(MotionNumber, { value: 0, scope: 'run' }));
  await render(h(MotionNumber, { value: 70, scope: 'run' }));
  const frameId = [...raf.keys()][0];
  assert.equal(mediaListeners.size, 1);
  await act(async () => root.unmount());
  root = null;
  assert.equal(raf.size, 0);
  assert.ok(cancellations.includes(frameId));
  assert.equal(mediaListeners.size, 0);
  await frame(1000);
  assert.equal(host.childElementCount, 0);
});

test('progress text preserves exact accessible counts, decimals and reset scopes', async () => {
  await render(
    h(MotionProgressText, {
      text: '판정 확인 1 / 15개 · 6.67%',
      scope: 'run:15',
    }),
  );
  assert.equal(host.textContent, '판정 확인 1 / 15개 · 6.67%');
  await render(
    h(MotionProgressText, {
      text: '판정 확인 4 / 15개 · 26.67%',
      scope: 'run:15',
    }),
  );
  assert.equal(host.textContent, '판정 확인 4 / 15개 · 26.67%');
  assert.deepEqual(
    [...host.querySelectorAll('[data-motion-value]')].map(
      (node) => node.dataset.motionValue,
    ),
    ['1', '15', '6.67'],
  );
  await frame(0);
  await frame(420);
  assert.deepEqual(
    [...host.querySelectorAll('[data-motion-value]')].map(
      (node) => node.dataset.motionValue,
    ),
    ['4', '15', '26.67'],
  );
  await render(
    h(MotionProgressText, {
      text: '판정 확인 1 / 20개 · 5.00%',
      scope: 'run:20',
    }),
  );
  assert.deepEqual(
    [...host.querySelectorAll('[data-motion-value]')].map(
      (node) => node.dataset.motionValue,
    ),
    ['1', '20', '5.00'],
  );
  assert.equal(raf.size, 0);
});

test('result transitions retain an unchanged status node during numeric updates and leave sibling details open', async () => {
  function Result({ status, progress }) {
    return h(
      'section',
      null,
      h(ResultTransition, { as: 'span', stateKey: status }, status),
      h(MotionNumber, { value: progress, scope: 'run' }),
      h(
        'details',
        null,
        h('summary', null, '판정 메시지'),
        h('pre', null, '실행 로그'),
      ),
    );
  }
  await render(h(Result, { status: 'judging', progress: 0 }));
  const statusNode = host.querySelector('.zoj-result-enter');
  const details = host.querySelector('details');
  details.open = true;
  await render(h(Result, { status: 'judging', progress: 40 }));
  assert.equal(host.querySelector('.zoj-result-enter'), statusNode);
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, true);
  await frame(0);
  await frame(420);
  await render(h(Result, { status: 'accepted', progress: 100 }));
  assert.notEqual(host.querySelector('.zoj-result-enter'), statusNode);
  assert.equal(host.querySelector('.zoj-result-enter').textContent, 'accepted');
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, true);
});

test('real subtask details remain open through score interpolation and final result changes', async () => {
  const submission = {
    submission_id: 'submission',
    scoring_mode: 'ioi',
    status: 'wrong_answer',
    score: 10,
    max_score: 100,
    subtask_results: [
      {
        subtask_id: 'one',
        name: '기초',
        status: 'wrong_answer',
        score: 10,
        max_score: 100,
      },
    ],
  };
  await render(h(ScoreDetails, { submission }));
  const details = host.querySelector('details');
  details.open = true;
  await render(
    h(ScoreDetails, {
      submission: {
        ...submission,
        score: 50,
        subtask_results: [{ ...submission.subtask_results[0], score: 50 }],
      },
    }),
  );
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, true);
  await frame(0);
  await frame(420);
  await render(
    h(ScoreDetails, {
      submission: {
        ...submission,
        status: 'accepted',
        score: 100,
        subtask_results: [
          { ...submission.subtask_results[0], status: 'accepted', score: 100 },
        ],
      },
    }),
  );
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, true);
  assert.match(details.textContent, /맞았습니다/);
});
