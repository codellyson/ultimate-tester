// Linked apps: before Tess tests a frontend, start your local copy of each backend its plan names
// (from that backend's own plan, on its own free port) and tell Tess how to point the frontend at it.
// A backend that isn't on this Mac, or won't start, follows the plan's whenMissing: the dev one, or stop.
import { execFileSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { basename, join } from 'node:path';
import { findAppByRepo } from './apps.js';
import { readPlan } from './plan.js';
import { parseStart, withPort } from './lib.js';
import { freePort } from './live.js';

const git = (root, ...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const home = (p) => p.replace(/^\/Users\/[^/]+/, '~');

// Which code a checkout is on: branch, short commit, and whether it has uncommitted changes.
export function checkoutOf(root) {
  return { branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD') || null, commit: git(root, 'rev-parse', '--short', 'HEAD') || null, dirty: !!git(root, 'status', '--porcelain') };
}

async function waitFor(url, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500) return true; } catch {}
  }
  return false;
}

// Starts every linked backend. Returns what the prompt and the result header need, and stop() for afterwards.
// blocked: set when a backend marked whenMissing "stop" can't be used; nothing should be tested then.
export async function startBackends(root, runDir, { start = true } = {}) {
  const plan = readPlan(root);
  const links = plan.format === 'json' ? plan.json.backends ?? [] : [];
  const self = { name: basename(root), role: 'app', ...checkoutOf(root) };
  const procs = [], apps = [self], lines = [], diffs = [];
  let blocked = null;
  for (const b of links) {
    const found = findAppByRepo(b.repo);
    let why = found ? null : `${b.repo} isn't added to Ultimate Tester on this Mac`;
    let url = null;
    if (found && start) {
      const bp = readPlan(found.root);
      if (!bp.format || bp.errors.length) why = `${found.name}'s own test plan is missing or has problems`;
      else {
        const port = await freePort();
        const { command, url: ready } = parseStart(withPort(bp.text, port));
        if (!command || !ready) why = `${found.name}'s test plan has no start command`;
        else {
          const log = openSync(join(runDir, `backend-${b.name}.log`), 'a');
          const { PORT, HOST, NITRO_PORT, NITRO_HOST, ...env } = process.env;
          const child = spawn('sh', ['-c', command], { cwd: found.root, detached: true, stdio: ['ignore', log, log], env });
          procs.push(child);
          const seconds = bp.json?.start?.readySeconds ?? 90;
          if (await waitFor(ready, seconds * 1000)) url = ready.match(/^https?:\/\/[^/]+/)[0];
          else why = `${found.name} didn't answer at ${ready} within ${seconds} seconds (its log: ${join(runDir, `backend-${b.name}.log`)})`;
        }
      }
    }
    const co = found ? checkoutOf(found.root) : {};
    if (url) {
      apps.push({ name: b.name, role: 'backend', source: 'local', where: home(found.root), url, ...co });
      lines.push(`- ${b.name}: your local copy (${home(found.root)}, ${co.branch ?? 'no branch'} @ ${co.commit ?? '?'}${co.dirty ? ', with uncommitted changes' : ''}) is running at ${url}. Start this app with ${b.env}=${url} in its environment, so it calls this copy.`);
      if (co.branch && self.branch && co.branch !== self.branch) lines.push(`  Note: ${b.name} is on ${co.branch}, not ${self.branch}. Say so in the summary.`);
      const d = git(found.root, 'diff', 'HEAD');
      if (d) diffs.push(`### ${b.name} (${co.branch}, uncommitted)\n${d.slice(0, 60_000)}`);
    } else if (b.whenMissing === 'stop') {
      blocked = `${b.name}: ${why ?? 'not started'}. The plan says not to test without it.`;
      apps.push({ name: b.name, role: 'backend', source: 'missing', ...co });
    } else {
      apps.push({ name: b.name, role: 'backend', source: 'dev', why, ...co });
      lines.push(`- ${b.name}: not your local copy (${why}). Leave ${b.env} as it is in the app's env file (the dev backend), and say in the summary that ${b.name} was the dev one, not local code.`);
    }
  }
  const stop = () => { for (const p of procs) { try { process.kill(-p.pid, 'SIGTERM'); } catch {} } };
  if (blocked) stop();
  return { apps, lines, diffs, blocked, stop, linked: links.length > 0 };
}
