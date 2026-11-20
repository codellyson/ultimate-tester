# Replay: rerun checks from cached steps instead of asking Tess every time

Status: design, not built. Written 2026-11-20.

## The problem

Every test is a full Claude session: Tess reads the diff, plans, starts the app and clicks through every check, including the "must never break" ones that are the same every time. A small notes test costs about $0.48 and takes about 1m 40s on Opus; a real app costs more. "Test again" after a fix pays it all again.

Her clicks can't simply be recorded and played back: the browser tool points at elements by references from one page load ("ref e12"), which mean nothing on the next load.

## The idea

When a check passes, Tess also writes it down as a **replay**: a short script that does the same steps with stable names (the button called "Add", the box labelled "Title") and checks the same thing she saw. Next time, the engine runs the replays itself, in the browser, with no Claude call. Tess is only asked about what replays can't answer.

## What a replay is

One small file per check, kept in the repo's `.ultimate-tester/replays/` (git-ignored, this Mac only):

```js
// "Add a note and see it in the list, with its title" · as visitor · made by run 2026-11-20T02-18-59
export default async ({ page, base, as, see }) => {
  await as('visitor');
  await page.goto(base + '/');
  await page.getByRole('textbox', { name: 'Title' }).fill('UT replay note');
  await page.getByRole('button', { name: 'Add' }).click();
  await see(page.getByRole('listitem').filter({ hasText: 'UT replay note' }), 'the new note is in the list');
};
```

- `base` is this run's app address, `as(key)` switches to a saved sign-in, `see(locator, what)` checks something is visible and records what was seen. Each replay takes a screenshot at its last step, so the result screen shows evidence exactly as for Tess's checks.
- Only checks that **passed** get a replay, and only ones done in the browser or with requests. Checks that needed judgement (reading a summary, comparing designs) stay with Tess.
- API checks replay their recorded requests and compare the fields that mattered.

## What happens on a test

1. **The engine starts the app itself** (it already does this for sign-in and linked backends) and opens the browser.
2. **It runs the replays** that apply:
   - every "must never break" check that has one, on every test;
   - on **Test again**, every check from the test being repeated, including the ones that broke, so a fix is confirmed without Tess.
3. **Then Tess, only for what's left:** checks for the new change, checks with no replay, and checks whose replay failed. She's told which checks already passed by replay, so she doesn't repeat them.
4. **One result.** Replayed checks look like any other, with a small "Replayed" mark and their screenshot. The header says what Tess was needed for ("3 replayed, 2 checked by Tess").

If every check is covered by a replay and they all pass, no Claude session runs at all.

## When a replay fails

A replay can fail because the app broke, or because the page changed (a button renamed). The engine can't tell which, so a failed replay goes to Tess as a normal check, with the replay's error and screenshot. If she finds the app is fine, she writes a new replay; if it's broken, it's reported as broken. A replay that fails twice in a row without Tess finding a bug is dropped.

## What it changes

- **Cost:** "must never break" checks stop costing tokens after their first pass. "Test again" after a fix costs nothing when the fix works.
- **Time:** a replay runs in seconds; Tess only spends time on what's new.
- **Trust:** a replay only checks what it was written to check. Tess still looks at every new change, so nothing new goes unexamined.

## Decisions to make

1. **What gets replayed.** Proposal: must-never-break checks on every test, and every check on Test again.
2. **Where replays live.** This Mac only (in the git-ignored `.ultimate-tester/`), or committed so the team shares them? Proposal: this Mac first; sharing later once they've proved stable.
3. **A failed replay.** Hand it to Tess to look again (costs tokens, catches false alarms), or report it as broken straight away (free, but a renamed button would show as a bug)? Proposal: hand it to Tess.

## Build order

1. Tess writes a replay for each passing check (prompt + saved files).
2. The engine runs replays before Tess and tells her what's covered.
3. Result screen: "Replayed" mark, header split, replays' screenshots.
4. Test again replays the whole previous test first.
5. Failed-replay hand-off and dropping replays that keep failing.
