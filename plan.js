// The test plan: .ultimate-tester.json (checked against schema/ultimate-tester.schema.json) or the older
// .ultimate-tester.md. Either way the engine gets the same Markdown text it has always read, so nothing
// downstream changes; what Tess learns during a run is written back in the plan's own format.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addToSection, setSection } from './lib.js';

export const PLAN_JSON = '.ultimate-tester.json';
export const PLAN_MD = '.ultimate-tester.md';
export const PLAN_FILES = [PLAN_JSON, PLAN_MD];
const HERE = dirname(fileURLToPath(import.meta.url));
let schema;
export const planSchema = () => (schema ??= JSON.parse(readFileSync(join(HERE, 'schema', 'ultimate-tester.schema.json'), 'utf8')));

// JSON Schema (2020-12), only the keywords the plan schema uses. The engine ships without node_modules,
// so this stays dependency-free; test/plan.test.js checks it against the same cases a full validator gives.
export function validate(value, s = planSchema(), root = s, at = '') {
  if (s === true || s === undefined) return [];
  if (s.$ref) return validate(value, s.$ref.split('/').slice(1).reduce((o, k) => o[k], root), root, at);
  const errs = [];
  const err = (m) => errs.push(`${at || 'plan'}: ${m}`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (s.type) {
    const types = [].concat(s.type);
    if (!types.some((t) => t === type || (t === 'number' && type === 'integer'))) { err(`should be ${types.join(' or ')}`); return errs; }
  }
  if ('const' in s && JSON.stringify(value) !== JSON.stringify(s.const)) err(`should be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) err(`should be one of ${s.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(value)) err(`"${value}" isn't in the expected form`);
    if (s.minLength != null && value.length < s.minLength) err('is too short');
  }
  if (typeof value === 'number') {
    if (s.minimum != null && value < s.minimum) err(`should be at least ${s.minimum}`);
    if (s.maximum != null && value > s.maximum) err(`should be at most ${s.maximum}`);
  }
  if (type === 'array') {
    if (s.minItems != null && value.length < s.minItems) err(`needs at least ${s.minItems}`);
    if (s.maxItems != null && value.length > s.maxItems) err(`can have at most ${s.maxItems}`);
    if (s.items) value.forEach((v, i) => errs.push(...validate(v, s.items, root, `${at}[${i}]`)));
  }
  if (type === 'object') {
    for (const k of s.required ?? []) if (!(k in value)) err(`is missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      const where = at ? `${at}.${k}` : k;
      if (s.propertyNames) errs.push(...validate(k, s.propertyNames, root, `${where} (name)`));
      if (s.properties && k in s.properties) errs.push(...validate(v, s.properties[k], root, where));
      else if (s.additionalProperties === false) err(`has an unknown field "${k}"`);
      else if (typeof s.additionalProperties === 'object') errs.push(...validate(v, s.additionalProperties, root, where));
    }
  }
  if (s.not && !validate(value, s.not, root, at).length) err("isn't allowed");
  if (s.oneOf && s.oneOf.filter((o) => !validate(value, o, root, at).length).length !== 1) err("doesn't match any allowed shape");
  for (const sub of s.allOf ?? []) errs.push(...validate(value, sub, root, at));
  if (s.if) {
    const branch = validate(value, s.if, root, at).length ? s.else : s.then;
    if (branch) errs.push(...validate(value, branch, root, at));
  }
  return errs;
}

// The JSON plan as the Markdown the engine and Tess already read. {port} becomes the usual port; a run
// then moves it to its own free port exactly as before (withPort).
export function planToMarkdown(p) {
  const port = String(p.start.port);
  const sub = (t) => t.replaceAll('{port}', port);
  const env = Object.entries(p.start.env ?? {}).map(([k, v]) => `${k}=${v} `).join('');
  const inDir = (cmd, cwd) => (cwd ? `cd ${cwd} && ${cmd}` : cmd);
  const lines = (head, items) => `## ${head}\n${items.length ? items.map((l) => `- ${l}`).join('\n') : '- (none)'}\n`;
  const signUps = p.personas.filter((x) => x.signIn === 'signUp');
  const accounts = [
    ...p.personas.filter((x) => x.signIn === 'saved').map((x) => `${x.key}: saved session from Ultimate Tester setup`),
    ...signUps.map((x) => `${x.key}: sign up a fresh account each run at http://localhost:${port}${x.signUp.url} with email \`${x.signUp.email.replace('{time}', '<unix time>')}\` and a generated password`),
  ];
  return [
    '# Ultimate Tester profile',
    lines('Start', [
      `Command: ${inDir(env + sub(p.start.command), p.start.cwd)}`,
      `Ready when: ${sub(p.start.readyUrl)} returns 200${p.start.readySeconds ? ` (first start can take up to ${p.start.readySeconds} seconds)` : ''}`,
      `Seed: ${p.start.seed ? `\`${inDir(p.start.seed.command, p.start.seed.cwd)}\`` : 'none'}`,
      `Browser: ${p.browser ? 'needed' : 'not needed'}`,
    ]),
    lines('Allowed URLs', [
      `http://localhost:${port}`,
      ...(p.urls.allowed ?? []).filter((h) => h !== 'localhost'),
      ...(p.urls.never?.length ? [`Never open or call: ${p.urls.never.join(', ')}. Those are production.`] : []),
      ...(p.neverRun?.length ? [`Never run: ${p.neverRun.map((c) => `\`${c}\``).join(', ')}`] : []),
    ]),
    lines('Test accounts', accounts.length ? accounts : ['None needed.']),
    lines('Personas', p.personas.map((x) => `${x.key}: ${x.who}${x.signIn === 'saved' ? '' : ', no sign-in'}`)),
    lines('Must never break', p.mustNeverBreak.map((m) => `${m.check}${m.as ? ` (as ${m.as}` : ''}${m.startAt ? `${m.as ? ', ' : ' ('}start at ${m.startAt}` : ''}${m.as || m.startAt ? ')' : ''}`)),
    lines('Existing checks', p.ownTests ? [`Only the test files a change adds or edits, run one at a time with \`${inDir(p.ownTests.command, p.ownTests.cwd)}\`. Never the full suites.`] : []),
    ...(p.backends?.length ? [lines('Backends', p.backends.map((b) => `${b.name}: ${b.repo}, set ${b.env}, when missing: ${b.whenMissing === 'dev' ? 'use the dev one' : 'stop'}`))] : []),
    lines('Notes for Tess', p.notes ?? []),
    ...(p.lessons?.length ? [lines('Lessons', p.lessons.map((l) => (l.check ? `${l.check}: ${l.text}` : l.text)))] : []),
    ...(p.environment?.length ? [lines('Environment', p.environment.map((e) => `${e.what}${e.as ? ` (as ${e.as})` : ''}: ${e.steps.join('; ')}`))] : []),
  ].join('\n');
}

// What a repo's plan is: { format: 'json' | 'md' | null, text, json?, errors }. An invalid JSON plan still
// returns its errors (never a half-read plan), so callers can refuse to run and say why.
export function readPlan(root) {
  const jsonFile = join(root, PLAN_JSON), mdFile = join(root, PLAN_MD);
  if (existsSync(jsonFile)) {
    let json;
    try { json = JSON.parse(readFileSync(jsonFile, 'utf8')); } catch (e) { return { format: 'json', text: '', errors: [`${PLAN_JSON} isn't valid JSON: ${e.message}`] }; }
    const errors = validate(json);
    return { format: 'json', json, errors, text: errors.length ? '' : planToMarkdown(json) };
  }
  if (existsSync(mdFile)) return { format: 'md', text: readFileSync(mdFile, 'utf8'), errors: [] };
  return { format: null, text: '', errors: [] };
}

function writeJson(root, json) {
  const errors = validate(json);
  // Never leave a plan that fails its own schema: a learned line that doesn't fit is dropped, not saved broken.
  if (errors.length) throw new Error(`Not saved, the plan would break: ${errors[0]}`);
  writeFileSync(join(root, PLAN_JSON), JSON.stringify(json, null, 2) + '\n');
}

// Something Tess learned, written in the plan's own format.
export function addLesson(root, text, check) {
  const p = readPlan(root);
  if (p.format === 'json') return writeJson(root, { ...p.json, lessons: [...(p.json.lessons ?? []), { text, ...(check ? { check } : {}), at: new Date().toISOString() }] });
  writeFileSync(join(root, PLAN_MD), addToSection(p.text, 'Lessons', check ? `${check}: ${text}` : text));
}

// Test data Tess made and how; the same thing made again replaces its old recipe.
export function addEnvironment(root, entries) {
  if (!entries.length) return;
  const p = readPlan(root);
  if (p.format === 'json') {
    const key = (e) => `${e.what}|${e.as ?? ''}`;
    const fresh = new Map((p.json.environment ?? []).map((e) => [key(e), e]));
    for (const e of entries) fresh.set(key(e), { what: e.what, ...(e.as ? { as: e.as } : {}), steps: e.steps });
    return writeJson(root, { ...p.json, environment: [...fresh.values()] });
  }
  let md = p.text;
  for (const e of entries) md = addToSection(md, 'Environment', `${e.what}${e.as ? ` (as ${e.as})` : ''}: ${e.steps.join('; ')}`);
  writeFileSync(join(root, PLAN_MD), md);
}

// "Anything I should always keep in mind?": one line each.
export function setNotes(root, lines) {
  const p = readPlan(root);
  if (p.format === 'json') return writeJson(root, { ...p.json, notes: lines });
  writeFileSync(join(root, PLAN_MD), setSection(p.text, 'Notes for Tess', lines.map((l) => `- ${l}`).join('\n') || '- (anything Tess should always know: areas to focus on, things to skip, known quirks)'));
}
