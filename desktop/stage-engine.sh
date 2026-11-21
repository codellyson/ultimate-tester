#!/bin/sh
# Copies the engine (CLI + built Nuxt server) into desktop/engine so the app bundle carries it.
set -e
cd "$(dirname "$0")/.."
npm run build
rm -rf desktop/engine && mkdir -p desktop/engine
cp -R bin lib.js plan.js linked.js voice.js replay.js actions.js apps.js live.js baseline.js prompt.md setup.md profile.template.md package.json sample-app own-build schema .output desktop/engine/
