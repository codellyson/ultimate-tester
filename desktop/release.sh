#!/bin/sh
# Builds, signs and publishes a Mac release that installed copies pick up through the updater.
# Usage: sh desktop/release.sh "What changed, in a sentence or two"
# Bump "version" in desktop/tauri.conf.json and desktop/Cargo.toml first. Needs the updater key
# at ~/.tauri/ultimate-tester.key (never commit it; losing it means installed copies can't update).
set -eu
cd "$(dirname "$0")"
NOTES=${1:?Say what changed: sh desktop/release.sh "notes"}
KEY=${TAURI_KEY:-$HOME/.tauri/ultimate-tester.key}
VERSION=$(node -p "require('./tauri.conf.json').version")
TAG="v$VERSION"
REPO=codellyson/ultimate-tester
gh release view "$TAG" -R "$REPO" >/dev/null 2>&1 && { echo "$TAG is already released; bump the version first." >&2; exit 1; }

TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY") TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" cargo tauri build --bundles app,dmg

OUT=$(mktemp -d)
B=target/release/bundle
cp "$B/macos/Ultimate Tester.app.tar.gz" "$OUT/UltimateTester.app.tar.gz"
cp "$B"/dmg/*_"$VERSION"_*.dmg "$OUT/UltimateTester.dmg"
NOTES="$NOTES" SIG=$(cat "$B/macos/Ultimate Tester.app.tar.gz.sig") VERSION="$VERSION" \
  URL="https://github.com/$REPO/releases/download/$TAG/UltimateTester.app.tar.gz" \
  node -e 'const e = process.env; console.log(JSON.stringify({ version: e.VERSION, notes: e.NOTES, pub_date: new Date().toISOString(), platforms: { "darwin-aarch64": { signature: e.SIG, url: e.URL } } }, null, 2))' > "$OUT/latest.json"

# `gh release create` asks for the "workflow" scope here, so git pushes the tag and the API makes the release.
git tag "$TAG" && git push -q origin "$TAG"
# GitHub sometimes answers 404 to creating the release for a tag pushed moments ago, and sometimes creates it
# anyway (cause not found; the token has the right scopes). So: ask, check whether it exists, wait longer, ask again.
for try in 1 2 3 4 5 6; do
  gh api "repos/$REPO/releases" -f tag_name="$TAG" -f name="Ultimate Tester $VERSION" -f body="$NOTES" >/dev/null 2>&1 || true
  gh release view "$TAG" -R "$REPO" >/dev/null 2>&1 && break
  [ "$try" = 6 ] && { echo "GitHub didn't create the release for $TAG. The tag is pushed; create it by hand, then upload $OUT/*." >&2; exit 1; }
  sleep $((try * 10))
done
gh release upload "$TAG" -R "$REPO" "$OUT/UltimateTester.dmg" "$OUT/UltimateTester.app.tar.gz" "$OUT/latest.json"
echo "Released $TAG: installed copies see it at their next launch."
