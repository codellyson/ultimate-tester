// What a run starts (your app, linked backends, Tess, her Chrome) runs in process groups of their own or apart, so they outlive the run
// that started them if it dies without cleaning up: stopped mid-replay, killed by a quit or an update. A leftover
// dev server then blocks every later run (Next.js allows one per folder). Each one is recorded here with the
// process that owns it; the next run stops those whose owner is gone.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const FILE = join(process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester'), 'started.json');
const read = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } };
const write = (list) => { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n'); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Still the process we started (a pid can be reused once a process is gone): running in the folder we started it
// in, or with our mark in its command line.
const out = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
const ours = (e) => (e.cwd ? out('lsof', ['-a', '-p', String(e.pgid), '-d', 'cwd', '-Fn']).split('\n').includes(`n${e.cwd}`) : out('ps', ['-o', 'command=', '-p', String(e.pgid)]).includes(e.mark));

// mark: text its command line contains, to recognise it later; cwd: the folder it runs in, which is surer.
// group: false for a single process (Chrome), which is stopped on its own rather than with its process group.
export function recordStarted(pgid, mark, { group = true, cwd } = {}) { write([...read().filter((e) => e.pgid !== pgid), { pgid, mark: String(mark), cwd, group, owner: process.pid, at: new Date().toISOString() }]); }
const kill = (e) => { try { process.kill(e.group === false ? e.pgid : -e.pgid, 'SIGTERM'); return true; } catch { return false; } };
export function forgetStarted(pgid) { write(read().filter((e) => e.pgid !== pgid)); }

// Stops recorded apps whose owner has died. Returns how many it stopped.
export function clearLeftovers() {
  let n = 0;
  const keep = read().filter((e) => {
    if (alive(e.owner)) return true;
    if (alive(e.pgid) && ours(e) && kill(e)) n++;
    return false;
  });
  write(keep);
  return n;
}

// Stops every app this process started (on Stop, before exiting).
export function stopOwnStarted() {
  for (const e of read().filter((x) => x.owner === process.pid)) kill(e);
  write(read().filter((x) => x.owner !== process.pid));
}
