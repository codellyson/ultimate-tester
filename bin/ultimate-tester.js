#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, appendFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldSkip, VERDICT_SCHEMA, enforceEvidence, renderReport, usageLabel, withPort, parsePersonas, recentRuns, withoutOurStopHook, addToSection, parseStart } from '../lib.js';
const PORT = Number(process.env.ULTIMATE_TESTER_PORT ?? 4600);
import { startBrowser, freePort, useSession } from '../live.js';
import { sessionFile } from '../actions.js';
import { addApp, readSettings } from '../apps.js';

const HOME = dirname(dirname(fileURLToPath(import.meta.url)));
const SELF = fileURLToPath(import.meta.url);
const PROFILE = '.ultimate-tester.md';
const STATE = '.ultimate-tester';
const MAX_LOOPS = 3;
// From General settings unless an environment variable says otherwise. A release gets 25 minutes (set in run()).
const SETTINGS = readSettings();
let TIMEOUT_MS = Number(process.env.ULTIMATE_TESTER_TIMEOUT_MS ?? SETTINGS.timeoutMin * 60_000);
const PLAYWRIGHT_MCP = '@playwright/mcp@0.0.84';
const MODEL = process.env.ULTIMATE_TESTER_MODEL ?? SETTINGS.model;

// Who pays: an API key is billed per run; a claude.ai login uses the person's plan limits.
function billing() {
  if (process.env.ANTHROPIC_API_KEY) return { paid: true };
  try {
    const s = JSON.parse(execFileSync('claude', ['auth', 'status'], { encoding: 'utf8' }));
    return s.authMethod === 'claude.ai' ? { paid: false, plan: s.subscriptionType } : { paid: true };
  } catch { return { paid: true }; }
}
// No window opens (CI); the test browser is always streamed into the window, never shown on its own.
const HEADLESS = process.env.ULTIMATE_TESTER_HEADLESS === '1';

// One line per tester event for live.log: "say: …" is Tess talking, "do: …" is a raw action.
function describe(ev) {
  if (ev.type !== 'assistant') return [];
  return (ev.message?.content ?? []).flatMap((c) => {
    if (c.type === 'text' && c.text.trim()) return [`say: ${c.text.trim().split('\n\n')[0].replace(/\n/g, ' ').slice(0, 400)}`];
    if (c.type !== 'tool_use') return [];
    const i = c.input ?? {};
    const name = c.name.replace('mcp__playwright__browser_', 'browser ');
    const detail = i.url ?? i.element ?? i.text ?? (i.filename && basename(i.filename)) ?? i.command ?? i.pattern ?? i.file_path ?? '';
    return [`do: ${name} ${String(detail).split('\n')[0].slice(0, 120)}`.trim()];
  });
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const root = () => git('rev-parse', '--show-toplevel');

// commit: a sha to test, or null for uncommitted changes. range: "base..head", everything about to ship.
function collectChange(commit, range) {
  if (range) {
    const [base, head] = range.split('..');
    const files = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);
    const message = `Release ${range}: ${files.length} files\n\n${git('log', '--oneline', '--no-merges', range)}`;
    return { mode: `release range ${range}`, files, diff: git('diff', `${base}...${head}`), message };
  }
  if (commit) {
    const files = git('show', '--name-only', '--format=', commit).split('\n').filter(Boolean);
    const message = git('log', '-1', '--format=%h %s%n%n%b', commit);
    return { mode: `commit ${commit}`, files, diff: git('show', '--format=', commit), message };
  }
  const tracked = git('diff', 'HEAD', '--name-only').split('\n').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  const diff = [git('diff', 'HEAD'), ...untracked.map((f) => `--- new file: ${f}`)].join('\n');
  // Tess's own plan file isn't the person's change.
  return { mode: 'uncommitted changes', files: [...tracked, ...untracked].filter((f) => f !== PROFILE), diff, message: '(not committed yet)' };
}

