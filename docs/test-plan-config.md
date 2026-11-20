# The test plan as a JSON file with a schema

Status: steps 1–4 built 2026-11-20; step 5 not built. Comes before [linked apps](linked-apps.md), which adds `backends` to it.

## Why

Everything Tess needs to test an app lives in one file today, `.ultimate-tester.md`. Its settings are lines like `- Command:` and `- Browser:` that the engine finds by pattern. That breaks quietly: Tess left out the Browser line twice until it had its own slot in the template, and nothing told anyone it was missing.

A JSON file with a JSON Schema fixes that:

- **Every answer has a place and a type.** The engine reads fields, not patterns. A missing or wrong answer is caught when the file is written, not halfway through a test.
- **The AI fills it reliably.** Tess drafts it with the schema as her output format (`claude --json-schema`), so what she writes is always valid.
- **The gaps are the questions.** Fields marked `x-ask` are ones Tess can't work out from the repo. Setup asks each one once, in plain words, and writes the answer. Nothing is asked twice; an automatic test never stops to ask.
- **Editors help people edit it.** The file names its schema, so VS Code and others autocomplete and check it.
- **Committed to the repo, so a new Mac already has every answer.** Setup there is only what belongs to that Mac.

## The files

| File | Where | Shared? | Holds |
| --- | --- | --- | --- |
| `.ultimate-tester.json` | repo root | Yes, committed | How to test the app: start, URLs, sign-in mode, personas, must never break, own tests, backends, notes, lessons, environment recipes. |
| `~/.ultimate-tester/apps/<id>.json` | each Mac | No | This Mac only: saved sign-ins per persona, where each backend's checkout is, which triggers are installed, the last test. |

The shared file never holds a password, a session, or a folder path like `/Users/…`.

Schema: [schema/ultimate-tester.schema.json](../schema/ultimate-tester.schema.json), published at `https://ultimate-tester.kreativekorna.com/schema/v1.json`.
Examples that validate: [Passalong](../schema/examples/passalong.json), [shop dashboard](../schema/examples/shop-dashboard.json) (two backends), [a notes API](../schema/examples/notes-api.json) (`kind: "api"`).

## What changes from the Markdown plan

| Markdown today | JSON |
| --- | --- |
| `- Command: pnpm dev --port 3004` | `start.command: "pnpm dev --port {port}"` + `start.port: 3004`. `{port}` is required, so Tess never has to guess which number to swap. |
| `- Ready when: http://localhost:3004 returns 200` | `start.readyUrl: "http://localhost:{port}"`, local and on `{port}` only |
| `- Seed:` command or sentence | `start.seed: { command, cwd }` or `null`, always a command |
| `PASSALONG_FOLDER_FIXTURE=0 …` in the command | `start.env`, which refuses names ending in KEY, SECRET, TOKEN or PASSWORD |
| `- Browser: not needed` | `browser: false`. An app with pages and an API (Passalong) is `browser: true` and still gets API checks. |
| `## Allowed URLs` prose mixing hosts and commands | `urls.allowed` / `urls.never`: hosts only (`*.example.com`); `neverRun`: commands, matched by how they start (`git push`) |
| `## Test accounts` prose for the whole app | Per persona: `signIn: "saved" \| "signUp" \| "none"`, with `signUp: { url, email }` only when it's signUp |
| `- key: who, no sign-in` | `personas[]`: `key`, `who`, `signIn`. With `browser: false`, every `signIn` must be `none`. |
| `## Must never break` sentences | `mustNeverBreak[]`: `{ check, as?, startAt? }`, so Tess knows who does it and where it starts |
| `## Existing checks` prose | `ownTests: { command: "node --test {file}", cwd? }`, only the files a change touches |
| `## Notes for Tess` | `notes[]` |
| `## Lessons`, `## Environment` | `lessons[]` (with `at`), `environment[]` (with `steps`), still added by Tess |
| (new) | `backends[]`: `{ name, repo: "host/owner/name", env, whenMissing }` |

