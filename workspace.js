// Isolation: Ultimate Tester never runs anything in your folder. Each app gets copies of its own, kept between
// runs in ~/.ultimate-tester/work: "now" (the code under test) and "before" (the code before the change, for the
// comparison). Each is a git worktree of your repo, reset to exactly the code a run needs, with packages installed
// from that code's own lockfile. Your dev server, your half-made edits and Next.js's one-server-per-folder lock
// never meet a test, and anything a run leaves behind stays in its copy.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { PLAN_FILES } from './plan.js';
import { appId } from './apps.js';

const WORK = join(process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester'), 'work');
const git = (cwd, args, input) => execFileSync('git', args, { cwd, input, encoding: input ? undefined : 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });

export const workDir = (root, which = 'now') => join(WORK, `${appId(root)}-${which}`);

// Packages from the copy's own lockfile; skipped when that lockfile hasn't changed since the last install.
const INSTALL = [['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']], ['yarn.lock', 'yarn', ['install', '--frozen-lockfile']],
  ['package-lock.json', 'npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']], ['bun.lock', 'bun', ['install', '--frozen-lockfile']], ['bun.lockb', 'bun', ['install', '--frozen-lockfile']]];
async function install(dir) {
  const m = INSTALL.find(([lock]) => existsSync(join(dir, lock)));
  if (!m) return;
  const stamp = join(dir, 'node_modules', '.ultimate-tester-installed');
  const hash = createHash('sha256').update(readFileSync(join(dir, m[0]))).digest('hex');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === hash) return;
  try { await promisify(execFile)(m[1], m[2], { cwd: dir, timeout: 15 * 60_000, env: { ...process.env, CI: '1' } }); } catch (e) {
    throw new Error(`installing its packages failed: ${String(e.stderr || e.message).trim().split('\n').pop()}`);
  }
  writeFileSync(stamp, hash);
}

// The copy, made once and reused; remade if it was deleted or broken.
function ensure(root, dir) {
  try { if (existsSync(join(dir, '.git'))) { git(dir, ['status', '--porcelain', '-uno']); return; } } catch {}
  rmSync(dir, { recursive: true, force: true });
  git(root, ['worktree', 'prune']);
  mkdirSync(dirname(dir), { recursive: true });
  git(root, ['worktree', 'add', '--detach', '--force', dir, 'HEAD']);
}

// Sets the copy to `ref` (resolved in your repo), plus your uncommitted changes when `changes` is set, and returns
// its folder. Files git doesn't hold but running needs (the test plan, .env files) come from your folder.
export async function prepare(root, { ref = 'HEAD', changes = false, which = 'now' } = {}) {
  const dir = workDir(root, which);
  ensure(root, dir);
  const sha = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  git(dir, ['checkout', '--detach', '--force', sha]);
  // Everything else goes, except installed packages and build caches, which only make the next start faster.
  git(dir, ['clean', '-fdx', '-e', 'node_modules', '-e', '.next', '-e', '.nuxt', '-e', '.turbo']);
  if (changes) {
    const diff = git(root, ['diff', 'HEAD', '--binary'], '');
    if (diff.length) git(dir, ['apply', '--whitespace=nowarn', '-'], diff);
    for (const f of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) {
      // A folder name (another repo or worktree inside yours) and Ultimate Tester's own state are left out.
      if (!f || f.endsWith('/') || f.startsWith('.ultimate-tester/') || !statSync(join(root, f), { throwIfNoEntry: false })?.isFile()) continue;
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(root, f), join(dir, f));
    }
  }
  for (const f of readdirSync(root)) {
    if ((PLAN_FILES.includes(f) || /^\.env/.test(f)) && statSync(join(root, f)).isFile()) copyFileSync(join(root, f), join(dir, f));
  }
  await install(dir);
  return dir;
}

// When an app is taken off the list, its copies go too.
export function removeWork(root) {
  for (const which of ['now', 'before']) {
    const dir = workDir(root, which);
    try { git(root, ['worktree', 'remove', '--force', dir]); } catch { rmSync(dir, { recursive: true, force: true }); }
  }
}
