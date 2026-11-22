import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'ut-started-'));
process.env.ULTIMATE_TESTER_HOME = home;
const { recordStarted, forgetStarted, clearLeftovers } = await import('../started.js');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const app = (mark) => { const c = spawn('sh', ['-c', `sleep 60; echo ${mark}`], { detached: true, stdio: 'ignore' }); c.unref(); return c.pid; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("a run's leftover app is stopped once its owner is gone; others are left alone", async () => {
  const dead = spawnSync('true').pid; // a process that has already exited
  const leftover = app('ut-mark-4101'), mine = app('ut-mark-4102'), reused = app('something-else');
  recordStarted(mine, 'ut-mark-4102');
  const list = JSON.parse(readFileSync(join(home, 'started.json'), 'utf8'));
  writeFileSync(join(home, 'started.json'), JSON.stringify([...list,
    { pgid: leftover, mark: 'ut-mark-4101', owner: dead },
    { pgid: reused, mark: 'ut-mark-4199', owner: dead }, // the pid now runs something we didn't start
  ]));
  assert.equal(clearLeftovers(), 1);
  await wait(300);
  assert.ok(!alive(leftover), 'the orphan is stopped');
  assert.ok(alive(mine), "an app whose owner (this run) is alive keeps running");
  assert.ok(alive(reused), "a reused pid running something else isn't touched");
  assert.deepEqual(JSON.parse(readFileSync(join(home, 'started.json'), 'utf8')).map((e) => e.pgid), [mine]);
  forgetStarted(mine);
  for (const p of [mine, reused]) { try { process.kill(-p, 'SIGTERM'); } catch {} }
});
