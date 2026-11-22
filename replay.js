// Replay: checks Tess has done before, rerun by the engine from the scripts she wrote, with no Claude call.
// A replay is one small file per check in the repo's .ultimate-tester/replays/ (git-ignored, this Mac only).
// Playwright isn't shipped with the app; the first replay installs it once (a few MB) into ~/.ultimate-tester/replay.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, openSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPlan } from './plan.js';
import { parseStart, withPort } from './lib.js';
import { useSession } from './live.js';
import { recordStarted, forgetStarted } from './started.js';

const HOME = process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester');
const PW_DIR = join(HOME, 'replay');
const PW = 'playwright-core@1.65.1';
const STEP_MS = 10_000, REPLAY_MS = 60_000;

export const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'check';
const dirOf = (root) => join(root, '.ultimate-tester', 'replays');

// Saved replays for this repo: { name, source, persona, code, run, at }.
export function listReplays(root) {
  const dir = dirOf(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
// Tess's replays from a finished test: a check she did gets its script saved (a newer one replaces the old).
export function saveReplays(root, flows, runId) {
  const dir = dirOf(root);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of flows ?? []) {
    if (!f.replay?.trim() || f.status === 'unverified' || f.replayed) continue;
    writeFileSync(join(dir, `${slug(f.name)}.json`), JSON.stringify({ name: f.name, source: f.source ?? null, persona: f.persona ?? null, code: f.replay, run: runId, at: new Date().toISOString() }, null, 2));
    n++;
  }
  return n;
}
export function dropReplay(root, name) { rmSync(join(dirOf(root), `${slug(name)}.json`), { force: true }); }

function install() {
  return new Promise((resolve, reject) => {
    mkdirSync(PW_DIR, { recursive: true });
    if (!existsSync(join(PW_DIR, 'package.json'))) writeFileSync(join(PW_DIR, 'package.json'), '{ "name": "ultimate-tester-replay", "private": true }\n');
    const child = spawn('npm', ['install', PW, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: PW_DIR, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`npm couldn't install Playwright for replays: ${err.trim().split('\n').pop() || `exit ${code}`}`))));
  });
}
async function playwright() {
  if (!existsSync(join(PW_DIR, 'node_modules', 'playwright-core'))) await install();
  const req = createRequire(join(PW_DIR, 'package.json'));
  return (await import(pathToFileURL(req.resolve('playwright-core')).href)).default ?? (await import(pathToFileURL(req.resolve('playwright-core')).href));
}

async function waitFor(url, ms, gone = () => false) {
  for (const end = Date.now() + ms; Date.now() < end && !gone(); await new Promise((r) => setTimeout(r, 1000))) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500) return true; } catch {}
  }
  return false;
}

// Starts this repo's app on `port` for replays (and for Tess afterwards), the way its plan says.
// env: settings for linked backends. Retries a Nuxt app with its own build folder when your copy holds the lock.
export async function startOwnApp(root, port, runDir, env = {}, ownBuild = null) {
  const plan = readPlan(root);
  const { command, url } = parseStart(withPort(plan.text, port));
  if (!command || !url) return { error: 'the plan has no start command' };
  const log = join(runDir, 'app.log');
  const { PORT, HOST, NITRO_PORT, NITRO_HOST, ...rest } = process.env;
  // Started as a person would start it: tools that act differently for an AI agent (Next.js stops to show
  // an upgrade notice) see none, even when the engine itself runs under Claude Code.
  const base = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(AI_AGENT|CLAUDECODE|CLAUDE_CODE_.*)$/.test(k)));
  const start = (cmd) => new Promise((resolve) => {
    const out = openSync(log, 'a');
    const child = spawn('sh', ['-c', cmd], { cwd: root, detached: true, stdio: ['ignore', out, out], env: { ...base, ...env } });
    recordStarted(child.pid, port, { cwd: realpathSync(root) });
    let exited = false;
    child.on('exit', () => { exited = true; resolve({ child, ok: false }); });
    waitFor(url, (plan.json?.start?.readySeconds ?? 120) * 1000, () => exited).then((ok) => resolve({ child, ok }));
  });
  let r = await start(command);
  if (!r.ok && ownBuild && /Another Nuxt (dev server|build) is already|NUXT_IGNORE_LOCK/i.test(readFileSync(log, 'utf8'))) r = await start(`${command} --extends ${JSON.stringify(ownBuild)}`);
  // Resolves once the app's whole process group is gone, so another copy can start from the same folder.
  const stop = async () => {
    forgetStarted(r.child.pid);
    try { process.kill(-r.child.pid, 'SIGTERM'); } catch { return; }
    for (let i = 0; i < 50; i++) { try { process.kill(-r.child.pid, 0); } catch { return; } await new Promise((ok) => setTimeout(ok, 200)); }
  };
  if (!r.ok) { stop(); return { error: `the app didn't start (its output is in ${log})` }; }
  return { url: url.match(/^https?:\/\/[^/]+/)[0], stop, pid: r.child.pid };
}

// Runs replays in the test's browser. Each gets a fresh page, its persona's sign-in, and a screenshot at the end.
// Returns one result per replay: { name, source, persona, ok, notes, error, shot }.
// stepMs/replayMs: a freshly started dev server compiles each page on its first visit, so callers using one allow longer.
export async function runReplays(replays, { endpoint, base, backends = {}, runDir, sessionFor, onEach, stepMs = STEP_MS, replayMs = REPLAY_MS }) {
  const { chromium } = await playwright();
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] ?? await browser.newContext();
  const results = [];
  for (const r of replays) {
    const notes = [];
    const page = await context.newPage();
    page.setDefaultTimeout(stepMs);
    const shot = `replay-${slug(r.name)}.png`;
    const helpers = {
      page, base, notes,
      as: async (key) => { await useSession(endpoint, sessionFor(key)); },
      see: async (locator, what) => { await locator.first().waitFor({ state: 'visible' }); notes.push(`Saw ${what}.`); },
      check: (ok, what) => { if (!ok) throw new Error(`Expected ${what}`); notes.push(`Checked ${what}.`); },
      // A check against a linked backend names it: request('GET', '/notes', null, 'notes-api').
      request: async (method, path, body, app) => {
        const to = app ? backends[app] : base;
        if (!to) throw new Error(`No running backend called "${app}"`);
        const res = await fetch(to + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
        const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
        notes.push(`${method} ${path} → ${res.status}`);
        return { status: res.status, json, text };
      },
    };
    let error = null;
    const file = join(runDir, `replay-${slug(r.name)}.mjs`);
    try {
      writeFileSync(file, r.code.includes('export default') ? r.code : `export default async ({ page, base, as, see, check, request }) => {\n${r.code}\n};\n`);
      const fn = (await import(pathToFileURL(file).href + `?t=${Date.now()}`)).default;
      let timer;
      try { await Promise.race([fn(helpers), new Promise((_, no) => { timer = setTimeout(() => no(new Error(`took longer than ${replayMs / 1000}s`)), replayMs); })]); } finally { clearTimeout(timer); }
    } catch (e) { error = e.message.split('\n')[0].slice(0, 400); }
    try { await page.screenshot({ path: join(runDir, shot) }); } catch {}
    const res = { name: r.name, source: r.source, persona: r.persona, ok: !error, notes, error, shot };
    results.push(res);
    onEach?.(res);
    await page.close().catch(() => {});
  }
  await browser.close().catch(() => {}); // disconnects only; the test browser keeps running for Tess
  return results;
}