async function runTester(prompt, runDir) {
  // A backend with no pages ("- Browser: not needed" under Start) is tested with requests only: no browser at all.
  const noBrowser = /^- Browser:\s*not needed/im.test(readFileSync(PROFILE, 'utf8'));
  const browser = noBrowser ? null : await startBrowser(runDir);
  const browserArgs = browser ? ['--cdp-endpoint', browser.endpoint] : ['--headless', '--isolated'];
  const mcpFile = join(runDir, 'mcp.json');
  writeFileSync(mcpFile, JSON.stringify({
    mcpServers: noBrowser ? {} : { playwright: { command: 'npx', args: ['-y', PLAYWRIGHT_MCP, ...browserArgs, '--output-dir', runDir] } },
  }));
  const args = [
    '-p', '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--setting-sources', '', // no project hooks (no recursion) and no user plugins
    '--strict-mcp-config', '--mcp-config', mcpFile,
    '--json-schema', JSON.stringify(VERDICT_SCHEMA),
    '--allowedTools', 'Bash', 'Read', 'Glob', 'Grep', ...(noBrowser ? [] : ['mcp__playwright']),
    '--disallowedTools', 'Edit', 'Write', 'NotebookEdit',
  ];
  return new Promise((resolve) => {
    // ULTIMATE_TESTER_CDP lets `ultimate-tester as <persona>` (run by the tester) reach this browser.
    const env = { ...process.env, ULTIMATE_TESTER_CHILD: '1', ...(browser ? { ULTIMATE_TESTER_CDP: browser.endpoint } : {}) };
    // Its own process group, so Stop can end Tess and everything she started (browser tools, the app).
    const child = spawn('claude', args, { env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const stop = () => {
      writeFileSync(join(runDir, 'stopped'), new Date().toISOString());
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    let out = '', err = '', buf = '', result = null;
    const live = join(runDir, 'live.log');
    child.stdout.on('data', (d) => {
      out += d;
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result') result = ev;
        for (const step of describe(ev)) {
          process.stderr.write(`  ${step.startsWith('say: ') ? 'Tess:' : '  ▸'} ${step.slice(4).trim()}\n`);
          appendFileSync(live, `${step}\n`);
        }
      }
    });
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
      browser?.stop();
      writeFileSync(join(runDir, 'claude-output.jsonl'), out || err);
      try {
        const j = result ?? {};
        if (!j.structured_output) throw new Error(j.result || 'no structured output');
        resolve({ verdict: j.structured_output, costUsd: j.total_cost_usd ?? 0 });
      } catch (e) {
        const why = existsSync(join(runDir, 'stopped'))
          ? 'You stopped this test.'
          : code === null
            ? `I ran out of time after ${Math.round(TIMEOUT_MS / 60_000)} minutes, so I couldn't finish. Try a smaller change, or raise the time limit in Settings > General.`
            : `Something went wrong on my side before I could finish (${String(e.message || err).trim().slice(0, 200)}). Run the test again; if it keeps happening, check that Claude Code is signed in.`;
        resolve({ verdict: { status: 'unverified', summary: why, flows: [] }, costUsd: 0 });
      }
    });
    child.stdin.end(prompt);
  });
}

