const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..');
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function build(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zoj-version-build-'));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<html><head><title>ZOJ</title></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
  );
  fs.writeFileSync(
    path.join(root, 'main.js'),
    'document.body.dataset.version = import.meta.env.VITE_FRONTEND_VERSION;',
  );
  const env = { ...process.env };
  delete env.ZOJ_FRONTEND_VERSION;
  if (version !== undefined) env.ZOJ_FRONTEND_VERSION = version;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { build } from 'vite'; await build(${JSON.stringify({
        configFile: path.join(repository, 'vite.config.ts'),
        root,
        logLevel: 'silent',
        build: { outDir: 'dist', emptyOutDir: true },
      })});`,
    ],
    { cwd: repository, env, encoding: 'utf8', timeout: 20000 },
  );
  return { root, result };
}

function output(root) {
  const dist = path.join(root, 'dist');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dist, 'version.json'), 'utf8'),
  );
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const entry = fs.readFileSync(path.join(dist, manifest.entry), 'utf8');
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(Number.isFinite(Date.parse(manifest.builtAt)));
  assert.match(manifest.entry, /^\/assets\/index-[\w-]+\.js$/);
  assert.ok(
    html.includes(
      `<meta name="zoj-frontend-version" content="${manifest.version}">`,
    ),
  );
  assert.ok(html.includes(`src="${manifest.entry}"`));
  assert.ok(entry.includes(manifest.version));
  assert.equal(entry.includes('import.meta.env.VITE_FRONTEND_VERSION'), false);
  return { manifest, entry };
}

test('real Vite builds embed the Git version and keep entry identifiers deterministic across rebuilds', () => {
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).stdout.trim();
  assert.match(commit, /^[a-f0-9]{40,64}$/);
  const first = build();
  assert.equal(first.result.status, 0, first.result.stderr);
  const firstOutput = output(first.root);
  const second = build();
  assert.equal(second.result.status, 0, second.result.stderr);
  const secondOutput = output(second.root);
  assert.equal(firstOutput.manifest.version, commit);
  assert.equal(firstOutput.manifest.revision, commit);
  assert.equal(secondOutput.manifest.version, commit);
  assert.equal(secondOutput.manifest.revision, commit);
  assert.equal(firstOutput.manifest.entry, secondOutput.manifest.entry);
  assert.equal(firstOutput.entry, secondOutput.entry);
});

test('an explicit release ID overrides version without losing the source revision', () => {
  const { root, result } = build('configuration-release-2');
  assert.equal(result.status, 0, result.stderr);
  const { manifest } = output(root);
  assert.equal(manifest.version, 'configuration-release-2');
  assert.match(manifest.revision, /^[a-f0-9]{40,64}$/);
});

test('invalid release identifiers fail before a version manifest is emitted', () => {
  const { root, result } = build('bad version <script>');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /valid release identifier/);
  assert.equal(fs.existsSync(path.join(root, 'dist/version.json')), false);
});

test('development serves no production version constant', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { loadConfigFromFile } from 'vite';
const result = await loadConfigFromFile({ command: 'serve', mode: 'development' }, ${JSON.stringify(path.join(repository, 'vite.config.ts'))});
process.stdout.write(JSON.stringify(result.config.define));`,
    ],
    { cwd: repository, encoding: 'utf8', timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout)['import.meta.env.VITE_FRONTEND_VERSION'],
    '""',
  );
});
