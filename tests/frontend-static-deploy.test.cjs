const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

const oldHtml =
  '<html><head><meta name="zoj-frontend-version" content="old-release"><script type="module" src="/assets/old.js"></script></head><body>old entry</body></html>';
const newHtml =
  '<html><head><meta name="zoj-frontend-version" content="new-release"><script type="module" src="/assets/new.js"></script></head><body>new entry</body></html>';
const oldVersion = {
  schemaVersion: 1,
  version: 'old-release',
  revision: 'a'.repeat(40),
  builtAt: '2026-11-16T00:00:00.000Z',
  entry: '/assets/old.js',
};
const newVersion = {
  ...oldVersion,
  version: 'new-release',
  revision: 'b'.repeat(40),
  entry: '/assets/new.js',
};
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function deploy(failure = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zoj-static-test-'));
  roots.push(root);
  for (const name of ['deploy', 'dist/assets', 'bin', 'tmp'])
    fs.mkdirSync(path.join(root, name), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '../deploy/deploy-static.sh'),
    path.join(root, 'deploy/deploy-static.sh'),
  );
  fs.writeFileSync(path.join(root, 'dist/index.html'), oldHtml);
  fs.writeFileSync(
    path.join(root, 'dist/version.json'),
    JSON.stringify(oldVersion),
  );
  fs.writeFileSync(path.join(root, 'dist/assets/old.js'), 'old lazy chunk');
  fs.utimesSync(path.join(root, 'dist/index.html'), 1000000000, 1000000000);
  const before = fs.statSync(path.join(root, 'dist')).ino;
  fs.writeFileSync(
    path.join(root, 'bin/npm'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$FAKE_FAILURE" == build ]]; then exit 17; fi
while [[ "$1" != --outDir ]]; do shift; done
output=$2
mkdir -p "$output/assets"
cat > "$output/index.html" <<'HTML'
${newHtml}
HTML
cat > "$output/version.json" <<'JSON'
${JSON.stringify(newVersion)}
JSON
printf 'new lazy chunk' > "$output/assets/new.js"
printf 'public file' > "$output/robots.txt"
touch -t 200001010000 "$output/index.html"
if [[ "$FAKE_FAILURE" == invalid ]]; then
  cat > "$output/version.json" <<'JSON'
${JSON.stringify({ ...newVersion, version: 'wrong-release' })}
JSON
fi
if [[ "$FAKE_FAILURE" == missing-manifest ]]; then rm "$output/version.json"; fi
if [[ "$FAKE_FAILURE" == missing-entry ]]; then rm "$output/assets/new.js"; fi
`,
    { mode: 0o755 },
  );
  if (failure === 'copy')
    fs.writeFileSync(path.join(root, 'bin/rsync'), '#!/bin/sh\nexit 18\n', {
      mode: 0o755,
    });
  const realMv = spawnSync('sh', ['-c', 'command -v mv'], {
    encoding: 'utf8',
  }).stdout.trim();
  fs.writeFileSync(
    path.join(root, 'bin/mv'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const destination = process.argv.at(-1);
const name = path.basename(destination);
const live = path.dirname(destination);
const snapshot = () => ({
  html: fs.readFileSync(path.join(live, 'index.html'), 'utf8').trim(),
  version: JSON.parse(fs.readFileSync(path.join(live, 'version.json'), 'utf8')).version,
  assetsReady: fs.existsSync(path.join(live, 'assets/new.js')),
});
if ((process.env.FAKE_FAILURE === 'entry-publish' && name === 'index.html') ||
    (process.env.FAKE_FAILURE === 'version-publish' && name === 'version.json')) process.exit(19);
const before = snapshot();
const result = spawnSync(${JSON.stringify(realMv)}, process.argv.slice(2), { encoding: 'utf8' });
if (result.status !== 0) process.exit(result.status || 1);
fs.appendFileSync(path.join(live, 'publication.jsonl'), JSON.stringify({ name, before, after: snapshot() }) + '\\n');
`,
    { mode: 0o755 },
  );
  const result = spawnSync('bash', ['deploy/deploy-static.sh'], {
    cwd: root,
    env: {
      ...process.env,
      PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH,
      TMPDIR: path.join(root, 'tmp'),
      FAKE_FAILURE: failure,
    },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(fs.statSync(path.join(root, 'dist')).ino, before);
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/assets/old.js'), 'utf8'),
    'old lazy chunk',
  );
  assert.deepEqual(fs.readdirSync(path.join(root, 'tmp')), []);
  assert.equal(
    fs
      .readdirSync(path.join(root, 'dist'))
      .some((name) => /^\.(index|version)\./.test(name)),
    false,
  );
  return { root, result };
}

test('static deployment preserves old chunks and publishes assets, entry then version', () => {
  const { root, result } = deploy();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').trim(),
    newHtml,
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/assets/new.js'), 'utf8'),
    'new lazy chunk',
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/robots.txt'), 'utf8'),
    'public file',
  );
  assert.equal(
    fs.statSync(path.join(root, 'dist/index.html')).mode & 0o777,
    0o644,
  );
  assert.equal(
    fs.statSync(path.join(root, 'dist/version.json')).mode & 0o777,
    0o644,
  );
  assert.ok(
    fs.statSync(path.join(root, 'dist/index.html')).mtimeMs > 1000000000 * 1000,
    'the backend template cache must observe the newly published HTML',
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'dist/version.json'), 'utf8')),
    newVersion,
  );
  const publications = fs
    .readFileSync(path.join(root, 'dist/publication.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(publications, [
    {
      name: 'index.html',
      before: { html: oldHtml, version: 'old-release', assetsReady: true },
      after: { html: newHtml, version: 'old-release', assetsReady: true },
    },
    {
      name: 'version.json',
      before: { html: newHtml, version: 'old-release', assetsReady: true },
      after: { html: newHtml, version: 'new-release', assetsReady: true },
    },
  ]);
});

for (const stage of [
  'build',
  'copy',
  'invalid',
  'missing-manifest',
  'missing-entry',
  'entry-publish',
])
  test(`failure at ${stage} keeps the existing entry and version available`, () => {
    const { root, result } = deploy(stage);
    assert.notEqual(result.status, 0);
    assert.equal(
      fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'),
      oldHtml,
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(root, 'dist/version.json'), 'utf8')),
      oldVersion,
    );
  });

test('failed version publication leaves the older manifest until the new entry is already available', () => {
  const { root, result } = deploy('version-publish');
  assert.notEqual(result.status, 0);
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').trim(),
    newHtml,
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'dist/version.json'), 'utf8')),
    oldVersion,
  );
});
