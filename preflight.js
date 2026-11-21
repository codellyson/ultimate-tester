// Preflight: before Tess spends a run, the engine checks the test setup itself. The app has to start, and each
// saved sign-in has to still get its persona in. A broken setup ends the run as "setup broken", never as a
// failure of the change: nothing about the change is known yet.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runReplays } from './replay.js';

// The app's last error line (or its last line), for "the app didn't start: …".
export function lastWords(log) {
  if (!existsSync(log)) return '';
  const lines = readFileSync(log, 'utf8').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !/^[`\-=*]+$/.test(l));
  return (lines.findLast((l) => /(error|exception)\b|\b(cannot|can't|failed|not found|missing|refused|in use)\b|EADDRINUSE|ENOENT/i.test(l)) ?? lines.at(-1))?.slice(0, 300) ?? '';
}

const SIGN_IN = /(log-?in|sign-?in|auth)\b/i;
// A page only a signed-in persona reaches: one the plan starts that persona's checks on, or where its sign-in
// was saved, whichever isn't itself a sign-in page. None known means no claim about that persona.
export function guardedPage(key, file, plan) {
  const pages = (plan?.mustNeverBreak ?? []).filter((m) => m.as === key).map((m) => m.startAt);
  try { pages.push(new URL(JSON.parse(readFileSync(file, 'utf8')).url).pathname); } catch {}
  return pages.find((p) => p && !SIGN_IN.test(p)) ?? null;
}

// Which personas' saved sign-ins no longer get them in: each opens a page only it can reach, and is sent to a
// sign-in page (right away or after the page loads). A persona without a saved file is "not set up", not signed out.
export async function signedOut(personas, { endpoint, base, runDir, sessionFor, plan }) {
  const scripts = personas.filter((p) => p.signIn && sessionFor(p.key) && existsSync(sessionFor(p.key))).map((p) => ({ p, page: guardedPage(p.key, sessionFor(p.key), plan) }))
    .filter((x) => x.page).map(({ p, page }) => ({
      name: `sign-in ${p.key}`, persona: p.key, key: p.key,
      code: `await as(${JSON.stringify(p.key)}); await page.goto(base + ${JSON.stringify(page)}); const out = await page.waitForURL((u) => ${SIGN_IN}.test(u.pathname), { timeout: 6000 }).then(() => true, () => false); check(!out, 'still signed in');`,
    }));
  if (!scripts.length || !endpoint) return [];
  mkdirSync(join(runDir, 'preflight'), { recursive: true });
  const results = await runReplays(scripts, { endpoint, base, runDir: join(runDir, 'preflight'), sessionFor });
  // Only being sent to sign-in counts; a slow first compile or any other error says nothing about the sign-in.
  return scripts.filter((s) => results.find((r) => r.name === s.name)?.error === 'Expected still signed in').map((s) => s.key);
}

// Why nothing should be tested, or null. Every persona that needs a sign-in being signed out leaves nothing to test as.
export function setupProblem({ app, personas, out, log }) {
  if (!app?.url) return lastWords(log) ? `the app didn't start (its last words: "${lastWords(log)}")` : `the app didn't start: ${app?.error ?? 'no reason given'}`;
  const anyone = personas.filter((p) => !p.signIn);
  const saved = personas.filter((p) => p.signIn);
  if (!anyone.length && saved.length && saved.every((p) => out.includes(p.key))) return `every saved sign-in has stopped working (${saved.map((p) => p.key).join(', ')}); sign in again in Setup`;
  return null;
}
