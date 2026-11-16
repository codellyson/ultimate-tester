import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkip, enforceEvidence, usageLabel, parseStart, withPort, parsePersonas } from '../lib.js';

test('personas come from the profile, with who needs a sign-in', () => {
  const md = '## Start\n- Command: x\n\n## Personas\n- `owner`: Store owner with B2B on\n- shopper: Guest shopper on the storefront, no sign-in\n- Visitor: signed out visitor\n\n## Must never break\n- y\n';
  assert.deepEqual(parsePersonas(md).map((p) => [p.key, p.signIn]), [['owner', true], ['shopper', false], ['visitor', false]]);
  assert.deepEqual(parsePersonas('## Start\n'), [{ key: 'default', label: 'Anyone (no saved sign-in)', signIn: false }]);
});

test('profile moves to the run port everywhere', () => {
  const md = '## Start\n- Command: npx next dev --turbopack -p 3012\n- Ready when: http://localhost:3012 returns 200\n\n## Allowed URLs\n- http://localhost:3012 only\n- not 30120\n';
  const out = withPort(md, 51234);
  assert.ok(out.includes('-p 51234') && out.includes('http://localhost:51234 returns') && out.includes('http://localhost:51234 only'));
  assert.ok(!out.includes(':3012') && out.includes('30120'));
  assert.equal(withPort('# no start', 5000), '# no start');
});

test('profile start command and app URL are found', () => {
  const md = '# P\n\n## Start\n- Command: NEXT_PUBLIC_DEMO_MODE=true npx next dev -p 3012\n- Ready when: http://localhost:3012 returns 200\n\n## Allowed URLs\n- http://localhost:9999\n';
  assert.deepEqual(parseStart(md), { command: 'NEXT_PUBLIC_DEMO_MODE=true npx next dev -p 3012', url: 'http://localhost:3012' });
  assert.deepEqual(parseStart('# none'), { command: null, url: null });
});

test('cost shows as money only for API billing', () => {
  assert.equal(usageLabel({ paid: true, costUsd: 1.705 }), '$1.71');
  assert.equal(usageLabel({ paid: false, plan: 'max', costUsd: 1.7 }), 'on your Claude Max plan, no charge');
});

test('skip rule', () => {
  assert.equal(shouldSkip([]), 'no changes');
  assert.equal(shouldSkip(['README.md', 'docs/a.txt']), 'docs-only change');
  assert.equal(shouldSkip(['README.md', 'src/app.js']), null);
});

test('pass without evidence becomes unverified', () => {
  const v = enforceEvidence({ status: 'pass', summary: '', flows: [{ name: 'a', status: 'pass', evidence: [] }] });
  assert.equal(v.status, 'unverified');
  assert.equal(v.flows[0].status, 'unverified');
});

test('any failed flow fails the run, whatever the tester claimed', () => {
  const v = enforceEvidence({ status: 'pass', summary: '', flows: [
    { name: 'a', status: 'pass', evidence: ['a.png'] },
    { name: 'b', status: 'fail', evidence: ['b.png'] },
  ] });
  assert.equal(v.status, 'fail');
});

test('no flows is unverified', () => {
  assert.equal(enforceEvidence({ status: 'pass', summary: '', flows: [] }).status, 'unverified');
});
