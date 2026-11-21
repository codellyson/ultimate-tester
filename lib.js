// Pure helpers, kept apart from the CLI so they can be tested without git or claude.

const DOC_ONLY = /(\.(md|mdx|txt|rst)$|^docs\/|^LICENSE|^\.github\/ISSUE_TEMPLATE\/|^\.ultimate-tester\/)/i;

export function shouldSkip(files) {
  if (files.length === 0) return 'no changes';
  if (files.every((f) => DOC_ONLY.test(f))) return 'docs-only change';
  return null;
}

export const VERDICT_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'flows'],
  properties: {
    status: { enum: ['pass', 'fail', 'unverified'] },
    summary: { type: 'string' },
    // Must-never-break checks left out because this change can't reach them, each with why.
    skipped: { type: 'array', items: { type: 'object', required: ['name', 'why'], properties: { name: { type: 'string' }, why: { type: 'string' } } } },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status', 'evidence'],
        properties: {
          name: { type: 'string' },
          persona: { type: 'string' },
          status: { enum: ['pass', 'fail', 'unverified'] },
          steps: { type: 'array', items: { type: 'string' } },
          expected: { type: 'string' },
          actual: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          // The page Tess was on when she took this check's screenshot, shown above it in the app.
          url: { type: 'string' },
          // With linked backends: which app a check exercised ("app", or a backend's name).
          app: { type: 'string' },
          // Where the check came from: "diff" or "must-never-break", as in plan.json.
          source: { type: 'string' },
          // A script the engine can rerun later without Tess (see replay.js), for a check she actually performed.
          replay: { type: 'string' },
          // A blocked check of the change: the other route Tess tried, and how it went.
          tried: { type: 'string' },
          // Set only on an unverified check that couldn't run because something it needs doesn't exist yet.
          needs: { type: 'string' },
          setupBy: { enum: ['tess', 'person'] },
          // A check made with requests: each one, in order, so the app can show what was sent and what came back.
          requests: {
            type: 'array',
            items: {
              type: 'object',
              required: ['method', 'path', 'status'],
              properties: {
                method: { type: 'string' },
                path: { type: 'string' },
                sent: { type: 'string' },
                status: { type: 'integer' },
                ms: { type: 'number' },
                got: { type: 'string' },
                // On the request that proves a failure: the body that should have come back.
                expected: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

// The tester's word is not enough: a pass without evidence is downgraded.
// plan: the checks Tess said she would run (plan.json). One she planned but never reported is not checked,
// so the run can't be a pass however the reported ones went.
export function enforceEvidence(verdict, plan = []) {
  const reported = (verdict.flows ?? []).map((f) =>
    f.status === 'pass' && !(f.evidence?.length) ? { ...f, status: 'unverified', actual: 'no evidence given' } : f,
  );
  const names = new Set(reported.map((f) => f.name));
  const missing = (Array.isArray(plan) ? plan : [])
    .filter((p) => p?.name && !names.has(p.name))
    .map((p) => ({ name: p.name, status: 'unverified', actual: 'planned, but not reported in the verdict', persona: p.persona }));
  const flows = [...reported, ...missing];
  let status = verdict.status;
  if (flows.length === 0) status = 'unverified';
  else if (flows.some((f) => f.status === 'fail')) status = 'fail';
  else if (flows.some((f) => f.status === 'unverified')) status = 'unverified';
  else status = 'pass';
  return { ...verdict, status, flows };
}

const checks = (n) => `${n} check${n === 1 ? '' : 's'}`;
const listOf = (parts) => parts.filter(Boolean).join(', ');

// The two questions a run answers, counted from its checks (no AI): did the change do what it should, and did it
// break anything that worked before? Facts, not verdicts: "Passed 2 of 3 checks", never "works".
// status uses the check statuses (pass, fail, unverified, notrun) so the app can show the same icons.
export function answers(flows = []) {
  const count = (fs, st) => fs.filter((f) => f.status === st).length;
  const diff = flows.filter((f) => f.source !== 'must-never-break');
  const n = diff.length, p = count(diff, 'pass'), f = count(diff, 'fail'), u = n - p - f;
  const change = !n ? { status: 'notrun', short: 'not checked', text: 'No checks of the change itself.' }
    : f ? { status: 'fail', short: 'failed', text: `Failed ${f} of ${checks(n)}${p ? `, passed ${p}` : ''}${u ? `, ${u} couldn't run` : ''}.` }
    : !u ? { status: 'pass', short: 'passed', text: n === 1 ? 'Passed its one check.' : `Passed all ${checks(n)}.` }
    : p ? { status: 'unverified', short: 'partly checked', text: `Passed ${p} of ${checks(n)}; ${u} couldn't run.` }
    : { status: 'unverified', short: "couldn't check", text: n === 1 ? "Its one check couldn't run." : `None of its ${checks(n)} could run.` };

  const mnb = flows.filter((f) => f.source === 'must-never-break');
  const reg = mnb.filter((f) => f.status === 'fail' && f.cause === 'regression').length;
  const unsure = mnb.filter((f) => f.status === 'fail' && f.cause !== 'regression').length;
  const ok = count(mnb, 'pass'), known = count(mnb, 'known'), out = count(mnb, 'notrun'), cant = count(mnb, 'unverified');
  const rest = listOf([ok && `${ok} passed`, known && `${known} already broken before this change`, out && `${out} out of its reach`, cant && `${cant} couldn't run`]);
  const broke = reg ? { status: 'fail', short: `broke ${reg}`, text: `Yes: ${checks(reg)} passed before this change and ${reg === 1 ? 'fails' : 'fail'} now${unsure ? `; ${unsure} more failed, not confirmed` : ''}.` }
    : unsure ? { status: 'fail', short: `maybe broke ${unsure}`, text: `Maybe: ${checks(unsure)} failed, and I couldn't confirm whether this change caused ${unsure === 1 ? 'it' : 'them'}${rest ? `. Others: ${rest}` : ''}.` }
    : !mnb.length ? { status: 'notrun', short: 'not checked', text: 'No must-never-break checks.' }
    : ok ? { status: 'pass', short: 'nothing broke', text: `No: ${rest}.` }
    : cant ? { status: 'unverified', short: "couldn't tell", text: `Can't tell: ${rest}.` }
    : { status: 'notrun', short: 'not checked', text: `Nothing it could affect: ${rest}.` };
  return { change, broke };
}

export function renderReport(v, meta) {
  const lines = [`Ultimate Tester: ${v.status.toUpperCase()} — ${v.summary}`, ''];
  if (v.answer) lines.splice(1, 0, `Your change: ${v.answer.change.text}`, `Broke anything: ${v.answer.broke.text}`);
  for (const f of v.flows) {
    lines.push(`- [${f.status}] ${f.name}`);
    if (f.status !== 'pass') {
      if (f.steps?.length) lines.push(`    steps: ${f.steps.join(' → ')}`);
      if (f.expected) lines.push(`    expected: ${f.expected}`);
      if (f.actual) lines.push(`    actual: ${f.actual}`);
    }
    if (f.tried) lines.push(`    another way in: ${f.tried}`);
    for (const e of f.evidence ?? []) lines.push(`    evidence: ${e}`);
  }
  lines.push('', `run: ${meta.runDir}  (${meta.durationS}s, ${meta.usage})`);
  return lines.join('\n');
}

// Pulls the start command and the app URL out of a profile's "## Start" section.
export function parseStart(md) {
  const start = md.split(/^## /m).find((s) => s.startsWith('Start')) ?? '';
  const command = start.match(/^- Command:\s*`?(.+?)`?\s*$/m)?.[1] ?? null;
  const url = start.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s)`]*/)?.[0] ?? null;
  return { command, url };
}

// "## Personas" lines: "- owner: Store owner with B2B on" or "- shopper: Guest shopper, no sign-in".
// A profile without the section has one persona, "default", with no saved sign-in (the profile says how to get in).
export function parsePersonas(md) {
  const sec = md.split(/^## /m).find((s) => /^Personas\b/.test(s));
  if (!sec) return [{ key: 'default', label: 'Anyone (no saved sign-in)', signIn: false }];
  return sec.split('\n').slice(1).map((l) => l.match(/^\s*-\s*`?([a-z0-9][a-z0-9-]*)`?\s*:\s*(.+)$/i)).filter(Boolean)
    .map(([, key, label]) => ({ key: key.toLowerCase(), label: label.trim(), signIn: !/\b(no sign-in|signed[- ]out|not signed in|guest|fresh account each run)\b/i.test(label) }));
}

// Moves the profile's app port to `port`, so a run never lands on a server someone else started.
export function withPort(md, port) {
  const old = parseStart(md).url?.match(/:(\d+)/)?.[1];
  if (!old) return md;
  return md
    .replace(new RegExp(`((?:localhost|127\\.0\\.0\\.1):)${old}\\b`, 'g'), `$1${port}`)
    .replace(new RegExp(`((?:-p|--port)[ =]|PORT=)${old}\\b`, 'g'), `$1${port}`);
}

// The CLI's cost is a list-price estimate; it is only money when an API key is billed.
export function usageLabel({ paid, plan, costUsd }) {
  if (paid) return `$${costUsd.toFixed(2)}`;
  return `on your Claude ${plan ? `${plan[0].toUpperCase()}${plan.slice(1)} ` : ''}plan, no charge`;
}

// Adds "- line" to a profile section, creating the section at the end if it is missing.
export function addToSection(md, head, line) {
  const parts = md.trimEnd().split(/^(?=## )/m);
  const i = parts.findIndex((p) => p.startsWith(`## ${head}\n`) || p.trim() === `## ${head}`);
  if (i < 0) return `${md.trimEnd()}\n\n## ${head}\n- ${line}\n`;
  parts[i] = `${parts[i].trimEnd()}\n- ${line}\n\n`;
  return parts.join('').trimEnd() + '\n';
}

// What went wrong in the last few finished runs, so Tess re-checks it. verdicts: newest first.
export function recentRuns(verdicts, max = 3) {
  return verdicts.filter(Boolean).slice(0, max).map((v) => {
    const bad = (v.flows ?? []).filter((f) => f.status !== 'pass').map((f) => `  - ${f.status}: ${f.name}${f.actual ? ` (saw: ${f.actual.slice(0, 160)})` : ''}`);
    return [`- ${v.status}: ${(v.summary ?? '').slice(0, 200)}`, ...bad.slice(0, 5)].join('\n');
  }).join('\n') || 'No earlier runs.';
}

// Replaces a profile section's body, adding the section at the end when missing.
export function setSection(md, head, body) {
  const parts = md.trimEnd().split(/^(?=## )/m);
  const i = parts.findIndex((p) => p.startsWith(`## ${head}\n`) || p.trim() === `## ${head}`);
  const sec = `## ${head}\n${body.trim()}\n\n`;
  if (i < 0) parts.push(`\n\n${sec}`); else parts[i] = sec;
  return parts.join('').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// A Claude Code settings object without Ultimate Tester's Stop hook (other hooks untouched).
export function withoutOurStopHook(settings) {
  const s = structuredClone(settings ?? {});
  const stop = s.hooks?.Stop;
  if (!Array.isArray(stop)) return s;
  const kept = stop
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !String(h.command ?? '').includes('ultimate-tester')) }))
    .filter((g) => g.hooks.length);
  if (kept.length) s.hooks.Stop = kept; else delete s.hooks.Stop;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}
