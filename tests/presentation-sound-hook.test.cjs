const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr/presentation',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const filename = path.resolve(
  __dirname,
  '../src/domains/submissionScoreboard/presentationSound.ts',
);
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const { usePresentationSound } = mod.exports;
let state, root, host, contexts;
// Deliver an explicit trusted-event shape to the registered native listener.
// Real browser gesture/autoplay behavior is verified separately in Chrome.
const listeners = new Map();
const add = document.addEventListener.bind(document),
  remove = document.removeEventListener.bind(document);
document.addEventListener = (type, fn, options) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return add(type, fn, options);
};
document.removeEventListener = (type, fn, options) => {
  listeners.get(type)?.delete(fn);
  return remove(type, fn, options);
};
async function gesture(type = 'pointerdown') {
  await act(async () => {
    for (const fn of [...(listeners.get(type) ?? [])])
      fn({ type, isTrusted: true });
  });
}
async function visibility(value) {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value,
    });
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
}
function player() {
  const value = {
    state: 'suspended',
    currentTime: 100,
    destination: {},
    starts: [],
    stops: [],
    resumes: 0,
    async resume() {
      this.resumes++;
      this.state = 'running';
      this.onstatechange?.();
    },
    async close() {
      this.state = 'closed';
    },
    createOscillator() {
      return {
        frequency: { setValueAtTime() {} },
        connect() {},
        disconnect() {},
        start(at) {
          value.starts.push(at);
        },
        stop(at) {
          value.stops.push(at);
        },
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          cancelScheduledValues() {},
        },
        connect() {},
        disconnect() {},
      };
    },
  };
  return value;
}
async function mount() {
  await act(() =>
    root.render(
      h(
        React.StrictMode,
        null,
        h(function Harness() {
          state = usePresentationSound();
          return null;
        }),
      ),
    ),
  );
}
beforeEach(() => {
  contexts = [];
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  window.localStorage.clear();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  window.AudioContext = class {
    constructor() {
      const next = player();
      contexts.push(next);
      return next;
    }
  };
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = null;
  delete window.AudioContext;
});
after(() => dom.window.close());

test('saved enabled is not playable until a trusted gesture; running gestures do not spam resume', async () => {
  await mount();
  assert.equal(state.enabled, true);
  assert.equal(state.unlocked, false);
  await visibility('hidden');
  await visibility('visible');
  assert.equal(
    contexts.length,
    0,
    'Visibility alone cannot initially unlock audio',
  );
  document.dispatchEvent(new window.Event('pointerdown'));
  assert.equal(contexts.length, 0, 'Synthetic DOM events cannot unlock audio');
  await gesture();
  assert.equal(state.unlocked, true);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].resumes, 1);
  await gesture('keydown');
  await gesture('touchend');
  assert.equal(contexts[0].resumes, 1);
  assert.deepEqual(
    contexts[0].starts,
    [],
    'Unlocking never replays consumed cues',
  );
  assert.equal(state.play('tick'), true);
  assert.equal(contexts[0].starts.length, 1);
});

test('missed interrupted state events are detected by play and the next trusted gesture recovers silently', async () => {
  await mount();
  await gesture();
  const audio = contexts[0];
  assert.equal(state.play('warning'), true);
  const starts = audio.starts.length;
  audio.state = 'interrupted'; // Safari can expose this before statechange fires.
  await act(() => assert.equal(state.play('end'), false));
  assert.equal(state.enabled, true);
  assert.equal(state.unlocked, false);
  assert.equal(audio.resumes, 1);
  assert(
    audio.stops.length > starts,
    'All future voices are dropped while interrupted',
  );
  await gesture('touchend');
  assert.equal(state.unlocked, true);
  assert.equal(audio.resumes, 2);
  assert.equal(audio.starts.length, starts);
  assert.equal(state.play('accepted'), true);
  assert.equal(audio.starts.length, starts + 3);
});

test('listeners stay active while ready and detect a missing statechange on the next gesture', async () => {
  await mount();
  await gesture();
  const audio = contexts[0];
  audio.state = 'suspended';
  assert.equal(state.unlocked, true, 'No state event has arrived yet');
  await gesture('keydown');
  assert.equal(audio.resumes, 2);
  assert.equal(state.unlocked, true);
  assert.equal(audio.starts.length, 0);
});

test('visibility restores only a previously activated output once per return, with no hidden or stale playback', async () => {
  await mount();
  await gesture();
  const audio = contexts[0];
  state.play('celebration');
  const starts = audio.starts.length;
  await visibility('hidden');
  audio.state = 'suspended';
  await act(() => assert.equal(state.play('warning'), false));
  await gesture();
  assert.equal(audio.resumes, 1, 'Hidden gestures cannot resume output');
  await visibility('visible');
  assert.equal(audio.resumes, 2);
  assert.equal(state.unlocked, true);
  assert.equal(audio.starts.length, starts);
  await visibility('visible');
  assert.equal(audio.resumes, 2);
  await act(() => state.disable());
  await visibility('hidden');
  await visibility('visible');
  await gesture();
  assert.equal(audio.resumes, 2);
  assert.equal(contexts.length, 1);
  assert.equal(state.enabled, false);
});

