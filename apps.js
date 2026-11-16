// The apps Ultimate Tester knows about: ~/.ultimate-tester/apps.json, one entry per repo.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const DIR = process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester');
const FILE = join(DIR, 'apps.json');

export function listApps() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')).filter((a) => existsSync(a.root)); } catch { return []; }
}

export const appId = (root) => `${basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${createHash('sha256').update(root).digest('hex').slice(0, 6)}`;

// Adds a repo (any folder inside it works) and returns its entry; refuses folders that are not git repos.
export function addApp(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('Choose a folder');
  let root;
  try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: resolve(path.replace(/^~/, homedir())), encoding: 'utf8' }).trim(); } catch {
    throw new Error('That folder is not inside a git repository');
  }
  const apps = listApps();
  let app = apps.find((a) => a.root === root);
  if (!app) {
    app = { id: appId(root), name: basename(root), root };
    apps.push(app);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(apps, null, 2));
  }
  return app;
}

export const findApp = (id) => listApps().find((a) => a.id === id) ?? null;
