import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lastWords, setupProblem, signedOut, guardedPage } from '../preflight.js';
import { startBrowser, CHROME } from '../live.js';

const dir = () => mkdtempSync(join(tmpdir(), 'ut-pre-'));

test("an app that didn't start is a broken setup, with its last words", () => {
  const d = dir();
  writeFileSync(join(d, 'app.log'), '\x1b[32m▲ Next.js\x1b[0m\nError: Cannot find module \'next\'\n\n```\n');
  assert.equal(lastWords(join(d, 'app.log')), "Error: Cannot find module 'next'");
  writeFileSync(join(d, 'node.log'), 'server.js:1\nthis is not javascript\nSyntaxError: Unexpected identifier \'is\'\n    at wrapSafe (node:internal)\n\nNode.js v22.23.2\n');
  assert.equal(lastWords(join(d, 'node.log')), "SyntaxError: Unexpected identifier 'is'", 'the error, not the version line after it');
  assert.match(setupProblem({ app: { error: 'x' }, personas: [], out: [], log: join(d, 'app.log') }), /didn't start.*Cannot find module/);
});

test('signed-out personas break the setup only when no one is left to test as', () => {
  const app = { url: 'http://localhost:1' };
  const merchant = { key: 'merchant', signIn: true }, admin = { key: 'admin', signIn: true }, visitor = { key: 'visitor', signIn: false };
  assert.match(setupProblem({ app, personas: [merchant, admin], out: ['merchant', 'admin'] }), /every saved sign-in.*merchant, admin/);
  assert.equal(setupProblem({ app, personas: [merchant, admin], out: ['merchant'] }), null);
  assert.equal(setupProblem({ app, personas: [merchant, visitor], out: ['merchant'] }), null, 'the visitor can still be tested');
  assert.equal(setupProblem({ app, personas: [merchant], out: [] }), null);
});

test('the page that proves a sign-in is one only that persona reaches', () => {
  const d = dir(), f = join(d, 'm.json');
  writeFileSync(f, JSON.stringify({ url: 'http://localhost:6000/login' }));
  const plan = { mustNeverBreak: [{ check: 'Sign in', as: 'merchant', startAt: '/login' }, { check: 'Products', as: 'merchant', startAt: '/dashboard/products' }] };
  assert.equal(guardedPage('merchant', f, plan), '/dashboard/products');
  assert.equal(guardedPage('merchant', f, {}), null, 'only a sign-in page known: no claim');
  assert.equal(guardedPage('admin', f, plan), null);
});

// Planted cases: /dashboard sends you to /login unless your cookie is good; /home does it from the page after it loads.
test('a saved sign-in that lands on the sign-in page is found signed out', { skip: !CHROME && 'needs Chrome', timeout: 120_000 }, async () => {
  const server = createServer((q, s) => {
    const ok = /s=ok/.test(q.headers.cookie ?? '');
    if (q.url === '/dashboard' && !ok) { s.writeHead(302, { location: '/login' }); return s.end(); }
    s.writeHead(200, { 'content-type': 'text/html' });
    s.end(q.url === '/home' && !ok ? '<script>setTimeout(() => location.href = "/login", 800)</script>' : `<h1>${q.url}</h1>`);
  }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const d = dir();
  const save = (key, value, path) => { const f = join(d, `${key}.json`); writeFileSync(f, JSON.stringify({ url: `${base}${path}`, cookies: [{ name: 's', value, domain: 'localhost', path: '/' }] })); return f; };
  const files = { alice: save('alice', 'ok', '/dashboard'), bob: save('bob', 'expired', '/dashboard'), eve: save('eve', 'expired', '/home'), dan: save('dan', 'expired', '/login') };
  const personas = ['alice', 'bob', 'carol', 'dan', 'eve'].map((key) => ({ key, signIn: true })).concat({ key: 'visitor', signIn: false });
  const browser = await startBrowser(d);
  try {
    const out = await signedOut(personas, { endpoint: browser.endpoint, base, runDir: d, sessionFor: (k) => files[k] ?? join(d, `${k}.json`) });
    assert.deepEqual(out, ['bob', 'eve'], "carol isn't set up; dan has only a sign-in page to go on, so no claim");
  } finally { browser.stop(); server.close(); }
});
