# Ultimate Tester

After every update, a fresh headless Claude Code session starts your app, drives it in a real browser like a QA tester, and returns a pass/fail verdict with evidence. On failure, the coding agent gets the repro and fixes it.

Requires Node 20+, the `claude` CLI signed in, and `npx` (for the Playwright MCP).

## Desktop app and web version

Ultimate Tester is one Nuxt app. Its Vue page (`app/`) is the window, and its Nitro server (`server/`) is the engine API; `bin/ultimate-tester.js serve` runs the built server on :4600 for every app you add. Build with `npm run build`; develop with `npm run dev` (port 4601).

- **Web:** run `serve` and open http://localhost:4600.
- **Mac app:** `desktop/` is a Tauri shell over that page. It starts the engine if it isn't running and adds a native folder picker. Build with `cd desktop && cargo tauri build --bundles app`.

## Set up (in the window)

```bash
node /path/to/ultimate-tester/bin/ultimate-tester.js setup
```

Opens the Ultimate Tester window on **Set up & run**: Tess drafts the profile from your repo, you sign in once in a Chrome window she opens (the session stays on this machine, no passwords stored), then press **Test** for your changes, a commit, or a release like `origin/prd..HEAD`.

## Use in a project

```bash
node /path/to/ultimate-tester/bin/ultimate-tester.js install
```

This writes `.ultimate-tester.md` (fill it in), adds `.ultimate-tester/` to `.gitignore`, adds a Claude Code `Stop` hook to `.claude/settings.json`, and adds a background run to `.git/hooks/post-commit`.

Run by hand:

```bash
node /path/to/ultimate-tester/bin/ultimate-tester.js run            # uncommitted changes
node /path/to/ultimate-tester/bin/ultimate-tester.js run --commit   # last commit
```

Exit codes: 0 pass or skipped, 1 fail, 2 unverified.

## Behaviour

- Docs-only diffs and already-passed diffs are skipped.
- A pass without evidence is downgraded to `unverified`.
- The tester cannot edit files; it may only run commands, read, and use the browser.
- The `Stop` hook blocks the agent on failure, up to 3 retests per session.
- Each run is saved in `.ultimate-tester/runs/<time>/`: `verdict.json`, `report.txt`, screenshots, page snapshots.
- Each run opens the Ultimate Tester window at http://localhost:4600: live steps, screenshots, verdict and past runs. Start it by hand with `ultimate-tester watch`; set `ULTIMATE_TESTER_PORT` to run one per repo.
- Tess, the tester, narrates each step. The browser she drives runs headless and streams live into the window (needs Google Chrome; `ULTIMATE_TESTER_CHROME` sets the path). `ULTIMATE_TESTER_HEADLESS=1` stops the window opening, for CI.
- Time limit per run: 5 minutes (`ULTIMATE_TESTER_TIMEOUT_MS`).

## Tests

```bash
npm test
```
