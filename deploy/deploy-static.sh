#!/usr/bin/env bash
# Keep the live bind-mounted directory and old browser chunks available.
set -euo pipefail
umask 022
repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository"
live="$repository/dist"
staging=$(mktemp -d "${TMPDIR:-/tmp}/zoj-frontend-build.XXXXXXXX")
entry=''
cleanup() {
  [[ -z "$entry" ]] || rm -f -- "$entry"
  rm -rf -- "$staging"
}
trap cleanup EXIT
npm run build -- --outDir "$staging" --emptyOutDir
test -s "$staging/index.html"
test -d "$staging/assets"
mkdir -p "$live"
# No --delete: tabs using the previous release still need its lazy chunks.
# Do not replace dist itself: running nginx/API containers bind-mount it.
rsync -rlt --delay-updates --exclude=/index.html "$staging/" "$live/"
# Publish the entry point only after every new asset is in place.
entry=$(mktemp "$live/.index.XXXXXXXX")
cp -- "$staging/index.html" "$entry"
chmod 644 "$entry"
touch "$entry"
mv -f -- "$entry" "$live/index.html"
entry=''
echo 'Frontend static files published; existing services and chunks retained.'
