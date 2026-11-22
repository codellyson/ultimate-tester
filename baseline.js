// Baseline: a "Must never break" check that failed is repeated by the engine, from Tess's own replay script, on
// the code as it is now and on the code from before the change. Failing on both means it was already broken
// ("known"); failing only now means the change broke it. Checks of the change itself aren't compared: what a
// change adds can't work before it.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startOwnApp, runReplays } from './replay.js';
import { prepare } from './workspace.js';
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
  // A timeout says a page was slow, not what was wrong with it: no claim either way.
  const slow = (r) => /Timeout \d+ms exceeded|took longer than/i.test(r.error ?? '');
  if (slow(now) || slow(before)) return { cause: 'unknown', why: `A page was too slow to tell (${slow(now) ? now.error : before.error}), so I can't say whether this change caused it.` };
  if (before.ok) return { cause: 'regression', why: 'It passed on the code from before this change, so this change broke it.' };
  // Ports and timings differ between the two copies; anything else that differs is a different failure.
  const same = (e) => String(e ?? '').replace(/\d+/g, '#');
  if (same(now.error) !== same(before.error)) return { cause: 'unknown', why: `It failed on the code from before this change too, but differently, so I can't say whether this change caused it (now: ${now.error}; before: ${before.error}).` };
  return { cause: 'known', why: `It failed on the code from before this change too, so this change didn't cause it (${before.error}).` };
}

// flows: the verdict's flows. nowDir: the folder holding the code under test (Ultimate Tester's own copy).
// Returns the flows with each compared failure turned into "known" or kept as "fail", with cause and why.
export async function compareFailures(root, flows, { kind, target, runDir, nowDir = root, env = {}, backends = {}, sessionFor, ownBuild, say = () => {} }) {
  const failed = flows.filter((f) => f.status === 'fail' && f.source === 'must-never-break');
  if (!failed.length) return flows;
  const scripts = failed.filter((f) => f.replay?.trim()).map((f) => ({ name: f.name, source: f.source, persona: f.persona ?? null, code: f.replay }));
  const nowRes = new Map(), beforeRes = new Map();
  const stops = [];
  if (scripts.length) {
    say(`${scripts.length === 1 ? 'One check that must never break' : `${scripts.length} checks that must never break`} failed. I'm repeating ${scripts.length === 1 ? 'it' : 'them'} on the code from before this change, to see whether this change caused ${scripts.length === 1 ? 'it' : 'them'}.`);
    // Its own Chrome profile: the run's browser may still hold the run folder's one.
    mkdirSync(join(runDir, 'recheck'), { recursive: true });
    const browser = await startBrowser(join(runDir, 'recheck'));
    if (browser) stops.push(() => browser.stop());
    let base = null;
    try { base = { dir: await prepare(root, { ref: baselineRef(kind, target), which: 'before' }) }; } catch (e) { say(`I couldn't set up the code from before this change: ${String(e.message).split('\n')[0]}.`); }
    try {
      const dirs = { now: join(runDir, 'recheck-now'), before: join(runDir, 'recheck-before') };
      mkdirSync(dirs.now, { recursive: true }); mkdirSync(dirs.before, { recursive: true });
      // Each check on freshly started copies: one check's failure (a dev server stuck on a build error) can't spoil the next.
      // Each copy is freshly started and compiles each page on its first visit: allow it time.
      const once = async (where, dir, script, res, extra) => {
        const app = await startOwnApp(where, await freePort(), dir, env, extra);
        try { if (app?.url) for (const r of await runReplays([script], { endpoint: browser.endpoint, backends, runDir: dir, sessionFor, base: app.url, stepMs: 60_000, replayMs: 180_000 })) res.set(r.name, r); }
        finally { await app?.stop?.(); }
      };
      if (browser) for (const s of scripts) {
        await once(nowDir, dirs.now, s, nowRes, ownBuild);
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