// Make sure the engine is up and knows this repo; open the window on it unless one is already up.
// alwaysOpen: open even if the engine was already running (setup).
async function openWindow(view = '', alwaysOpen = false) {
  const url = `http://localhost:${PORT}`;
  const app = addApp(process.cwd());
  let up = false;
  try { up = (await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).json()).service === 'ultimate-tester'; } catch {}
  if (up && !alwaysOpen) return;
  if (!up) {
    spawn(process.execPath, [SELF, 'serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 20; i++) {
      try { await fetch(`${url}/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  }
  const page = `${url}/?app=${app.id}${view}`;
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [page], { detached: true, stdio: 'ignore' }).unref();
  process.stderr.write(`Ultimate Tester: ${page}\n`);
}

// One line per persona for the prompt, saying whether a sign-in is saved.
function personaLines() {
  const list = parsePersonas(readFileSync(PROFILE, 'utf8'));
  return list.map((p) => {
    const ready = !p.signIn ? 'no sign-in needed' : existsSync(sessionFile(join(process.cwd(), STATE), p.key, list)) ? 'sign-in saved' : 'NOT SET UP (no saved sign-in)';
    return `- ${p.key}: ${p.label} [${ready}]`;
  }).join('\n');
}

// "Set this up": Tess creates, through the app's screens, what an earlier test's checks needed but didn't exist.
// source: that test's run id. What she creates is saved to the profile's Environment section as steps to repeat.
async function setupEnv(source) {
  process.chdir(root());
  if (!/^[\w-]+$/.test(source)) return { status: 'unverified', report: 'That is not a test id.' };
  const runsRoot = join(process.cwd(), STATE, 'runs');
  let from, fromChange = {};
  try { from = JSON.parse(readFileSync(join(runsRoot, source, 'verdict.json'), 'utf8')); } catch { return { status: 'unverified', report: `No finished test ${source}.` }; }
  try { fromChange = JSON.parse(readFileSync(join(runsRoot, source, 'change.json'), 'utf8')); } catch {}
  const wanted = (from.flows ?? []).filter((f) => f.status === 'unverified' && f.needs && f.setupBy !== 'person');
  if (!wanted.length) return { status: 'skip', report: 'Nothing in that test needs setting up.' };
  // One item per distinct need, with the checks that wait on it.
  const items = new Map();
  for (const f of wanted) items.set(f.needs, [...(items.get(f.needs) ?? []), f.name]);

  const runDir = join(runsRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'pid'), String(process.pid));
  const title = fromChange.message && fromChange.message !== '(not committed yet)' ? fromChange.message.split('\n')[0] : fromChange.kind === 'changes' || !fromChange.kind ? 'uncommitted changes' : fromChange.mode ?? 'an earlier test';
  writeFileSync(join(runDir, 'change.json'), JSON.stringify({ mode: 'setup', message: `Set up for: ${title}`, files: [], note: '', kind: 'setup', target: source, source: { id: source, kind: fromChange.kind ?? 'changes', target: fromChange.target ?? null, note: fromChange.note ?? '', checks: wanted.map((f) => f.name) } }));
  const port = await freePort();
  const prompt = readFileSync(join(HOME, 'setup.md'), 'utf8')
    .replace('{{PROFILE}}', () => withPort(readFileSync(PROFILE, 'utf8'), port))
    .replace('{{PERSONAS}}', () => personaLines())
    .replaceAll('{{AS}}', `node ${JSON.stringify(SELF)} as`)
    .replaceAll('{{PORT}}', String(port))
    .replaceAll('{{NUXT_OWN_BUILD}}', JSON.stringify(join(HOME, 'own-build', 'nuxt')))
    .replaceAll('{{RUN_DIR}}', () => runDir)
    .replace('{{NEEDS}}', () => [...items].map(([need, checks]) => `- ${need} (for: ${checks.join('; ')})`).join('\n'));

  if (!HEADLESS) await openWindow();
  const started = Date.now();
  const { verdict: raw, costUsd } = await runTester(prompt, runDir);
  let plan = [];
  try { plan = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8')); } catch {}
  const verdict = enforceEvidence(raw, plan);
  // Keep the recipe: next time Tess (or a person) can recreate the same test data the same way.
  let md = readFileSync(PROFILE, 'utf8');
  // Steps are saved with the profile's usual port, not this run's one-off port.
  const usual = parseStart(md).url?.match(/:(\d+)/)?.[1];
  const fixPort = (t) => (usual ? t.replaceAll(String(port), usual) : t);
  for (const f of verdict.flows ?? []) {
    if (f.status === 'pass' && f.steps?.length) md = addToSection(md, 'Environment', fixPort(`${f.name}${f.persona && f.persona !== 'default' ? ` (as ${f.persona})` : ''}: ${f.steps.join('; ')}`));
  }
  writeFileSync(PROFILE, md);
  const usage = usageLabel({ ...billing(), costUsd });
  const report = renderReport(verdict, { runDir, durationS: Math.round((Date.now() - started) / 1000), usage });
  writeFileSync(join(runDir, 'verdict.json'), JSON.stringify({ ...verdict, costUsd, usage, model: MODEL, durationMs: Date.now() - started }, null, 2));
  writeFileSync(join(runDir, 'report.txt'), report);
  return { status: verdict.status, report };
}

// Returns { status, report } — status is pass | fail | unverified | skip.
async function run({ commit = null, range = null, dedupe = false, note = '' } = {}) {
  process.chdir(root());
  if (!existsSync(PROFILE)) return { status: 'skip', report: `No ${PROFILE}. Run: ultimate-tester init` };
  const change = collectChange(commit, range);
  // A release is many changes at once; give it room unless someone set a limit.
  if (range && !process.env.ULTIMATE_TESTER_TIMEOUT_MS) TIMEOUT_MS = Math.max(25, SETTINGS.timeoutMin) * 60_000;
  const skip = shouldSkip(change.files);
  if (skip) return { status: 'skip', report: `Ultimate Tester skipped: ${skip}` };

  mkdirSync(STATE, { recursive: true });
  const hash = createHash('sha256').update(change.diff).digest('hex');
  const lastFile = join(STATE, 'last-tested');
  if (dedupe && existsSync(lastFile) && readFileSync(lastFile, 'utf8') === hash) {
    return { status: 'skip', report: 'Ultimate Tester skipped: change already tested' };
  }

  const runsRoot = join(process.cwd(), STATE, 'runs');
  const past = existsSync(runsRoot) ? readdirSync(runsRoot).sort().reverse().map((d) => { try { return JSON.parse(readFileSync(join(runsRoot, d, 'verdict.json'), 'utf8')); } catch { return null; } }) : [];
  const runDir = join(runsRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(runDir, { recursive: true });
  // Stop (from the window, whoever started this run) signals this process; see runTester.
  writeFileSync(join(runDir, 'pid'), String(process.pid));
  writeFileSync(join(runDir, 'change.json'), JSON.stringify({ mode: change.mode, message: change.message, files: change.files, note, kind: range ? 'range' : commit ? 'commit' : 'changes', target: range ?? commit ?? null }));
  const port = await freePort();
  const prompt = readFileSync(join(HOME, 'prompt.md'), 'utf8')
    .replace('{{PROFILE}}', () => withPort(readFileSync(PROFILE, 'utf8'), port))
    .replace('{{PERSONAS}}', () => personaLines())
    .replaceAll('{{AS}}', `node ${JSON.stringify(SELF)} as`)
    .replaceAll('{{PORT}}', String(port))
    .replaceAll('{{NUXT_OWN_BUILD}}', JSON.stringify(join(HOME, 'own-build', 'nuxt')))
    .replaceAll('{{RUN_DIR}}', () => runDir)
    .replace('{{NOTE}}', () => note.trim() || 'None.')
    .replace('{{HISTORY}}', () => recentRuns(past))
    .replace('{{MODE}}', change.mode)
    .replace('{{MESSAGE}}', () => change.message)
    .replace('{{DIFF}}', () => change.diff.slice(0, 200_000)); // shortcut: huge diffs are cut, upgrade to per-file summaries if it bites

  if (!HEADLESS) await openWindow();
  const started = Date.now();
  const { verdict: raw, costUsd } = await runTester(prompt, runDir);
  // Hold the verdict to Tess's own plan: anything planned but not reported counts as not checked.
  let plan = [];
  try { plan = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8')); } catch {}
  const verdict = enforceEvidence(raw, plan);
  const usage = usageLabel({ ...billing(), costUsd });
  const report = renderReport(verdict, { runDir, durationS: Math.round((Date.now() - started) / 1000), usage });
  writeFileSync(join(runDir, 'verdict.json'), JSON.stringify({ ...verdict, costUsd, usage, model: MODEL, durationMs: Date.now() - started }, null, 2));
  writeFileSync(join(runDir, 'report.txt'), report);
  if (verdict.status === 'pass') writeFileSync(lastFile, hash);
  return { status: verdict.status, report };
}

async function stopHook() {
  if (process.env.ULTIMATE_TESTER_CHILD) return;
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  process.chdir(root());
  mkdirSync(STATE, { recursive: true });
  const loopsFile = join(STATE, 'loops.json');
  const loops = existsSync(loopsFile) ? JSON.parse(readFileSync(loopsFile, 'utf8')) : {};
  const id = input.session_id ?? 'unknown';
  const count = input.stop_hook_active ? (loops[id] ?? 0) : 0;

  const { status, report } = await run({ dedupe: true });
  if (status === 'fail' && count < MAX_LOOPS) {
    loops[id] = count + 1;
    writeFileSync(loopsFile, JSON.stringify(loops));
    const reason = `${report}\n\nUltimate Tester found failures (retest ${count + 1} of ${MAX_LOOPS}). Fix them, then stop again to retest.`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    return;
  }
  delete loops[id];
  writeFileSync(loopsFile, JSON.stringify(loops));
  const note = status === 'fail' ? `${report}\n\nStill failing after ${MAX_LOOPS} retests. Stopped looping; a human should look.` : report;
  process.stdout.write(JSON.stringify({ systemMessage: note }));
}

function init() {
  process.chdir(root());
  if (!existsSync(PROFILE)) {
    writeFileSync(PROFILE, readFileSync(join(HOME, 'profile.template.md'), 'utf8'));
    console.log(`Wrote ${PROFILE}. Fill in Start, Allowed URLs, Test accounts and Must never break.`);
  } else console.log(`${PROFILE} already exists.`);
  const gi = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
  if (!gi.split('\n').includes(`${STATE}/`)) appendFileSync('.gitignore', `${gi && !gi.endsWith('\n') ? '\n' : ''}${STATE}/\n`);
}

// Setup happens in the window: profile, sign-in and runs are all buttons there.
async function setup() {
  init();
  await openWindow('&view=setup', true);
}

// Claude Code reads .claude/settings.local.json too, and it is not committed: the hook points at this
// Mac's copy of Ultimate Tester, so it must not reach teammates through the repo.
const CLAUDE_FILES = [join('.claude', 'settings.local.json'), join('.claude', 'settings.json')];
const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});

// which: "stop" (Claude Code Stop hook), "commit" (post-commit hook), or both when not given.
function install(which) {
  init();
  const envPrefix = process.env.ULTIMATE_TESTER_TIMEOUT_MS ? `ULTIMATE_TESTER_TIMEOUT_MS=${TIMEOUT_MS} ` : '';
  const cmd = `${envPrefix}node ${JSON.stringify(SELF)}`;
  if (which !== 'commit') {
    uninstall('stop'); // also moves an older hook out of the committed settings.json
    mkdirSync('.claude', { recursive: true });
    const settings = readJson(CLAUDE_FILES[0]);
    ((settings.hooks ??= {}).Stop ??= []).push({ hooks: [{ type: 'command', command: `${cmd} hook`, timeout: Math.ceil(TIMEOUT_MS / 1000) + 60 }] });
    writeFileSync(CLAUDE_FILES[0], JSON.stringify(settings, null, 2) + '\n');
    console.log(`Added Stop hook to ${CLAUDE_FILES[0]}`);
  }
  // The commit hook only when asked for by name: plain `install` adds the Claude Code hook alone.
  if (which !== 'commit') return;
  const hookFile = join(git('rev-parse', '--git-path', 'hooks'), 'post-commit');
  const line = `${cmd} run --commit > ${STATE}/last-commit.log 2>&1 & # ultimate-tester\n`;
  const existing = existsSync(hookFile) ? readFileSync(hookFile, 'utf8') : '#!/bin/sh\n';
  if (!existing.includes('# ultimate-tester')) {
    writeFileSync(hookFile, existing + line);
    chmodSync(hookFile, 0o755);
    console.log(`Added background run to ${hookFile}`);
  }
}

// Takes Ultimate Tester's hooks out again ("stop", "commit", or both), leaving everyone else's alone.
function uninstall(which) {
  process.chdir(root());
  if (which !== 'commit') {
    for (const f of CLAUDE_FILES) {
      if (!existsSync(f)) continue;
      const before = readJson(f);
      const after = withoutOurStopHook(before);
      if (JSON.stringify(after) !== JSON.stringify(before)) { writeFileSync(f, JSON.stringify(after, null, 2) + '\n'); console.log(`Removed Stop hook from ${f}`); }
    }
  }
  if (which === 'stop') return;
  const hookFile = join(git('rev-parse', '--git-path', 'hooks'), 'post-commit');
  if (existsSync(hookFile) && readFileSync(hookFile, 'utf8').includes('# ultimate-tester')) {
    writeFileSync(hookFile, readFileSync(hookFile, 'utf8').split('\n').filter((l) => !l.includes('# ultimate-tester')).join('\n'));
    console.log(`Removed background run from ${hookFile}`);
  }
}

const [cmdName, ...rest] = process.argv.slice(2);
const exitFor = { pass: 0, skip: 0, fail: 1, unverified: 2 };
switch (cmdName) {
  case 'run': {
    const at = rest.indexOf('--commit');
    const commit = at < 0 ? null : rest[at + 1] && !rest[at + 1].startsWith('-') ? rest[at + 1] : 'HEAD';
    const r = rest.indexOf('--range');
    const n = rest.indexOf('--note');
    const su = rest.indexOf('--setup');
    const { status, report } = su >= 0 ? await setupEnv(rest[su + 1] ?? '') : await run({ commit, range: r < 0 ? null : rest[r + 1], note: n < 0 ? '' : rest[n + 1] ?? '' });
    console.log(report);
    process.exit(exitFor[status]);
  }
  case 'hook': await stopHook(); break;
  case 'as': {
    // Run by Tess mid-test: switch her browser to one persona's saved sign-in.
    const endpoint = process.env.ULTIMATE_TESTER_CDP;
    if (!endpoint) { console.error('Only works inside a test run'); process.exit(1); }
    process.chdir(root());
    const list = parsePersonas(readFileSync(PROFILE, 'utf8'));
    const who = list.find((p) => p.key === (rest[0] ?? '').toLowerCase());
    if (!who) { console.error(`No persona "${rest[0]}". Personas: ${list.map((p) => p.key).join(', ')}`); process.exit(1); }
    const file = who.signIn ? sessionFile(join(process.cwd(), STATE), who.key, list) : null;
    if (file && !existsSync(file)) { console.error(`NOT SET UP: nobody has signed in as "${who.key}" (${who.label}). Report checks that need it as unverified: "needs ${who.label}; add it in Setup".`); process.exit(2); }
    const n = await useSession(endpoint, file);
    console.log(file ? `Now acting as ${who.key} (${who.label}): ${n} cookies loaded. Reload the page.` : `Now acting as ${who.key} (${who.label}): signed out. Reload the page.`);
    break;
  }
  case 'serve':
  case 'watch': {
    // The Nuxt app is the engine: its Nitro server serves the page and the API on one local port.
    const server = join(HOME, '.output', 'server', 'index.mjs');
    if (!existsSync(server)) { console.error(`Not built yet. Run: npm run build (in ${HOME})`); process.exit(1); }
    Object.assign(process.env, { PORT: String(PORT), HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', NITRO_PORT: String(PORT), UT_HOME: HOME });
    await import(server);
    console.log(`Ultimate Tester: http://localhost:${PORT}`);
    break;
  }
  case 'init': init(); break;
  case 'setup': await setup(); process.exit(0);
  case 'install': install(rest[0]); break;
  case 'uninstall': uninstall(rest[0]); break;
  default:
    console.log('usage: ultimate-tester <setup | run [--commit [sha] | --range base..head] [--note text] | serve | install | init | hook>');
    process.exit(cmdName ? 1 : 0);
}
