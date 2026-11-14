const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://judge.test/',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const {
  QueryClient,
  QueryClientProvider,
  useQuery,
} = require('@tanstack/react-query');
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.startsWith('@/') || id.startsWith('./')) {
      const base = id.startsWith('@/')
        ? path.resolve(__dirname, '../src', id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const file = ['.ts', '.tsx'].map((ext) => base + ext).find(fs.existsSync);
      if (file)
        return source(path.relative(path.resolve(__dirname, '../src'), file));
    }
    return native(id);
  };
  cache.set(filename, loaded);
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
const { useSubmissionLiveUpdates } = source(
  'domains/submissionScoreboard/useSubmissionLiveUpdates.ts',
);
const { mergeSubmissionUpdates, needsSubmissionLiveUpdate } = source(
  'domains/submissionScoreboard/liveSubmissions.ts',
);
const { ApiClientError } = source('shared/api/errors.ts');
const Result = source(
  'components/operator/OperatorSubmissionResult.tsx',
).default;
const row = (id, status = 'judging') => ({
  submission_id: id,
  problem_id: 'p',
  status,
  submitted_at: '2026-11-14T00:00:00Z',
  language: 'cpp17',
  team_name: id,
  progress_current: 0,
  progress_total: 10,
});
let host,
  root,
  client,
  calls,
  last,
  visible,
  scope,
  listVersion,
  base,
  listCalls;
const wait = (ids, signal) =>
  new Promise((resolve, reject) => {
    const call = { ids, signal, resolve, reject };
    calls.push(call);
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
const flush = (milliseconds = 20) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
function Harness() {
  const list = useQuery({
    queryKey: ['list', scope],
    queryFn: async () => {
      listCalls++;
      return base;
    },
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 20_000,
  });
  last = useSubmissionLiveUpdates({
    submissions: list.data ?? [],
    listUpdatedAt: list.dataUpdatedAt + listVersion,
    scope,
    enabled: visible,
    waitForUpdates: wait,
  });
  return h(
    'div',
    null,
    last.map((item) =>
      h(
        'span',
        { key: item.submission_id },
        `${item.submission_id}:${item.status}:${item.progress_current};`,
      ),
    ),
  );
}
async function render() {
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(Harness)));
  });
  await flush();
}
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  calls = [];
  last = [];
  visible = true;
  scope = 'operator:contest:session:filter';
  listVersion = 0;
  base = [row('a'), row('b')];
  listCalls = 0;
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
after(() => dom.window.close());

test('an entry refetch bypasses fresh cached list data', async () => {
  client.setQueryData(['list', scope], [row('old', 'accepted')]);
  await render();
  assert.equal(listCalls, 1);
  assert.deepEqual(
    last.map((item) => item.submission_id),
    ['a', 'b'],
  );
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  assert.equal(listCalls, 2);
});

test('one batched wait updates progress and results without refetching the list', async () => {
  await render();
  const updatedAt = client.getQueryState(['list', scope]).dataUpdatedAt;
  assert.deepEqual(calls[0].ids, ['a', 'b']);
  calls[0].resolve([
    { ...row('a'), progress_current: 4 },
    { ...row('b'), progress_phase: 'tle_confirmation' },
  ]);
  await flush(140);
  assert.equal(last[0].progress_current, 4);
  assert.equal(last[1].progress_phase, 'tle_confirmation');
  assert.equal(listCalls, 1);
  assert.equal(client.getQueryState(['list', scope]).dataUpdatedAt, updatedAt);
  assert.deepEqual(calls[1].ids, ['a', 'b']);
  calls[1].resolve([
    { ...row('a', 'accepted'), score: 100 },
    { ...row('b'), progress_current: 8 },
  ]);
  await flush(140);
  assert.equal(last[0].status, 'accepted');
  assert.deepEqual(calls[2].ids, ['b']);
  calls[2].resolve([row('b', 'wrong_answer')]);
  await flush(160);
  assert.equal(calls.length, 3);
  assert.equal(last[0].status, 'accepted');
  assert.equal(last[1].status, 'wrong_answer');
  assert.equal(listCalls, 1);
});

test('hidden pages abort in-flight waits and resume immediately on return', async () => {
  await render();
  visible = false;
  await render();
  assert.equal(calls[0].signal.aborted, true);
  await flush(140);
  assert.equal(calls.length, 1);
  visible = true;
  await render();
  assert.equal(calls.length, 2);
});

