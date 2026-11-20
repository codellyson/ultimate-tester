import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway home, so the real ~/.ultimate-tester is never touched.
const home = mkdtempSync(join(tmpdir(), 'ut-home-'));
process.env.ULTIMATE_TESTER_HOME = home;
const { addApp, findAppByRepo, normalizeRemote, appId } = await import('../apps.js');
const { validate } = await import('../plan.js');
const appsSchema = JSON.parse(readFileSync(new URL('../schema/apps.schema.json', import.meta.url), 'utf8'));

const repo = (name, remote) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ut-repo-')), name);
  mkdirSync(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (remote) execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim();
};

test('git addresses are reduced to host/owner/name', () => {
  assert.equal(normalizeRemote('git@github.com:acme/api.git'), 'github.com/acme/api');
  assert.equal(normalizeRemote('https://user:secret@gitlab.com/acme/group/api.git'), 'gitlab.com/acme/group/api');
  assert.equal(normalizeRemote('ssh://git@github.com/acme/api.git'), 'github.com/acme/api');
  assert.equal(normalizeRemote(''), null);
});

test("a plan's backend is found among this Mac's apps by its git address", () => {
  const web = repo('shop-web', 'git@github.com:acme/shop-web.git');
  const api = repo('orders-api', 'https://deploy:token@github.com/acme/orders-api.git');
  addApp(web);
  addApp(api);
  assert.equal(findAppByRepo('github.com/acme/orders-api')?.root, api);
  assert.equal(findAppByRepo('github.com/acme/nope'), null);
  const saved = JSON.parse(readFileSync(join(home, 'apps.json'), 'utf8'));
  assert.deepEqual(validate(saved, appsSchema), []);
  assert.ok(!JSON.stringify(saved).includes('token'), 'logins in a remote are never stored');
});

test('apps added before remotes were recorded get theirs on first lookup', () => {
  const old = repo('legacy-api', 'git@gitlab.com:acme/legacy-api.git');
  const list = JSON.parse(readFileSync(join(home, 'apps.json'), 'utf8'));
  list.push({ id: appId(old), name: 'legacy-api', root: old });
  writeFileSync(join(home, 'apps.json'), JSON.stringify(list));
  assert.equal(findAppByRepo('gitlab.com/acme/legacy-api')?.root, old);
  const saved = JSON.parse(readFileSync(join(home, 'apps.json'), 'utf8'));
  assert.equal(saved.find((a) => a.root === old).remote, 'gitlab.com/acme/legacy-api');
  assert.deepEqual(validate(saved, appsSchema), []);
});
