import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ULTIMATE_TESTER_HOME = mkdtempSync(join(tmpdir(), 'ut-home-'));
const { prepare, removeWork, workDir, listWork, isCheckout } = await import('../workspace.js');

test("tests run in Ultimate Tester's own copy, set to the code under test; your folder is never touched", async () => {
  const root = mkdtempSync(join(tmpdir(), 'ut-repo-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@example.test'); git('config', 'user.name', 'T');
  writeFileSync(join(root, '.gitignore'), '.env\n.ultimate-tester/\n');
  writeFileSync(join(root, 'app.js'), 'one\n'); git('add', '-A'); git('commit', '-qm', 'one');
  const c1 = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'app.js'), 'two\n'); git('commit', '-qam', 'two');
  // Your folder: an edit, a new file, secrets, the plan, Ultimate Tester's state and another repo inside it.
  writeFileSync(join(root, 'app.js'), 'two, edited\n');
  writeFileSync(join(root, 'new.js'), 'new\n');
  writeFileSync(join(root, '.env'), 'KEY=1\n');
  writeFileSync(join(root, '.ultimate-tester.json'), '{}\n');
  mkdirSync(join(root, '.ultimate-tester', 'runs'), { recursive: true }); writeFileSync(join(root, '.ultimate-tester', 'runs', 'x'), 'x');
  mkdirSync(join(root, 'inner')); execFileSync('git', ['init', '-q'], { cwd: join(root, 'inner') }); writeFileSync(join(root, 'inner', 'f'), 'f');
  const before = git('status', '--porcelain');

  const at1 = await prepare(root, { ref: c1 });
  assert.equal(at1, workDir(root));
  assert.equal(readFileSync(join(at1, 'app.js'), 'utf8'), 'one\n', 'a commit is tested as committed');
  assert.ok(!existsSync(join(at1, 'new.js')), 'without your uncommitted files');
  assert.ok(existsSync(join(at1, '.env')) && existsSync(join(at1, '.ultimate-tester.json')), 'but with the plan and .env it needs to run');

  mkdirSync(join(at1, 'node_modules')); writeFileSync(join(at1, 'node_modules', 'kept'), '');
  const mine = await prepare(root, { changes: true });
  assert.equal(readFileSync(join(mine, 'app.js'), 'utf8'), 'two, edited\n', 'My changes: the last commit plus your edits');
  assert.equal(readFileSync(join(mine, 'new.js'), 'utf8'), 'new\n', 'and your new files');
  assert.ok(!existsSync(join(mine, '.ultimate-tester')) && !existsSync(join(mine, 'inner')), "not Ultimate Tester's state or another repo");
  assert.ok(existsSync(join(mine, 'node_modules', 'kept')), 'installed packages stay between runs');

  await prepare(root, { ref: 'HEAD' });
  assert.ok(!existsSync(join(mine, 'new.js')), 'the next run starts clean');
  const old = await prepare(root, { ref: 'HEAD^', which: 'before' });
  assert.notEqual(old, mine); assert.equal(readFileSync(join(old, 'app.js'), 'utf8'), 'one\n');

  assert.equal(git('status', '--porcelain'), before, 'your folder is exactly as it was');
  assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'two, edited\n');
  removeWork(root);
  assert.ok(!existsSync(mine) && !existsSync(old));
  assert.equal(git('worktree', 'list').split('\n').length, 1);
});

test("an agent's worktree is tested, not the stale main folder", async () => {
  const root = mkdtempSync(join(tmpdir(), 'ut-repo-'));
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 't@example.test'); git(root, 'config', 'user.name', 'T');
  writeFileSync(join(root, 'app.js'), 'old\n'); git(root, 'add', 'app.js'); git(root, 'commit', '-qm', 'old');
  writeFileSync(join(root, '.ultimate-tester.json'), '{"plan":"main"}\n');
  writeFileSync(join(root, '.env'), 'FROM=main\n');
  // The agent's worktree: a newer commit on its branch, an uncommitted edit, a new file, and no .env of its own.
  const wt = join(mkdtempSync(join(tmpdir(), 'ut-wt-')), 'agent');
  git(root, 'worktree', 'add', '-q', '-b', 'agent/fix', wt);
  writeFileSync(join(wt, 'app.js'), 'agent commit\n'); git(wt, 'commit', '-qam', 'agent work');
  writeFileSync(join(wt, 'app.js'), 'agent commit, then edited\n'); writeFileSync(join(wt, 'added.js'), 'added\n');

  const last = await prepare(root, { ref: 'HEAD', from: wt });
  assert.equal(readFileSync(join(last, 'app.js'), 'utf8'), 'agent commit\n', "the worktree's last commit, not main's");
  const mine = await prepare(root, { changes: true, from: wt });
  assert.equal(readFileSync(join(mine, 'app.js'), 'utf8'), 'agent commit, then edited\n', "and the worktree's uncommitted work");
  assert.equal(readFileSync(join(mine, 'added.js'), 'utf8'), 'added\n');
  assert.equal(readFileSync(join(mine, '.ultimate-tester.json'), 'utf8'), '{"plan":"main"}\n', "the app's plan from the main folder");
  assert.equal(readFileSync(join(mine, '.env'), 'utf8'), 'FROM=main\n', ".env from the main folder when the worktree has none");
  assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'old\n', 'neither folder is touched');
  assert.equal(readFileSync(join(wt, 'app.js'), 'utf8'), 'agent commit, then edited\n');
  removeWork(root);
});

test("where the work is: every checkout, newest first, without Ultimate Tester's own copies", async () => {
  const root = mkdtempSync(join(tmpdir(), 'ut-repo-'));
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.email', 't@example.test'); git(root, 'config', 'user.name', 'T');
  writeFileSync(join(root, 'a.js'), 'a\n'); git(root, 'add', 'a.js'); git(root, 'commit', '-qm', 'one', '--date', '2026-01-01T00:00:00');
  execFileSync('git', ['commit', '--amend', '-qm', 'one'], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: '2026-01-01T00:00:00' } });
  writeFileSync(join(root, '.ultimate-tester.json'), '{}'); // the plan isn't "work"
  const wt = join(mkdtempSync(join(tmpdir(), 'ut-wt-')), 'agent');
  git(root, 'worktree', 'add', '-q', '-b', 'agent/x', wt);
  writeFileSync(join(wt, 'b.js'), 'b\n'); writeFileSync(join(wt, 'c.js'), 'c\n');
  await prepare(root); // Ultimate Tester's copy is a worktree too, and must not be listed
  const { folders } = await listWork(root);
  assert.deepEqual(folders.map((f) => [f.branch, f.main, f.uncommitted]), [['agent/x', false, 2], ['main', true, 0]]);
  assert.ok(folders.every((f) => isCheckout(root, f.path)), 'a listed folder can be tested from');
  assert.ok(!isCheckout(root, '/tmp/somewhere-else'));
  removeWork(root);
});