test('filter or session changes abort old waits and never overlay old records', async () => {
  await render();
  const old = calls[0];
  scope = 'participant:other-contest:other-session';
  base = [row('c')];
  await render();
  assert.equal(old.signal.aborted, true);
  old.resolve([row('a', 'accepted')]);
  await flush();
  assert.deepEqual(
    last.map((item) => item.submission_id),
    ['c'],
  );
  assert.deepEqual(calls.at(-1).ids, ['c']);
});

test('a full list refresh rebases live results instead of overwriting a newer terminal result', async () => {
  await render();
  calls[0].resolve([{ ...row('a'), progress_current: 4 }, row('b')]);
  await flush(140);
  listVersion++;
  await act(async () => {
    client.setQueryData(
      ['list', scope],
      [row('a', 'accepted'), row('b', 'accepted')],
    );
  });
  await flush();
  assert(last.every((item) => item.status === 'accepted'));
  assert.equal(calls[1].signal.aborted, true);
});

test('rejudging watches the candidate without replacing the published verdict or score', async () => {
  base = [
    {
      ...row('a', 'wrong_answer'),
      score: 25,
      max_score: 100,
      rejudging_progress: {
        rejudging_id: 'r',
        status: 'judging',
        progress_current: 0,
        progress_total: 10,
      },
    },
  ];
  await render();
  calls[0].resolve([
    {
      ...base[0],
      rejudging_progress: {
        ...base[0].rejudging_progress,
        progress_current: 6,
      },
    },
  ]);
  await flush(140);
  assert.equal(last[0].status, 'wrong_answer');
  assert.equal(last[0].score, 25);
  assert.equal(last[0].rejudging_progress.progress_current, 6);
  assert(needsSubmissionLiveUpdate(last[0]));
  calls[1].resolve([
    {
      ...base[0],
      rejudging_progress: { ...base[0].rejudging_progress, status: 'accepted' },
    },
  ]);
  await flush(150);
  assert(!needsSubmissionLiveUpdate(last[0]));
  assert.equal(calls.length, 2);
});

test('authorization failure stops live requests instead of rapidly retrying', async () => {
  await render();
  calls[0].reject(new ApiClientError(403, 'permission_denied', 'Forbidden'));
  await flush(160);
  assert.equal(calls.length, 1);
});

test('row updates preserve membership, ordering, source and unrelated metadata', () => {
  const rows = [
    { ...row('a'), source_code: 'private', team_name: 'Team A' },
    row('b', 'accepted'),
  ];
  const updated = mergeSubmissionUpdates(rows, [
    { submission_id: 'a', status: 'accepted', source_code: null },
    row('outside'),
  ]);
  assert.deepEqual(
    updated.map((item) => item.submission_id),
    ['a', 'b'],
  );
  assert.equal(updated[0].source_code, 'private');
  assert.equal(updated[0].team_name, 'Team A');
  assert.equal(updated[1], rows[1]);
});

test('the result cell displays candidate progress and keeps the original result explicit', async () => {
  await act(async () =>
    root.render(
      h(Result, {
        submission: {
          ...row('a', 'wrong_answer'),
          rejudging_progress: {
            rejudging_id: 'r',
            status: 'judging',
            progress_current: 4,
            progress_total: 10,
            progress_phase: 'tle_confirmation',
          },
        },
      }),
    ),
  );
  assert.match(host.textContent, /재채점 중/);
  assert.match(host.textContent, /시간 초과 재확인 중/);
  assert.match(host.textContent, /4\/10/);
  assert.match(host.textContent, /기존 결과 · 틀렸습니다/);
});

test('applied rejudging has one short marker rather than repeating history in the row', async () => {
  await act(async () =>
    root.render(
      h(Result, { submission: { ...row('a', 'accepted'), rejudged: true } }),
    ),
  );
  assert.match(host.textContent, /재채점됨/);
  assert.doesNotMatch(host.textContent, /반영 대기|요청자|재채점 중/);
});

test('blocked candidates cannot be labelled as waiting for application', async () => {
  for (const candidate of [
    { status: 'system_error', batch_status: 'blocked' },
    { status: 'accepted', batch_status: 'blocked' },
  ]) {
    await act(async () =>
      root.render(
        h(Result, {
          submission: {
            ...row('a', 'wrong_answer'),
            rejudging_progress: { rejudging_id: 'r', ...candidate },
          },
        }),
      ),
    );
    assert.match(host.textContent, /재채점 오류/);
    assert.doesNotMatch(host.textContent, /반영 대기/);
  }
});
