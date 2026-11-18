# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Developers who already ship with Claude Code and want each change tested in a real browser before they push. They work in a repo on a Mac, let Claude Code make changes, and today either click through the app by hand or skip checking.

## Product Purpose
Ultimate Tester is a Mac app (Tauri shell over a local Nuxt engine). After every update, a fresh headless Claude Code session named Tess starts the app, drives it in a real Chrome like a QA tester, and returns a verdict with evidence. On a failure, Claude Code gets the repro and fixes it. Success: the developer pushes knowing the change was really used, not just compiled.

## Positioning
- Tests every change itself: runs when a Claude Code task finishes or on each commit; no test scripts to write.
- Verdict with evidence: screenshots and page snapshots for every check; never says "safe" while a planned check went unverified.
- Sends failures back: the Claude Code Stop hook hands the repro to the coding agent, up to 3 retests per session.
- Runs on your Mac: uses the developer's own Claude Code plan; sign-ins stay on the machine, passwords are never stored or seen.

## Operating Context
Triggers: when Claude Code finishes a task (Stop hook in .claude/settings.local.json, Claude Code waits 3 to 10 minutes), on each commit (post-commit hook), or by hand (uncommitted changes, last commit, a release range like origin/prd..HEAD). Tess tests as personas (tiers, roles, signed-out), one saved sign-in each. Runs are saved under .ultimate-tester/runs/ in the repo; the app shows live steps, the browser streamed live, the verdict, and history.

## Capabilities and Constraints
- Requires macOS, Node 22+, the `claude` CLI signed in, Google Chrome, and `npx` (Playwright MCP).
- Tess cannot edit files; she may run commands, read, and use the browser.
- Docs-only and already-passed diffs are skipped.
- Price: free; it uses the developer's own Claude Code plan. No pricing tiers.
- Distribution: Mac download (.dmg). Not code-signed or notarised yet (undecided), so first open needs right-click > Open.
- Not affiliated with Anthropic; "Claude Code" is named only as the tool it works with.

## Brand Commitments
- Name: Ultimate Tester. The tester persona: Tess, who speaks in first person.
- App icon: Tess's green orb on ink.
- In-app look (Ink palette, Satoshi, Heroicons, pill buttons, Tess's dark speech bubble) is the incumbent identity.

## Evidence on Hand
- Real app screens can be captured from the running app (sample-app in the repo is a safe subject).
- No testimonials, customers, user counts, benchmarks, or press. Do not fabricate any.

## Product Principles
1. Honest verdicts over green ticks: unverified is said out loud.
2. The developer stays in their flow; Tess comes to them, at the right moment.
3. Local and private by default.
4. Plain words: Tess explains what she did as a person would.
