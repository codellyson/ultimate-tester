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
    app = { id: appId(root), name: basename(root), root, remote: remoteOf(root) };
    apps.push(app);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(apps, null, 2));
  }
  return app;
}

export const findApp = (id) => listApps().find((a) => a.id === id) ?? null;

// A git remote as host/owner/name, no scheme, login or .git: the form a plan's backends use.
// "git@github.com:acme/api.git", "https://user:pw@gitlab.com/acme/api" -> "github.com/acme/api", "gitlab.com/acme/api".
export function normalizeRemote(url) {
  if (!url) return null;
  const m = String(url).trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/](.+?)(?:\.git)?\/?$/i);
  return m ? `${m[1].toLowerCase()}/${m[2]}` : null;
}
const remoteOf = (root) => { try { return normalizeRemote(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { return null; } };

// The app on this Mac whose repo is `repo` (host/owner/name), for linking a frontend to its backends.
export function findAppByRepo(repo) {
  const want = normalizeRemote(repo)?.toLowerCase();
  return want ? listApps().find((a) => a.remote?.toLowerCase() === want) ?? null : null;
}

// Takes an app off the list. Its repo, test plan and saved tests are left where they are.
export function removeApp(id) {
  const apps = listApps();
  if (!apps.some((a) => a.id === id)) throw new Error('No such app');
  writeFileSync(FILE, JSON.stringify(apps.filter((a) => a.id !== id), null, 2));
}

// App-wide settings, for every repo on this Mac: ~/.ultimate-tester/settings.json. Environment variables still win.
const SETTINGS = join(DIR, 'settings.json');
export const DEFAULT_SETTINGS = { model: 'opus', timeoutMin: 12, notifications: true };
export function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS, 'utf8')) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function writeSettings(patch) {
  const next = { ...readSettings() };
  if ('model' in patch) { if (!['opus', 'sonnet'].includes(patch.model)) throw new Error('Choose Opus or Sonnet'); next.model = patch.model; }
  if ('timeoutMin' in patch) { const m = Number(patch.timeoutMin); if (!Number.isInteger(m) || m < 5 || m > 60) throw new Error('Time limit is 5 to 60 minutes'); next.timeoutMin = m; }
  if ('notifications' in patch) next.notifications = !!patch.notifications;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify(next, null, 2));
  return next;
}
