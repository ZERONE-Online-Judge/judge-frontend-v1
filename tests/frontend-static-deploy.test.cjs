const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  fs.writeFileSync(path.join(root, 'dist/index.html'), 'old entry');
  fs.writeFileSync(path.join(root, 'dist/assets/old.js'), 'old lazy chunk');
  const before = fs.statSync(path.join(root, 'dist')).ino;
  fs.writeFileSync(
    path.join(root, 'bin/npm'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$FAKE_FAILURE" == build ]]; then exit 17; fi
while [[ "$1" != --outDir ]]; do shift; done
output=$2
mkdir -p "$output/assets"
printf 'new entry' > "$output/index.html"
printf 'new lazy chunk' > "$output/assets/new.js"
printf 'public file' > "$output/robots.txt"
`,
    { mode: 0o755 },
  );
  if (failure === 'copy')
    fs.writeFileSync(path.join(root, 'bin/rsync'), '#!/bin/sh\nexit 18\n', {
      mode: 0o755,
    });
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
      .some((name) => name.startsWith('.index.')),
    false,
  );
  return { root, result };
}

test('static deployment preserves the bind mount and old chunks, publishing the new entry last', () => {
  const { root, result } = deploy();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'),
    'new entry',
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
});

for (const stage of ['build', 'copy'])
  test(`a ${stage} failure keeps the existing entry and old chunks available`, () => {
    const { root, result } = deploy(stage);
    assert.notEqual(result.status, 0);
    assert.equal(
      fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'),
      'old entry',
    );
  });
