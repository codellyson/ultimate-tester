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
        },
      },
    },
  },
};

// The tester's word is not enough: a pass without evidence is downgraded.
export function enforceEvidence(verdict) {
  const flows = (verdict.flows ?? []).map((f) =>
    f.status === 'pass' && !(f.evidence?.length) ? { ...f, status: 'unverified', actual: 'no evidence given' } : f,
  );
  let status = verdict.status;
  if (flows.length === 0) status = 'unverified';
  else if (flows.some((f) => f.status === 'fail')) status = 'fail';
  else if (flows.some((f) => f.status === 'unverified')) status = 'unverified';
  else status = 'pass';
  return { ...verdict, status, flows };
}

export function renderReport(v, meta) {
  const lines = [`Ultimate Tester: ${v.status.toUpperCase()} — ${v.summary}`, ''];
  for (const f of v.flows) {
    lines.push(`- [${f.status}] ${f.name}`);
    if (f.status !== 'pass') {
      if (f.steps?.length) lines.push(`    steps: ${f.steps.join(' → ')}`);
      if (f.expected) lines.push(`    expected: ${f.expected}`);
      if (f.actual) lines.push(`    actual: ${f.actual}`);
    }
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
    .map(([, key, label]) => ({ key: key.toLowerCase(), label: label.trim(), signIn: !/\b(no sign-in|signed[- ]out|not signed in|guest)\b/i.test(label) }));
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