The schema rejects, among others: a command without `{port}`, a ready URL that isn't local, a secret in `env`, a seed written as a sentence, a host with a path, sign-up details missing (or on a persona that doesn't sign up), a sign-in on an app with no browser, a "must never break" that's a bare sentence, a test command without `{file}`, a repo with credentials in it, and a folder that climbs out of the repo. Each was checked against the schema.

## Setting it up, on any Mac

1. **Repo has `.ultimate-tester.json`:** read it, check it against the schema. Setup shows only per-Mac steps: sign in as each persona with `signIn: true`, and find each backend's checkout.
2. **Repo has the old `.ultimate-tester.md`:** convert it once (Tess reads it and writes the JSON through the schema), show the result on the plan card to confirm, then remove the `.md`. Until confirmed, the `.md` keeps working.
3. **Repo has neither:** Tess reads the repo and drafts the JSON. Each `x-ask` field she couldn't answer becomes a question in setup:
   - "How should I sign in: with accounts you sign in once per Mac, a fresh account I create each run, or no sign-in at all?"
   - "Are there production addresses or commands I must never touch?"
   - "What must never break, whatever changes?" (pre-filled with her guesses to edit)
   - For each backend: "If core-api isn't on a Mac, should I use the dev one or stop?"

## How the app uses it

- **Plan card:** renders the JSON in plain words, as now ("I start it with `pnpm dev`", "Pages I may open"). Each row edits its field; the save is checked against the schema before it's written.
- **Engine:** reads fields directly: `start` for the command and port swap, `kind` to skip the browser, `backends` to start linked apps, `personas` for sign-in.
- **Tess's prompt:** gets the plan as readable text built from the JSON, not the raw file.
- **Tess's additions:** `lessons` and `environment` are appended by the engine, then validated, so a run can never leave a broken file.

## Build order

1. **Done 2026-11-20.** `plan.js` reads `.ultimate-tester.json` (or the old `.md`), checks it against the schema with a small built-in validator (the engine ships without node_modules), and hands the engine the same text it always read. Lessons, notes and test-data recipes are written back into the JSON and re-checked before saving. An invalid plan is never half-read: nothing is tested and setup lists the problems. The plan card shows a JSON plan read-only until step 4. Not done yet: publishing the schema at its URL.
2. **Done 2026-11-20.** Tess drafts new plans as `.ultimate-tester.json`: the full schema is in her instructions, her answer is checked by the validator, and if it fails she gets one repair round with the exact problems. What she couldn't work out comes back as questions (field path + plain question), shown in setup with the right control for the field (choices, one per line, or text), her guess pre-filled. Each answer is checked against the schema before it's saved; Keep your guess leaves it. Answered questions never come back.
3. **Done 2026-11-20.** Setup offers "Convert it" on an old `.md` plan. Tess turns it into JSON (same checks and repair round as drafting), keeping every fact, and the result is shown read-only as "Not saved yet". "Use the new plan" writes `.ultimate-tester.json`, queues her questions and deletes the `.md` (a change to commit in that repo); "Not now" drops it. Until then the `.md` keeps working.
4. **Done 2026-11-20.** On a JSON plan, each plan-card row edits the fields it shows: notes and must-never-break one per line (a kept check keeps its who and where), the rest as that part's JSON. "Open as JSON" edits the whole file. Every save is checked against the schema; a refused edit says why in plain words (each format rule has its own reason, e.g. "needs {port} where the port goes") and the plan stays as it was. A plan changed meanwhile is not overwritten.
5. Per-Mac file for sign-ins and backend paths (they live in `~/.ultimate-tester` already; this gives them a fixed shape).

Linked apps then only adds the engine side of `backends`.

## Open questions

1. **File name:** `.ultimate-tester.json` (hidden, next to `.gitignore`) or `ultimate-tester.json` (visible, like `package.json`)? Proposal: hidden, matching today's `.md`.
2. **Comments:** JSON has none. Notes go in `notes[]` and each field's `description` explains it in editors. Allow JSONC (`//` comments) too? Proposal: no, keep plain JSON so every tool reads it.
