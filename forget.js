// Removing an app forgets it: everything Ultimate Tester stored for it goes, so adding it back starts fresh.
// That's its test history, saved replays, known problems and sign-ins (.ultimate-tester/), its own copies of the
// app, the hooks it installed, and the test plan unless the plan is committed to the repo.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withoutOurStopHook } from './lib.js';
import { PLAN_FILES } from './plan.js';
import { removeWork } from './workspace.js';

const CLAUDE_FILES = [join('.claude', 'settings.local.json'), join('.claude', 'settings.json')];
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// The Claude Code Stop hook and the post-commit hook Ultimate Tester added; everyone else's stay.
// which: "stop", "commit", or both when not given. Returns what it removed, for the CLI to report.
export function removeHooks(root, which) {
  const done = [];
  if (which !== 'commit') {
    for (const rel of CLAUDE_FILES) {
      const f = join(root, rel);
      if (!existsSync(f)) continue;
      const before = JSON.parse(readFileSync(f, 'utf8'));
      const after = withoutOurStopHook(before);
      if (JSON.stringify(after) !== JSON.stringify(before)) { writeFileSync(f, JSON.stringify(after, null, 2) + '\n'); done.push(`Stop hook from ${rel}`); }
    }
  }
  if (which === 'stop') return done;
  let hookFile;
  try { hookFile = join(resolve(root, git(root, 'rev-parse', '--git-path', 'hooks')), 'post-commit'); } catch { return done; }
  if (existsSync(hookFile) && readFileSync(hookFile, 'utf8').includes('# ultimate-tester')) {
    writeFileSync(hookFile, readFileSync(hookFile, 'utf8').split('\n').filter((l) => !l.includes('# ultimate-tester')).join('\n'));
    done.push(`background run from ${hookFile}`);
  }
  return done;
}

const tracked = (root, f) => { try { git(root, 'ls-files', '--error-unmatch', f); return true; } catch { return false; } };

export function forgetApp(root) {
  removeWork(root);
  removeHooks(root);
  rmSync(join(root, '.ultimate-tester'), { recursive: true, force: true });
  for (const f of PLAN_FILES) if (existsSync(join(root, f)) && !tracked(root, f)) rmSync(join(root, f), { force: true });
}
