#!/bin/sh
# Copies the engine (CLI + built Nuxt server) into desktop/engine so the app bundle carries it.
set -e
cd "$(dirname "$0")/.."
npm run build
rm -rf desktop/engine && mkdir -p desktop/engine
cp -R bin lib.js actions.js apps.js live.js prompt.md profile.template.md package.json sample-app own-build .output desktop/engine/
