import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readKnown, updateKnown, knownLines, unreportedFlows, sameCheck } from '../known.js';

test('known problems: proven ones are kept, ones that pass again are dropped', () => {
  const state = mkdtempSync(join(tmpdir(), 'ut-known-'));
  assert.deepEqual(readKnown(state), {});
  assert.equal(knownLines({}), 'None.');
  updateKnown(state, [
    { name: 'Add a product', status: 'known', cause: 'known', causeWhy: 'build error before too' },
    { name: 'Editor', status: 'fail', cause: 'unknown' },
    { name: 'Orders', status: 'known', actual: 'listed from the known list, not re-proven' },
  ], 'run1');
  const k = readKnown(state);
  assert.deepEqual(Object.keys(k), ['Add a product'], 'only a failure the comparison proved is added');
  const since = k['Add a product'].since;
  updateKnown(state, [{ name: 'Add a product', status: 'known', cause: 'known', causeWhy: 'still' }], 'run2');
  assert.equal(readKnown(state)['Add a product'].since, since, 'first seen stays');
  assert.match(knownLines(readKnown(state)), /"Add a product" \(broken since \d{4}-\d\d-\d\d\): still/);
  updateKnown(state, [{ name: 'Add a product', status: 'pass' }], 'run3');
  assert.deepEqual(readKnown(state), {}, 'fixed: dropped');
});

test("what Tess didn't report: left failures for the comparison, known problems, skipped checks", () => {
  const known = { 'Add a product': { since: '2026-11-21T00:00:00Z', error: 'ffmpeg build error' } };
  const verdict = { flows: [{ name: 'Unit tests', status: 'pass' }, { name: 'Orders', status: 'fail' }], skipped: [{ name: 'Checkout', why: 'checkout untouched' }, { name: 'Add a product', why: 'products untouched' }, { name: 'Orders', why: 'x' }] };
  const failed = [{ name: 'Orders', error: 'e' }, { name: 'Sign up', error: 'Expected the setup step', code: 'await 1', source: 'must-never-break', shot: '/r/s.png' }];
  const by = Object.fromEntries(unreportedFlows(verdict, { failed, passed: ['Dashboard'], known }).map((f) => [f.name, f]));
  assert.deepEqual(Object.keys(by).sort(), ['Add a product', 'Checkout', 'Sign up'], 'what Tess reported is hers');
  assert.equal(by['Sign up'].status, 'fail'); assert.equal(by['Sign up'].replay, 'await 1', 'its script goes with it, for the comparison');
  assert.equal(by['Add a product'].status, 'known'); assert.match(by['Add a product'].actual, /since 2026-11-21.*products untouched.*ffmpeg/);
  assert.equal(by.Checkout.status, 'notrun'); assert.match(by.Checkout.actual, /checkout untouched/);
});

test('a check named with who and where is still its plan line', () => {
  assert.ok(sameCheck('Add a product (as merchant, start at /dashboard/products)', 'Add a product'));
  assert.ok(sameCheck('Add a product', 'Add a product'));
  assert.ok(!sameCheck('Add a product twice', 'Add a product'));
});
