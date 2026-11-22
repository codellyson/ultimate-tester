# How a test run decides what it found

Status: built and released in 0.2.2 (2026-11-21); voice fix in 0.2.3. This is the place to pick up from.

## Why this exists

Runs were going red for things the change didn't cause. Across 26 past runs, none of the 16 failed checks came from the change under test: 10 were already broken before it, 6 came from another repo's change. On one Next.js app, a commit took 8 to 11 minutes and ended "FAIL" because of a build error and a broken page that were there all along. The fixes below follow how a careful tester works, not one run.

## A run, in order

0. **Isolation** (`workspace.js`, `started.js`). Nothing runs in the developer's folder. Each app has Ultimate Tester's own git worktrees in `~/.ultimate-tester/work` (`now` and `before`), reset to exactly the code a run needs, with packages from that code's lockfile. Everything a run starts is recorded; Stop shuts it down at any stage, and leftovers from a crashed run are stopped by the next run or engine start.
1. **Setup check** (`preflight.js`). The engine starts the app itself and tries each saved sign-in on a page only that persona reaches (taken from the plan's must-never-break `startAt`). An app that won't start, or every sign-in gone, ends the run as "Setup broken" with the app's last error line. No Tess session.
2. **Replays** (`replay.js`). Saved scripts for must-never-break checks run first, one at a time, with no AI. A failed replay gets the app restarted before the next one, because some pages take the dev server down with them. Checks on the known-problems list aren't replayed.
3. **Tess** (`prompt.md`). She plans the checks of the change, plus only the must-never-break checks the change can reach; the rest go in `skipped` with why. She uses the engine's copy of the app and may restart it on the same port. When a check of the change is blocked by something the change didn't cause, she tries one other way in (another persona, store or record) and records it as `tried`.
4. **Comparison** (`baseline.js`). Each failed must-never-break check is repeated from its script on freshly started copies of the code now and of the code before the change (a git worktree with that commit's own packages). Failing both ways, the same way: "already broken". Passing before: "broken by this change". Anything else, including any timeout: "unconfirmed", which stays a failure.
5. **Known problems** (`known.js`). Checks proven already broken go into `.ultimate-tester/known.json` in the tested repo. Later runs don't open them unless the change could affect them, and drop them once they pass.
6. **Two answers** (`answers()` in `lib.js`). Counted from the checks, no AI: "Your change: Passed 1 of 3 checks; 2 couldn't run." and "Broke anything: No: 2 passed, 2 already broken before this change, 1 out of its reach." Only proof makes "Yes"; an unconfirmed failure is "Maybe".

Result on that Next.js app: under 2 minutes, "unverified" for the right reasons.

## Lessons from real runs

Planted tests passed while real apps broke these, so check each step on a real app:

- Turbopack refuses a `node_modules` linked from outside the folder: the old code needs its own install.
- Next.js stops `next dev` to show an upgrade notice when it sees an AI agent (`AI_AGENT`, `CLAUDECODE`); the engine starts apps without those.
- Next.js runs one dev server per folder: stop the engine's copy before starting another. (Isolation means it never meets the developer's own server.)
- A run that crashes leaves its app, Tess and Chrome running; they're recognised by the folder they run in, since a port may only be in the environment.
- Two Chrome instances can't share a profile folder.
- A freshly started dev server compiles each page on first visit; timeouts there say nothing about the change.
- A replay that only checks an error is absent passes on a page still loading; scripts must check for what a working page shows.
- Saved sign-ins record where sign-in started (`/login`), not where the persona landed.

## Open

- Setup could send a plan's sign-up email to the backend once, so an address the backend rejects is caught before a run, not during one.
- The status pill above a result still shows plain counts next to the two answers; may go.
- Release with `sh desktop/release.sh "notes"` in a normal terminal: `gh` signs in from the keychain, and as a background job every call is a 404.
