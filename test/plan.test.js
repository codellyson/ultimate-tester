import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate, planToMarkdown, readPlan, addLesson, addEnvironment, answerPlan, schemaAt, getAt, PLAN_JSON } from '../plan.js';
import { parseStart, parsePersonas, withPort } from '../lib.js';

const ex = (name) => JSON.parse(readFileSync(new URL(`../schema/examples/${name}.json`, import.meta.url), 'utf8'));
const P = ex('passalong'), K = ex('shop-dashboard'), A = ex('notes-api');
const change = (doc, fn) => { const d = structuredClone(doc); fn(d); return d; };

test('the three example plans are valid', () => {
  for (const p of [P, K, A]) assert.deepEqual(validate(p), []);
});

// The same wrong plans a full JSON Schema validator (python jsonschema, Draft 2020-12) rejects.
test('wrong plans are refused', () => {
  const wrong = {
    'port hard-coded': change(P, (d) => { d.start.command = 'pnpm dev --port 3004'; }),
    'ready URL not local': change(P, (d) => { d.start.readyUrl = 'https://app.example.com'; }),
    'secret in env': change(P, (d) => { d.start.env.STRIPE_SECRET = 'x'; }),
    'seed as a sentence': change(P, (d) => { d.start.seed = 'run the migrations'; }),
    'host with a path': change(P, (d) => { d.urls.never = ['shop.com/admin']; }),
    'sign-up details missing': change(P, (d) => { delete d.personas[0].signUp; }),
    'sign-up details on a saved person': change(P, (d) => { d.personas[0].signIn = 'saved'; }),
    'saved sign-in with no browser': change(A, (d) => { d.personas[0].signIn = 'saved'; }),
    'bare-sentence check': change(P, (d) => { d.mustNeverBreak[0] = 'Landing loads'; }),
    'test command without {file}': change(P, (d) => { d.ownTests.command = 'pnpm test'; }),
    'repo with credentials': change(P, (d) => { d.backends = [{ name: 'x', repo: 'https://user:pw@github.com/a/b', env: 'X_URL', whenMissing: 'dev' }]; }),
    'folder outside the repo': change(P, (d) => { d.start.cwd = '../other'; }),
    'unknown field': change(P, (d) => { d.kind = 'web'; }),
  };
  for (const [name, plan] of Object.entries(wrong)) assert.ok(validate(plan).length, `should refuse: ${name}`);
});

test('a JSON plan reads like the Markdown plan the engine knows', () => {
  const md = planToMarkdown(P);
  assert.deepEqual(parseStart(md), { command: 'PASSALONG_FOLDER_FIXTURE=0 pnpm --filter @passalong/web exec nuxt dev --port 3004', url: 'http://localhost:3004' });
  assert.match(md, /Browser: needed/);
  assert.match(md, /sign up a fresh account each run at http:\/\/localhost:3004\/hub/);
  assert.deepEqual(parsePersonas(md).map((x) => [x.key, x.signIn]), [['member', false]]);
  assert.match(withPort(md, 51234), /--port 51234/);
  const k = planToMarkdown(K);
  assert.deepEqual(parsePersonas(k).map((x) => [x.key, x.signIn]), [['owner', true], ['b2b-owner', true], ['marketing-manager', true], ['new-merchant', true], ['shopper', false]]);
  assert.match(k, /Create and send an invoice \(as owner, start at \/invoices\)/);
  assert.match(planToMarkdown(A), /^- Browser: not needed/m);
});

test('a broken JSON plan is refused, never half-read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ut-plan-'));
  writeFileSync(join(dir, PLAN_JSON), JSON.stringify(change(P, (d) => { delete d.start; })));
  const p = readPlan(dir);
  assert.equal(p.format, 'json');
  assert.equal(p.text, '');
  assert.ok(p.errors.some((e) => /missing start/.test(e)));
});

test('what Tess learns goes back into the JSON plan, still valid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ut-plan-'));
  writeFileSync(join(dir, PLAN_JSON), JSON.stringify(P));
  addLesson(dir, 'Empty hub is expected for a new account', 'Sign up, sign out, and sign in again');
  addEnvironment(dir, [{ what: 'A guide with two steps', as: 'member', steps: ['Open /hub', 'Create a guide'] }]);
  addEnvironment(dir, [{ what: 'A guide with two steps', as: 'member', steps: ['Open /hub', 'Create a guide', 'Reload'] }]);
  const saved = JSON.parse(readFileSync(join(dir, PLAN_JSON), 'utf8'));
  assert.deepEqual(validate(saved), []);
  assert.equal(saved.lessons[0].text, 'Empty hub is expected for a new account');
  assert.equal(saved.environment.length, 1, 'the same test data replaces its old recipe');
  assert.equal(saved.environment[0].steps.length, 3);
});

test('an answer goes into the plan only if the plan stays valid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ut-plan-'));
  writeFileSync(join(dir, PLAN_JSON), JSON.stringify(K));
  assert.deepEqual(schemaAt('personas[4].signIn').enum, ['saved', 'signUp', 'none']);
  assert.equal(schemaAt('urls.never').type, 'array');
  answerPlan(dir, 'backends[1].whenMissing', 'stop');
  answerPlan(dir, 'urls.never', ['*.example.com']);
  const saved = JSON.parse(readFileSync(join(dir, PLAN_JSON), 'utf8'));
  assert.equal(getAt(saved, 'backends[1].whenMissing'), 'stop');
  assert.deepEqual(saved.urls.never, ['*.example.com']);
  assert.throws(() => answerPlan(dir, 'personas[0].signIn', 'maybe'), /Not saved/);
  assert.throws(() => answerPlan(dir, 'urls.never', ['example.com/admin']), /Not saved/);
  assert.equal(JSON.parse(readFileSync(join(dir, PLAN_JSON), 'utf8')).personas[0].signIn, 'saved', 'a refused answer changes nothing');
});
