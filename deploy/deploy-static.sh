#!/usr/bin/env bash
# Keep the live bind-mounted directory and old browser chunks available.
set -euo pipefail
umask 022
repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository"
live="$repository/dist"
staging=$(mktemp -d "${TMPDIR:-/tmp}/zoj-frontend-build.XXXXXXXX")
entry=''
version=''
cleanup() {
  [[ -z "$entry" ]] || rm -f -- "$entry"
  [[ -z "$version" ]] || rm -f -- "$version"
  rm -rf -- "$staging"
}
trap cleanup EXIT
npm run build -- --outDir "$staging" --emptyOutDir
test -s "$staging/index.html"
test -d "$staging/assets"
node - "$staging" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const staging = process.argv[2];
const manifestPath = path.join(staging, 'version.json');
if (fs.statSync(manifestPath).size > 16384) throw new Error('Invalid frontend version manifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const html = fs.readFileSync(path.join(staging, 'index.html'), 'utf8');
function attribute(tag, name) {
  return tag.match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']', 'i'))?.[1];
}
const versions = [...html.matchAll(/<meta\b[^>]*>/gi)]
  .map(([tag]) => tag)
  .filter((tag) => attribute(tag, 'name') === 'zoj-frontend-version');
const entries = [...html.matchAll(/<script\b[^>]*>/gi)]
  .map(([tag]) => tag)
  .filter((tag) => attribute(tag, 'type') === 'module')
  .map((tag) => attribute(tag, 'src'));
if (
  manifest.schemaVersion !== 1 ||
  typeof manifest.version !== 'string' ||
  !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(manifest.version) ||
  !(manifest.revision === null || (typeof manifest.revision === 'string' && /^[a-f0-9]{40,64}$/.test(manifest.revision))) ||
  typeof manifest.builtAt !== 'string' ||
  !Number.isFinite(Date.parse(manifest.builtAt)) ||
  typeof manifest.entry !== 'string' ||
  !/^\/assets\/[a-zA-Z0-9._/-]+\.js$/.test(manifest.entry) ||
  manifest.entry.split('/').some((part) => part === '.' || part === '..') ||
  versions.length !== 1 ||
  attribute(versions[0], 'content') !== manifest.version ||
  !entries.includes(manifest.entry)
) throw new Error('Frontend entry and version manifest do not match');
const entry = fs.statSync(path.join(staging, manifest.entry));
if (!entry.isFile() || entry.size === 0) throw new Error('Frontend version entry is missing');
NODE
mkdir -p "$live"
# No --delete: tabs using the previous release still need its lazy chunks.
# Do not replace dist itself: running nginx/API containers bind-mount it.
rsync -rlt --delay-updates --exclude=/index.html --exclude=/version.json "$staging/" "$live/"
# Prepare both files before publishing. Version detection must never announce
# a release whose entry point has not been published yet.
entry=$(mktemp "$live/.index.XXXXXXXX")
version=$(mktemp "$live/.version.XXXXXXXX")
cp -- "$staging/index.html" "$entry"
cp -- "$staging/version.json" "$version"
chmod 644 "$entry"
chmod 644 "$version"
touch "$entry"
mv -f -- "$entry" "$live/index.html"
entry=''
mv -f -- "$version" "$live/version.json"
version=''
echo 'Frontend static files published; existing services and chunks retained.'
