# Linked apps: testing a frontend with the backends it calls

Status: design agreed 2026-11-20, not built.

## The problem

A test plan today starts one app with one command. A frontend calls whatever backend its env file points at. For a shop dashboard that calls hosted dev backends, that is (`api.dev.example.com` and another hosted dev server), so:

- A frontend change that needs a backend change can't be tested as one change.
- A backend change is tested only through requests; nobody sees whether the pages that use it still work.
- On a new Mac, nothing tells you which backends a frontend needs or where they are.

Real shapes this has to cover:

| Product | Frontend | Backends it calls |
| --- | --- | --- |
| Passalong | `apps/web` (Nuxt) | Served by the same `nuxt dev` (`/v1/...`). Already one app; nothing to link. |
| A shop dashboard (example) | `shop-dashboard` (Next.js) | `NEXT_PUBLIC_CORE_API_URL` → `orders-api`; `NEXT_PUBLIC_API_URL` → the main API. Two links. |

## The idea in one line

A frontend's plan names the backends it uses; when you test it, Tess starts your local copy of each backend first, points the frontend at them, and reports page checks and API checks as one test.

## 1. Declaring a link (in the plan, so the team shares it)

A new section in the frontend's `.ultimate-tester.md`:

```markdown
## Backends
- core-api: github.com/acme/orders-api, set NEXT_PUBLIC_CORE_API_URL
- api: github.com/acme/main-api, set NEXT_PUBLIC_API_URL
- When a backend isn't on this Mac: use the dev one already in .env.local
```

- A link names the backend by its **git remote**, not a folder path, so the plan works on every Mac. Ultimate Tester finds the checkout by matching remotes among the apps you've added (and offers to add it if it finds the folder but it isn't added yet).
- `set VAR` is how the frontend is pointed at the local backend: Ultimate Tester sets that env var to the backend's local URL when it starts the frontend. No edits to `.env.local`.
- Each backend keeps its **own** plan (its own Start, Ready when, Browser: not needed, Must never break). The link reuses it; nothing is copied.
- Tess drafts this section when she reads the repo: env vars ending in `API_URL`/`BACKEND_URL` that point at a host, matched to repos you've added.

## 2. What happens when you press Test

1. **Find each backend.** For every link: found on this Mac (added app with the same remote), found but not added, or not on this Mac.
2. **Start backends first,** each with its own plan's Start command on a free port, and wait for its Ready when. Same rules as today: Tess's own copy, never the developer's running one, own build folder where needed.
3. **Start the frontend** with each `set VAR` pointed at its backend's local URL.
4. **Plan the checks across both.** The diff now spans repos: Tess reads the frontend's change and each backend's change (uncommitted or branch vs its base) and plans checks for both. Page checks drive the browser; API checks send requests.
5. **One result,** with every check tagged by the app it exercises.
6. **Stop everything** she started, in reverse order.

When a backend can't be used (not on this Mac, won't start), the plan's fallback line decides: use the hosted dev backend and say so plainly in the result ("Tested against the dev core API, not your local copy"), or stop and say what's missing. Never silently.

## 3. Which code is tested

- Each app is tested **as it is checked out on this Mac**: its current branch plus uncommitted changes.
- The result header names both: `shop-dashboard · feature/b2b-invoices (uncommitted) — core-api · feature/b2b-invoices @ a1b2c3`.
- If the branch names differ, it says so before the test starts ("core-api is on main, not feature/b2b-invoices. Test anyway / Switch it first") — it never switches branches itself.

## 4. Results

- The header lists the apps in the test, each with its branch.
- Checks stay grouped by source ("What you changed", "Must never break"), and each check gets a small app tag (`web`, `core-api`).
- A page check can show **the requests behind it**: Tess's browser records the API calls the page made, so a broken page shows the failing request under the screenshot, in the same Expected / Came back view API checks use.
- An API check looks exactly as it does today.

## 5. Changes in a backend

- A backend knows which frontends link to it (reverse lookup over added apps).
- After a backend test, the result offers: "shop-dashboard uses core-api. Test it against this change too."
- Whether this runs automatically is an open decision (below).

## 6. Setup, on a new Mac

The setup checklist gets a step after the plan: **Backends**.

- One row per link: name, status and branch. "core-api · found at ~/code/orders-api · feature/b2b-invoices".
- Not added: "Found orders-api on this Mac. Add it" (one click; Tess drafts its plan).
- Not on this Mac: "Not on this Mac. Clone it, or test against the dev backend" with the clone command to copy.
- A backend whose own plan isn't checked yet blocks nothing; the row says "Plan not checked yet".

## What this needs, in build order

1. Plan section `## Backends` + parser; the setup step showing each link's status. (No test changes yet.)
2. Engine: start linked backends from their own plans before the frontend, set the env vars, stop them after. Fallback line honoured.
3. Prompt: diffs from every linked repo; checks tagged by app; header shows each app's branch.
4. Requests behind a page check (record the browser's network calls during a check).
5. Backend → frontend offer after a backend test.

Steps 1–3 make "test my frontend change with my backend change" work. 4 and 5 make it pleasant.

## Decisions (agreed 2026-11-20)

1. **When a backend isn't available:** fall back to the hosted dev backend from the env file, and say so plainly in the result and its header ("api · dev backend"). A plan can say "stop instead" for a backend that must be local.
2. **Backend change → frontend test:** offered after the backend's test, not run automatically.
3. **Branch mismatch:** warn before the test with "Test anyway" or "Switch it first"; never refuse, never switch branches itself.
4. **Where links live:** in the frontend's plan (`## Backends`), shared with the team through the repo.

### Asked or set ahead

The rule: settle things once during setup; ask only when a person started the test and is there to answer; never stop an automatic test (Claude Code hook, after a commit) to ask.

| Decision | How it's settled |
| --- | --- |
| Which backends, and which env var points at each | Set ahead: Tess drafts `## Backends`, you confirm it once in the Backends setup step. |
| Backend missing: dev backend or stop | Set ahead per backend in the plan (dev backend by default). Never asked during a test; the result says which was used. |
| Branch names don't match | Asked when you start the test yourself (Test anyway / Switch it first). In an automatic test it isn't asked: the test runs and the header says "core-api is on main, not feature/x". |
| Test the frontends after a backend change | Offered on the backend's result as a button; you choose each time. Never runs by itself. |
