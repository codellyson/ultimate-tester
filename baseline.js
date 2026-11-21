// Baseline: a "Must never break" check that failed is repeated by the engine, from Tess's own replay script, on
// the code as it is now and on the code from before the change. Failing on both means it was already broken
// ("known"); failing only now means the change broke it. Checks of the change itself aren't compared: what a
// change adds can't work before it.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAN_FILES } from './plan.js';
import { startOwnApp, runReplays } from './replay.js';
import { startBrowser, freePort } from './live.js';

// The code before the change: a commit's parent, a range's base, or the last commit for uncommitted changes.
export function baselineRef(kind, target) {
  if (kind === 'commit') return `${target}^`;
  if (kind === 'range') return String(target).split('..')[0];
  return 'HEAD';
}

// What a failed check's two replays say about it.
export function judge(now, before) {
  if (!now) return { cause: 'unknown', why: "I couldn't repeat this check with its script." };
  if (now.ok) return { cause: 'unknown', why: "When the engine repeated this check with my script it passed, so I couldn't confirm the failure." };
  if (!before) return { cause: 'unknown', why: "I couldn't run the code from before this change to compare." };
  if (before.ok) return { cause: 'regression', why: 'It passed on the code from before this change, so this change broke it.' };
  // Ports and timings differ between the two copies; anything else that differs is a different failure.
  const same = (e) => String(e ?? '').replace(/\d+/g, '#');
  if (same(now.error) !== same(before.error)) return { cause: 'unknown', why: `It failed on the code from before this change too, but differently, so I can't say whether this change caused it (now: ${now.error}; before: ${before.error}).` };
  return { cause: 'known', why: `It failed on the code from before this change too, so this change didn't cause it (${before.error}).` };
}

// Installs the packages that commit's own lockfile names (they may differ from today's). A linked node_modules
// isn't enough: bundlers like Turbopack refuse packages from outside the folder they build.
const INSTALL = [['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']], ['yarn.lock', 'yarn', ['install', '--frozen-lockfile']],
  ['package-lock.json', 'npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']], ['bun.lock', 'bun', ['install', '--frozen-lockfile']], ['bun.lockb', 'bun', ['install', '--frozen-lockfile']]];
async function install(dir) {
  const m = INSTALL.find(([lock]) => existsSync(join(dir, lock)));
  if (!m) return;
  await promisify(execFile)(m[1], m[2], { cwd: dir, timeout: 10 * 60_000, env: { ...process.env, CI: '1' } });
}

// The code before the change in a folder of its own, with what running it needs but git doesn't hold.
async function checkout(root, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'ut-baseline-'));
  execFileSync('git', ['worktree', 'add', '--detach', '--force', dir, ref], { cwd: root, stdio: 'ignore' });
  for (const f of readdirSync(root)) {
    if ((PLAN_FILES.includes(f) || /^\.env/.test(f)) && !existsSync(join(dir, f)) && statSync(join(root, f)).isFile()) copyFileSync(join(root, f), join(dir, f));
  }
  const remove = () => { try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'ignore' }); } catch { rmSync(dir, { recursive: true, force: true }); } };
  if (existsSync(join(root, 'package.json'))) {
    try { await install(dir); } catch (e) { remove(); throw new Error(`installing its packages failed: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
  }
  return { dir, remove };
}

// flows: the verdict's flows. now: { url } of a copy of the app already running this run's code, if any.
// Returns the flows with each compared failure turned into "known" or kept as "fail", with cause and why.
export async function compareFailures(root, flows, { kind, target, runDir, env = {}, backends = {}, sessionFor, ownBuild, say = () => {} }) {
  const failed = flows.filter((f) => f.status === 'fail' && f.source === 'must-never-break');
  if (!failed.length) return flows;
  const scripts = failed.filter((f) => f.replay?.trim()).map((f) => ({ name: f.name, source: f.source, persona: f.persona ?? null, code: f.replay }));
  const nowRes = new Map(), beforeRes = new Map();
  const stops = [];
  if (scripts.length) {
    say(`${scripts.length === 1 ? 'One check that must never break' : `${scripts.length} checks that must never break`} failed. I'm repeating ${scripts.length === 1 ? 'it' : 'them'} on the code from before this change, to see whether this change caused ${scripts.length === 1 ? 'it' : 'them'}.`);
    const browser = await startBrowser(runDir);
    if (browser) stops.push(() => browser.stop());
    let base = null;
    try { base = await checkout(root, baselineRef(kind, target)); stops.push(base.remove); } catch (e) { say(`I couldn't set up the code from before this change: ${e.message}.`); }
    try {
      const dirs = { now: join(runDir, 'recheck-now'), before: join(runDir, 'recheck-before') };
      mkdirSync(dirs.now, { recursive: true }); mkdirSync(dirs.before, { recursive: true });
      // Each check on freshly started copies: one check's failure (a dev server stuck on a build error) can't spoil the next.
      const once = async (where, dir, script, res, extra) => {
        const app = await startOwnApp(where, await freePort(), dir, env, extra);
        try { if (app?.url) for (const r of await runReplays([script], { endpoint: browser.endpoint, backends, runDir: dir, sessionFor, base: app.url })) res.set(r.name, r); }
        finally { app?.stop?.(); }
      };
      if (browser) for (const s of scripts) {
        await once(root, dirs.now, s, nowRes, ownBuild);
        if (base && nowRes.get(s.name)?.ok === false) await once(base.dir, dirs.before, s, beforeRes);
      }
    } catch (e) { say(`I couldn't finish the comparison (${String(e.message).split('\n')[0]}).`); }
    finally { for (const s of stops.reverse()) { try { await s(); } catch {} } }
  }
  return flows.map((f) => {
    if (!failed.includes(f)) return f;
    const j = f.replay?.trim() ? judge(nowRes.get(f.name), beforeRes.get(f.name)) : { cause: 'unknown', why: 'I had no script to repeat this check with.' };
    return { ...f, status: j.cause === 'known' ? 'known' : 'fail', cause: j.cause, causeWhy: j.why };
  });
}
