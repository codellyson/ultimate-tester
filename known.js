// Known problems: must-never-break checks the comparison proved were already broken before a change. Kept per
// repo in .ultimate-tester/known.json, so later runs don't set them off again (a page that takes the dev server
// down with it, say) unless a change could affect them. A check that passes again is dropped from the list.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = (state) => join(state, 'known.json');

// { [check name]: { error, since, seen, run } }
export function readKnown(state) {
  try { return existsSync(file(state)) ? JSON.parse(readFileSync(file(state), 'utf8')) : {}; } catch { return {}; }
}

// After a run: confirmed-before checks are added (or seen again), passing ones dropped. Returns the new list.
export function updateKnown(state, flows, run) {
  const known = readKnown(state), now = new Date().toISOString();
  for (const f of flows ?? []) {
    if (f.status === 'known' && f.cause === 'known') known[f.name] = { error: f.causeWhy ?? f.actual ?? '', since: known[f.name]?.since ?? now, seen: now, run };
    else if (f.status === 'pass') delete known[f.name];
  }
  writeFileSync(file(state), JSON.stringify(known, null, 2) + '\n');
  return known;
}

// For the prompt: one line per known problem, or a word saying there are none.
export function knownLines(known) {
  const rows = Object.entries(known);
  return rows.length ? rows.map(([name, k]) => `- "${name}" (broken since ${k.since.slice(0, 10)}): ${k.error}`).join('\n') : 'None.';
}

// The checks Tess didn't report, as verdict flows. failed: replays that failed and that she left alone (the change
// can't reach them), which stand as failures with their script so the comparison can repeat them. Known problems
// she didn't open are "already broken"; other must-never-break checks she skipped are "not checked", with her reason.
export function unreportedFlows(verdict, { failed = [], passed = [], known = {} }) {
  const reported = new Set((verdict.flows ?? []).map((f) => f.name));
  const left = failed.filter((r) => !reported.has(r.name)).map((r) => ({ name: r.name, status: 'fail', source: r.source ?? 'must-never-break', persona: r.persona ?? undefined, actual: `My saved script for this check failed: ${r.error}`, evidence: r.shot ? [r.shot] : [], replay: r.code }));
  const why = Object.fromEntries((verdict.skipped ?? []).filter((s) => s?.name).map((s) => [s.name, s.why]));
  const done = new Set([...reported, ...left.map((l) => l.name), ...passed]);
  const rest = [...new Set([...Object.keys(why), ...Object.keys(known)])].filter((n) => !done.has(n)).map((n) => (known[n]
    ? { name: n, status: 'known', source: 'must-never-break', actual: `Already broken since ${known[n].since.slice(0, 10)}, so I didn't open it again${why[n] ? ` (${why[n]})` : ''}. ${known[n].error}`, evidence: [] }
    : { name: n, status: 'notrun', source: 'must-never-break', actual: `Not checked: ${why[n]}`, evidence: [] }));
  return [...left, ...rest];
}

// A check's name as Tess writes it is the plan line plus who and where: "Add a product (as merchant, start at /products)".
export const sameCheck = (name, line) => name === line || name.startsWith(`${line} (`);
