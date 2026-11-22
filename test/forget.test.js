import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ULTIMATE_TESTER_HOME = mkdtempSync(join(tmpdir(), 'ut-home-'));
const { forgetApp } = await import('../forget.js');
const { prepare, workDir } = await import('../workspace.js');

const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'ut-repo-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@example.test'); git('config', 'user.name', 'T');
  writeFileSync(join(root, 'app.js'), 'x\n'); git('add', 'app.js'); git('commit', '-qm', 'one');
  return { root, git };
};

test("removing an app forgets everything Ultimate Tester stored, and leaves your code and others' hooks", async () => {
  const { root, git } = repo();
  mkdirSync(join(root, '.ultimate-tester', 'runs', 'r1'), { recursive: true }); writeFileSync(join(root, '.ultimate-tester', 'known.json'), '{}');
  writeFileSync(join(root, '.ultimate-tester.json'), '{}\n');
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /x/ultimate-tester.js hook' }, { type: 'command', command: 'echo mine' }] }] } }));
  const hook = join(root, '.git', 'hooks', 'post-commit');
  writeFileSync(hook, '#!/bin/sh\necho mine\nnode /x/ultimate-tester.js run --commit & # ultimate-tester\n');
  await prepare(root);
  assert.ok(existsSync(workDir(root)));

  forgetApp(root);
  assert.ok(!existsSync(join(root, '.ultimate-tester')), 'history, replays, known problems, sign-ins: gone');
  assert.ok(!existsSync(join(root, '.ultimate-tester.json')), 'an uncommitted plan: gone');
  assert.ok(!existsSync(workDir(root)), "Ultimate Tester's copy: gone");
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8')).hooks.Stop[0].hooks.map((h) => h.command), ['echo mine']);
  assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\necho mine\n');
  assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'x\n', 'your code is untouched');
  assert.equal(git('worktree', 'list').split('\n').length, 1);
});

test('a test plan committed to the repo stays', () => {
  const { root, git } = repo();
  writeFileSync(join(root, '.ultimate-tester.json'), '{}\n'); git('add', '.ultimate-tester.json'); git('commit', '-qm', 'plan');
  forgetApp(root);
  assert.ok(existsSync(join(root, '.ultimate-tester.json')));
  assert.equal(git('status', '--porcelain'), '');
});
