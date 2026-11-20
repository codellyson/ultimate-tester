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
cp "$B"/dmg/*.dmg "$OUT/UltimateTester.dmg"
NOTES="$NOTES" SIG=$(cat "$B/macos/Ultimate Tester.app.tar.gz.sig") VERSION="$VERSION" \
  URL="https://github.com/$REPO/releases/download/$TAG/UltimateTester.app.tar.gz" \
  node -e 'const e = process.env; console.log(JSON.stringify({ version: e.VERSION, notes: e.NOTES, pub_date: new Date().toISOString(), platforms: { "darwin-aarch64": { signature: e.SIG, url: e.URL } } }, null, 2))' > "$OUT/latest.json"

# gh can't create the tag itself here (it asks for the "workflow" scope), so git pushes it first.
git tag "$TAG" && git push -q origin "$TAG"
gh release create "$TAG" -R "$REPO" --verify-tag --title "Ultimate Tester $VERSION" --notes "$NOTES" \
  "$OUT/UltimateTester.dmg" "$OUT/UltimateTester.app.tar.gz" "$OUT/latest.json"
echo "Released $TAG: installed copies see it at their next launch."
