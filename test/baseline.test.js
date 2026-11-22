import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Ultimate Tester's own copies go in a throwaway home, not the real ~/.ultimate-tester.
process.env.ULTIMATE_TESTER_HOME = mkdtempSync(join(tmpdir(), 'ut-home-'));
const { baselineRef, judge, compareFailures } = await import('../baseline.js');
const { CHROME, startBrowser } = await import('../live.js');

test('the code before a change', () => {
  assert.equal(baselineRef('commit', 'abc123'), 'abc123^');
  assert.equal(baselineRef('range', 'v1.0..HEAD'), 'v1.0');
  assert.equal(baselineRef('changes', null), 'HEAD');
});

test('judging a failed check from its two replays', () => {
  assert.equal(judge({ ok: false, error: 'Expected /pre on :4100' }, { ok: false, error: 'Expected /pre on :5200' }).cause, 'known');
  assert.equal(judge({ ok: false, error: 'Expected a form' }, { ok: false, error: 'Expected the list' }).cause, 'unknown', 'failing differently before is no proof');
  assert.equal(judge({ ok: false, error: 'page.goto: Timeout 10000ms exceeded.' }, { ok: false, error: 'page.goto: Timeout 10000ms exceeded.' }).cause, 'unknown', 'two timeouts are no proof');
  assert.equal(judge({ ok: false, error: 'took longer than 60s' }, { ok: true }).cause, 'unknown', 'a slow page is no regression either');
  assert.equal(judge({ ok: false }, { ok: true }).cause, 'regression');
  assert.equal(judge({ ok: true }, { ok: true }).cause, 'unknown', "a script that passes now didn't reproduce the failure");
  assert.equal(judge({ ok: false }, undefined).cause, 'unknown', 'no run before the change: no claim');
  assert.equal(judge(undefined, { ok: false }).cause, 'unknown');
});

// Planted cases: a tiny app in git. c0 won't start, c1 has a bug on /pre, c2 (the change) breaks /reg.
const server = (routes) => `require('http').createServer((q, s) => { const r = ${JSON.stringify(routes)}[q.url]; s.writeHead(r ?? 404); s.end(String(r ?? 404)); }).listen(process.env.PORT);\n`;
const get = (path) => `const r = await request('GET', '${path}'); check(r.status === 200, '${path} answers 200');`;

test('failures are sorted into already broken, broken by the change, and unconfirmed', { skip: !CHROME && 'needs Chrome', timeout: 180_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ut-planted-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@example.test'); git('config', 'user.name', 'T');
  const commit = (body, msg) => { writeFileSync(join(root, 'server.js'), body); git('add', 'server.js'); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
  const c0 = commit('this is not javascript\n', 'broken build');
  const c1 = commit(server({ '/health': 200, '/pre': 500, '/reg': 200, '/fine': 200 }), 'app with a bug on /pre');
  const c2 = commit(server({ '/health': 200, '/pre': 500, '/reg': 500, '/fine': 200 }), 'the change: breaks /reg');
  // The plan is untracked, as it often is: the copy from before the change must get it too.
  writeFileSync(join(root, '.ultimate-tester.md'), '# Test plan\n\n## Start\n- Command: `PORT=4100 node server.js`\n- Ready: http://localhost:4100/health\n');

  const flows = [
    { name: 'pre', source: 'must-never-break', status: 'fail', replay: get('/pre') },
    { name: 'reg', source: 'must-never-break', status: 'fail', replay: get('/reg') },
    { name: 'fine', source: 'must-never-break', status: 'fail', replay: get('/fine') },
    { name: 'no script', source: 'must-never-break', status: 'fail' },
    { name: 'new feature', source: 'diff', status: 'fail', replay: get('/new') },
    { name: 'ok', source: 'must-never-break', status: 'pass' },
  ];
  const by = (fs) => Object.fromEntries(fs.map((f) => [f.name, f]));

  // As in a real run, the run's own browser is still open on the run folder.
  const runDir = mkdtempSync(join(tmpdir(), 'ut-run-'));
  const runBrowser = await startBrowser(runDir);
  const a = by(await compareFailures(root, flows, { kind: 'commit', target: c2, runDir }).finally(() => runBrowser?.stop()));
  assert.equal(a.pre.status, 'known'); assert.equal(a.pre.cause, 'known');
  assert.equal(a.reg.status, 'fail'); assert.equal(a.reg.cause, 'regression');
  assert.equal(a.fine.cause, 'unknown'); assert.equal(a.fine.status, 'fail', "an unconfirmed failure stays a failure");
  assert.equal(a['no script'].cause, 'unknown');
  assert.equal(a['new feature'].cause, undefined, "a check of the change itself isn't compared");
  assert.equal(a.ok.cause, undefined);

  // The code before c1 won't start: no claim either way.
  const b = by(await compareFailures(root, flows, { kind: 'commit', target: c1, runDir: mkdtempSync(join(tmpdir(), 'ut-run-')) }));
  assert.equal(b.pre.cause, 'unknown'); assert.equal(b.pre.status, 'fail');
  assert.match(b.pre.causeWhy, /before this change/);

  assert.ok(c0);
  assert.equal(git('worktree', 'list').split('\n').length, 2, 'the copy from before the change is kept for next time, apart from your folder');
});
