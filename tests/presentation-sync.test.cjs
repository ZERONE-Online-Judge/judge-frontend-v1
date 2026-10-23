const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://zoj.kr',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const native = m.require.bind(m);
  m.require = (id) =>
    id === '@/shared/api/client' ? { API_BASE_URL: '/api' } : native(id);
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const { queuedPresentationRefresh } = source(
  'domains/submissionScoreboard/presentationRefresh.ts',
);
const { subscribeScoreboardUpdates, notifyScoreboardUpdate } = source(
  'domains/submissionScoreboard/presentationSync.ts',
);
const { presentationUrl, presentationApiQuery, storedPresentationDivisions } =
  source('domains/submissionScoreboard/presentationOptions.ts');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
after(() => dom.window.close());
test('rapid updates keep an active read and queue one latest read rather than cancelling it', async () => {
  const pending = [];
  let calls = 0;
  const refresh = queuedPresentationRefresh(
    () => {
      calls++;
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
    () => false,
  );
  try {
    for (let i = 0; i < 20; i++) refresh.request();
    await pause(25);
    assert.equal(calls, 1);
    for (let i = 0; i < 20; i++) refresh.request();
    assert.equal(calls, 1);
    pending[0].resolve();
    await pause(0);
    assert.equal(calls, 2);
    pending[1].resolve();
    await pause(25);
    assert.equal(calls, 2);
  } finally {
    refresh.stop();
    pending.forEach((d) => d.resolve());
  }
});
test('joining an older polling request schedules a fresh snapshot after it settles', async () => {
  const old = deferred();
  let fetching = true,
    calls = 0;
  const refresh = queuedPresentationRefresh(
    async () => {
      calls++;
      if (calls === 1) {
        await old.promise;
        fetching = false;
      }
    },
    () => fetching,
  );
  refresh.request();
  await pause(25);
  assert.equal(calls, 1);
  old.resolve();
  await pause(0);
  assert.equal(calls, 2);
  refresh.stop();
});
test('unmount prevents queued or follow-up reads and a failed read does not disable later updates', async () => {
  let calls = 0;
  const refresh = queuedPresentationRefresh(
    async () => {
      calls++;
      throw Error('offline');
    },
    () => false,
  );
  refresh.request();
  await pause(25);
  refresh.request();
  await pause(25);
  assert.equal(calls, 2);
  refresh.request();
  refresh.stop();
  await pause(25);
  assert.equal(calls, 2);
});
test('presentation URLs preserve multiple ids and obsolete preferences never select unknown divisions', () => {
  assert.deepEqual(
    new URL(
      presentationUrl('contest', ['b', 'a', 'a']),
      'https://zoj.kr',
    ).searchParams.getAll('divisionId'),
    ['b', 'a'],
  );
  assert.equal(
    presentationApiQuery(['a', 'b']),
    '?division_id=a&division_id=b',
  );
  assert.deepEqual(
    storedPresentationDivisions('["missing","b"]', ['a', 'b'], 'a'),
    ['b'],
  );
  assert.deepEqual(storedPresentationDivisions('invalid', ['a', 'b'], 'a'), [
    'a',
  ]);
});
function fakeBroadcast() {
  const all = [];
  class Channel {
    constructor(name) {
      this.name = name;
      this.closed = false;
      all.push(this);
    }
    postMessage(data) {
      for (const channel of all)
        if (channel !== this && !channel.closed && channel.name === this.name)
          channel.onmessage?.({ data });
    }
    close() {
      this.closed = true;
    }
  }
  window.BroadcastChannel = Channel;
  return all;
}
test('same-browser signals work without localStorage and ignore other contests', () => {
  const all = fakeBroadcast();
  const original = dom.window.Storage.prototype.setItem;
  let updates = 0;
  dom.window.Storage.prototype.setItem = () => {
    throw Error('blocked');
  };
  const stop = subscribeScoreboardUpdates('contest', () => updates++);
  try {
    notifyScoreboardUpdate('other');
    assert.equal(updates, 0);
    notifyScoreboardUpdate('contest');
    assert.equal(updates, 2);
  } finally {
    stop();
    dom.window.Storage.prototype.setItem = original;
    delete window.BroadcastChannel;
  }
  assert.ok(all.every((channel) => channel.closed));
});
function streamFixture(status = 200) {
  const attempts = [];
  window.fetch = async (url, init) => {
    let control;
    const stream = new ReadableStream({
      start(c) {
        control = c;
      },
    });
    init.signal.addEventListener('abort', () => {
      try {
        control.error(new Error('aborted'));
      } catch {}
    });
    attempts.push({ url, init, control });
    return new Response(status === 200 ? stream : null, { status });
  };
  return attempts;
}
test('authenticated SSE handles split frames, keepalives and reconnects without credentials in URLs', async () => {
  const attempts = streamFixture();
  const states = [];
  let updates = 0;
  const stop = subscribeScoreboardUpdates('contest', () => updates++, {
    token: 'private-token',
    displayOnly: true,
    onConnectionChange: (v) => states.push(v),
  });
  try {
    await pause(0);
    assert.match(
      attempts[0].url,
      /^\/api\/presentation\/contests\/contest\/scoreboard\/events$/,
    );
    assert.equal(
      attempts[0].init.headers.authorization,
      'Bearer private-token',
    );
    const encode = new TextEncoder();
    attempts[0].control.enqueue(encode.encode('event: score'));
    await pause(0);
    assert.equal(updates, 0);
    attempts[0].control.enqueue(
      encode.encode('board_update\r\ndata: {}\r\n\r\n: keepalive\n\n'),
    );
    await pause(0);
    assert.equal(updates, 1);
    assert.deepEqual(states, [true]);
    window.dispatchEvent(new window.Event('online'));
    await pause(0);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].init.signal.aborted, true);
    attempts[1].control.enqueue(
      encode.encode('event: scoreboard_update\ndata: {}\n\n'),
    );
    await pause(0);
    assert.equal(updates, 3);
  } finally {
    stop();
    delete window.fetch;
  }
  assert.equal(attempts.at(-1).init.signal.aborted, true);
});
test('authorization errors request an authorized reload without exposing a display token to operator APIs', async () => {
  const attempts = streamFixture(401);
  const states = [];
  let updates = 0;
  const stop = subscribeScoreboardUpdates('contest', () => updates++, {
    token: 'display-token',
    displayOnly: true,
    onConnectionChange: (v) => states.push(v),
  });
  try {
    await pause(0);
    assert.equal(updates, 1);
    assert.deepEqual(states, [false]);
    assert.ok(attempts[0].url.startsWith('/api/presentation/'));
  } finally {
    stop();
    delete window.fetch;
  }
});
test('server reauthentication stops the stream and falls back to polling', async () => {
  const attempts = streamFixture();
  const states = [];
  let updates = 0;
  const stop = subscribeScoreboardUpdates('contest', () => updates++, {
    token: 'operator-token',
    displayOnly: false,
    onConnectionChange: (v) => states.push(v),
  });
  try {
    await pause(0);
    assert.ok(attempts[0].url.startsWith('/api/operator/'));
    attempts[0].control.enqueue(
      new TextEncoder().encode('event: reauthenticate\ndata: {}\n\n'),
    );
    await pause(0);
    assert.equal(updates, 1);
    assert.deepEqual(states, [true, false]);
  } finally {
    stop();
    delete window.fetch;
  }
});