test('a failed visibility recovery waits for a genuine new gesture without timer retries or cue backlog', async () => {
  await mount();
  await gesture();
  const audio = contexts[0];
  await visibility('hidden');
  audio.state = 'interrupted';
  audio.resume = async function () {
    this.resumes++;
    throw new Error('gesture required');
  };
  await visibility('visible');
  assert.equal(audio.resumes, 2);
  assert.equal(state.unlocked, false);
  for (let i = 0; i < 4; i++)
    await act(() => assert.equal(state.play('result'), false));
  await visibility('visible');
  assert.equal(audio.resumes, 2);
  audio.resume = async function () {
    this.resumes++;
    this.state = 'running';
    this.onstatechange?.();
  };
  await gesture();
  assert.equal(audio.resumes, 3);
  assert.equal(state.unlocked, true);
  assert.equal(audio.starts.length, 0);
});

test('a pending blocked automatic resume does not swallow the next explicit gesture', async () => {
  await mount();
  await gesture();
  const audio = contexts[0];
  await visibility('hidden');
  audio.state = 'interrupted';
  let resolveOld;
  audio.resume = function () {
    this.resumes++;
    return new Promise((resolve) => {
      resolveOld = resolve;
    });
  };
  await visibility('visible');
  assert.equal(audio.resumes, 2);
  assert.equal(state.unlocked, false);
  audio.resume = async function () {
    this.resumes++;
    this.state = 'running';
    this.onstatechange?.();
  };
  await gesture();
  assert.equal(audio.resumes, 3);
  assert.equal(state.unlocked, true);
  await act(async () => resolveOld());
  assert.equal(state.unlocked, true);
  assert.equal(audio.starts.length, 0);
});

test('late recovery failures cannot mark a replacement running player locked or undo a mute', async () => {
  await mount();
  let rejectOld;
  await act(() => {
    const audioEnable = state.enable();
    void audioEnable;
  });
  const first = contexts[0];
  first.state = 'suspended';
  first.resume = () =>
    new Promise((resolve, reject) => {
      rejectOld = reject;
    });
  let pending;
  await act(() => {
    pending = state.enable();
  });
  await act(() => state.disable());
  await act(async () => assert.equal(await state.enable(), true));
  assert.equal(contexts.length, 2);
  assert.equal(state.unlocked, true);
  await act(async () => {
    rejectOld(new Error('old failed'));
    assert.equal(await pending, false);
  });
  assert.equal(state.unlocked, true);
  assert.equal(state.enabled, true);
  assert.equal(contexts[1].starts.length, 0);
  await act(() => state.disable());
  assert.equal(state.enabled, false);
  assert.equal(state.unlocked, false);
});

test('an explicit in-flight enable cannot resurrect audio after disable or unmount', async () => {
  await mount();
  let resolve;
  window.AudioContext = class {
    constructor() {
      const next = player();
      next.resume = () =>
        new Promise((done) => {
          resolve = () => {
            next.state = 'running';
            done();
          };
        });
      contexts.push(next);
      return next;
    }
  };
  let pending;
  await act(() => {
    pending = state.enable();
  });
  await act(() => state.disable());
  await act(async () => {
    resolve();
    assert.equal(await pending, false);
  });
  assert.equal(state.enabled, false);
  assert.equal(state.unlocked, false);
  assert.equal(contexts.length, 1);
  await act(() => {
    pending = state.enable();
  });
  await act(() => root.unmount());
  root = null;
  await act(async () => {
    resolve();
    assert.equal(await pending, false);
  });
  assert.equal(contexts.length, 2);
  assert(contexts.every((audio) => audio.starts.length === 0));
});

test('test reports actual mute/failure and cue errors do not leave a ready label or schedule later audio', async () => {
  await mount();
  await act(() => state.setVolume(0));
  await act(async () => assert.equal(await state.test(), false));
  assert.equal(state.unlocked, true);
  assert.equal(contexts[0].starts.length, 0);
  await act(() => state.setVolume(0.75));
  const audio = contexts[0];
  audio.createOscillator = () => {
    throw new Error('output unavailable');
  };
  await act(() => assert.equal(state.play('tick'), false));
  assert.equal(state.unlocked, false);
});

test('failure to recreate a silently closed output clears its old ready state', async () => {
  await mount();
  await gesture();
  contexts[0].state = 'closed';
  window.AudioContext = class {
    constructor() {
      throw new Error('output disconnected');
    }
  };
  await act(async () => assert.equal(await state.enable(), false));
  assert.equal(state.enabled, true);
  assert.equal(state.unlocked, false);
});
