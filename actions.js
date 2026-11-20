// What the window's Setup screen and run buttons can do, for one repo.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStart, withPort, parsePersonas, shouldSkip } from './lib.js';
import { signInWindow, freePort } from './live.js';
import { readPlan, addLesson as planLesson, setNotes as planNotes, PLAN_FILES, planSchema, validate, savePlanJson, answerPlan, getAt, schemaAt, planToMarkdown, PLAN_MD, setPlanFields, replacePlan } from './plan.js';

// UT_HOME is set by `ultimate-tester serve`; once Nitro bundles this file, import.meta.url no longer points at the repo.
const HOME = process.env.UT_HOME ?? dirname(fileURLToPath(import.meta.url));
const CLI = join(HOME, 'bin', 'ultimate-tester.js');
const TEMPLATE = readFileSync(join(HOME, 'profile.template.md'), 'utf8');
const MODEL = process.env.ULTIMATE_TESTER_MODEL ?? 'opus';

// The engine's own port settings must not leak into a test run or an app started for sign-in.
const childEnv = () => { const { PORT, HOST, NITRO_PORT, NITRO_HOST, ...env } = process.env; return env; };

async function waitFor(url, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500) return true; } catch {}
  }
  return false;
}

// Where a persona's saved sign-in lives. The first signed-in persona also picks up a session
// saved before personas existed (.ultimate-tester/session.json).
export function sessionFile(state, key, personas) {
  const f = join(state, 'sessions', `${key}.json`);
  const legacy = join(state, 'session.json');
  const first = personas.find((p) => p.signIn)?.key;
  return !existsSync(f) && key === first && existsSync(legacy) ? legacy : f;
}

export function createActions(root) {
  const state = join(root, '.ultimate-tester');
  const profileFile = join(root, '.ultimate-tester.md');
  const personasNow = () => parsePersonas(readPlan(root).text);
  // One thing at a time per repo; the window polls `job` to show progress.
  let job = { kind: null, status: 'idle', message: '', steps: [] };
  let signIn = null; // { win, app }
  let run = null;

  const set = (kind, status, message, steps = []) => { job = { kind, status, message, steps }; };

  // Only the release bases the window offers (TARGETS in app/utils/format.ts); a big repo has hundreds of branches.
  const RELEASE_BASES = ['origin/prd', 'origin/main'];
  const remoteBranches = () => RELEASE_BASES.filter((ref) => {
    try { execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/${ref}`], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; }
  });

  // The newest test that is still running, wherever it was started (this window, a hook, the CLI):
  // no verdict, not stopped, and its process is alive.
  const activeRun = () => {
    const runs = join(state, 'runs');
    const latest = existsSync(runs) ? readdirSync(runs).filter((d) => !d.startsWith('.')).sort().at(-1) : null;
    if (!latest) return null;
    const dir = join(runs, latest);
    if (existsSync(join(dir, 'verdict.json')) || existsSync(join(dir, 'stopped'))) return null;
    try {
      const pid = Number(readFileSync(join(dir, 'pid'), 'utf8'));
      process.kill(pid, 0);
      return { dir, pid };
    } catch { return null; }
  };

  // Which automatic triggers are installed: Claude Code's Stop hook and/or the git post-commit hook.
  const triggers = () => {
    const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
    let hooks = '';
    try { hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
    return {
      stop: ['settings.local.json', 'settings.json'].some((f) => read(join(root, '.claude', f)).includes('ultimate-tester')),
      commit: !!hooks && read(join(root, hooks, 'post-commit')).includes('# ultimate-tester'),
    };
  };
  const busy = () => job.status === 'working';
  const questionsFile = join(state, 'questions.json');
  // How setup asks for an answer: a choice, one line each, or a short text, from the field's schema.
  const CHOICE = { saved: 'An account you sign in to once on each Mac', signUp: 'A fresh account I create each run', none: 'No sign-in', dev: 'Use the dev one', stop: "Stop, don't test without it" };
  const answerShape = (field) => {
    const s = schemaAt(field) ?? {};
    if (s.enum) return { kind: 'choice', options: s.enum.map((v) => ({ value: v, label: CHOICE[v] ?? String(v) })) };
    if (s.type === 'boolean') return { kind: 'choice', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] };
    if (s.type === 'array') return { kind: 'lines', objects: !!s.items?.properties?.check };
    return { kind: 'text' };
  };
  const questions = () => { try { return JSON.parse(readFileSync(questionsFile, 'utf8')); } catch { return []; } };
  const keepGuess = (field) => writeFileSync(questionsFile, JSON.stringify(questions().filter((q) => q.field !== field), null, 2));
  // One headless Claude call with structured output; resolves to the structured answer or null.
  const askClaude = (prompt, schema, tools, onTool) => new Promise((resolve) => {
    const child = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--setting-sources', '',
      '--json-schema', JSON.stringify(schema), ...(tools.length ? ['--allowedTools', ...tools] : []), '--disallowedTools', 'Bash', 'Edit', 'Write', ...(tools.length ? [] : ['Read', 'Glob', 'Grep'])],
    { cwd: root, env: { ...process.env, ULTIMATE_TESTER_CHILD: '1' } });
    let buf = '', result = null;
    child.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result') result = ev.structured_output ?? null;
        for (const x of ev.type === 'assistant' ? ev.message?.content ?? [] : []) if (x.type === 'tool_use') onTool(x.name, x.input ?? {});
      }
    });
    child.on('close', () => resolve(result));
    child.on('error', () => resolve(null));
    child.stdin.end(prompt);
  });
  // Uncommitted files except Tess's own plan; null in a repo with no commit yet (no HEAD to compare with).
  const changedFiles = () => {
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    try { return [...git('diff', 'HEAD', '--name-only'), ...git('ls-files', '--others', '--exclude-standard')].filter((f) => !PLAN_FILES.includes(f)); } catch { return null; }
  };

  const api = {
    status() {
      const plan = readPlan(root);
      const profile = plan.text;
      const list = parsePersonas(profile);
      const personas = list.map((p) => {
        let savedAt = null;
        try { savedAt = JSON.parse(readFileSync(sessionFile(state, p.key, list), 'utf8')).savedAt; } catch {}
        return { ...p, savedAt };
      });
      const profileReady = !!profile && profile !== TEMPLATE;
      return {
        profile,
        profileReady,
        // Which file holds the plan, and what's wrong with it if it fails its schema (then nothing is tested).
        planFormat: plan.format,
        // The JSON plan itself, so the plan card can edit its fields.
        planJson: plan.format === 'json' ? plan.json : null,
        // A converted JSON plan waiting to be checked and used (the old .md still runs until then).
        proposal: plan.format === 'md' && proposal() ? { text: planToMarkdown(proposal().plan), questions: (proposal().unsure ?? []).length } : null,
        planErrors: plan.errors,
        // What Tess couldn't work out from the repo, asked once in setup (a JSON plan only).
        questions: plan.format === 'json' ? questions().map((q) => ({ ...q, value: getAt(plan.json, q.field), ...answerShape(q.field) })) : [],
        // Which version of the profile this page is showing; a save based on an older one is refused.
        profileHash: createHash('sha1').update(profile).digest('hex'),
        // Set up only once the person finishes getting started; a drafted plan alone is not checked yet.
        onboarded: existsSync(join(state, 'onboarded')),
        triggers: triggers(),
        // Whether "My changes" has anything to test, so the first test can default to the last commit.
        changed: !!changedFiles()?.length,
        // Remote branches, so release choices only show for branches this repo has.
        remotes: remoteBranches(),
        start: parseStart(profile),
        personas,
        // every persona that needs a sign-in has one
        allSignedIn: personas.every((p) => !p.signIn || p.savedAt),
        signingIn: signIn?.persona ?? null,
        running: !!run || !!activeRun(),
        job,
      };
    },

    // base: the profileHash the page was showing. If the file changed since (a lesson, a note, the other
    // window), the save is refused instead of quietly overwriting it.
    saveProfile(text, base) {
      if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Profile is empty or too long');
      // shortcut: a JSON plan is edited in its file for now; editing it from the plan card comes with the JSON plan card.
      if (readPlan(root).format === 'json') throw new Error('This plan is .ultimate-tester.json. Edit that file for now; the plan card will edit it soon.');
      const now = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '';
      if (base && base !== createHash('sha1').update(now).digest('hex')) {
        throw new Error('The profile changed while you were editing (something Tess learned, or another window). Showing the latest; make your edit again.');
      }
      writeFileSync(profileFile, text.trimEnd() + '\n');
    },

    // Tess reads the repo and drafts the test plan as JSON that passes its schema; takes about a minute.
    // What she couldn't work out from the repo comes back as questions, asked once in setup.
    draftProfile() {
      if (busy()) throw new Error('Something else is still working');
      set('draft', 'working', 'Tess is reading the repo…');
      return draftPlan().catch((e) => set('draft', 'error', `Tess could not draft the plan: ${e.message}`, job.steps));
    },
  };
  // How Tess writes a plan, shared by drafting from a repo and converting an old Markdown plan.
  const PLAN_RULES = `Rules:
- start.command runs the app locally and contains {port}; start.port is a port nothing else in the repo uses; start.readyUrl is http://localhost:{port} plus a path (a health route when there are no pages). Settings the command needs go in start.env, never secrets.
- browser is false when the app has no pages a person uses (only an API, worker or backend); then every persona's signIn is "none" (keys come from the local env file) and personas are the kinds of caller.
- urls.allowed: dev hosts the app calls besides localhost (or just "localhost"). urls.never: production hosts you find. neverRun: deploy, publish and push commands you find in package.json scripts, plus "git push".
- personas: 2 to 6 kinds of user whose access differs, only ones the code shows exist. signIn "saved" for real accounts, "signUp" only when the app has a local sign-up page Tess can use each run, "none" for guests. Never a password.
- mustNeverBreak: 3 to 5 core things people do daily, each { "check": plain words, "as": persona key when it matters, "startAt": path when it matters }.
- ownTests only when the repo has a test runner; its command runs one file with {file}.
- backends: leave out unless the repo names the backend's git repo.
- notes, lessons and environment start as [].
- Every string is plain words someone who isn't a developer can follow ("Add a note and see it in the list", not "POST /notes returns 302").

In "unsure", list each answer you could not work out from the repo (the schema marks the usual ones with x-ask): "field" is its path, like "personas[2].signIn", "urls.never" or "mustNeverBreak"; "question" is the plain question to ask the developer. Still fill those fields with your best guess so the plan passes the schema.`;
  const PLAN_OUT = { type: 'object', required: ['plan', 'unsure'], properties: { plan: { type: 'string' }, unsure: { type: 'array', items: { type: 'object', required: ['field', 'question'], properties: { field: { type: 'string' }, question: { type: 'string' } } } } } };
  const say = (t) => { if (t && job.steps.at(-1) !== t) job.steps = [...job.steps, t].slice(-40); };
  const rel = (f = '') => f.startsWith(root) ? f.slice(root.length + 1) : f;
  const onTool = (name, i) => say(name === 'Read' ? `Reading ${rel(i.file_path)}` : name === 'Grep' ? `Searching for “${i.pattern}”` : name === 'Glob' ? `Looking for ${i.pattern}` : null);
  // Tess writes a plan, the validator checks it, and she gets one repair round with the exact problems.
  // Resolves to { json, unsure } or { errors }; nothing is saved here.
  async function planFromClaude(ask, tools) {
    let draft = await askClaude(`${ask}\n\n${JSON.stringify(planSchema())}\n\n${PLAN_RULES}`, PLAN_OUT, tools, onTool);
    let json = null, errors = ['Tess returned no plan'];
    const check = () => { try { json = JSON.parse(draft.plan); errors = validate(json); } catch (e) { errors = [`not valid JSON: ${e.message}`]; } };
    if (draft) check();
    if (draft && errors.length) {
      say('Fixing the plan so it passes its schema');
      const fixed = await askClaude(`This test plan fails its JSON Schema:\n${errors.slice(0, 20).map((x) => `- ${x}`).join('\n')}\n\nPlan:\n${draft.plan}\n\nSchema:\n${JSON.stringify(planSchema())}\n\nReturn the corrected plan as text in "plan", changing only what the problems need.`, { type: 'object', required: ['plan'], properties: { plan: { type: 'string' } } }, [], () => {});
      if (fixed) { draft = { ...draft, plan: fixed.plan }; check(); }
    }
    if (errors.length) return { errors };
    return { json, unsure: (draft.unsure ?? []).filter((q) => getAt(json, q.field) !== undefined) };
  }
  const saveQuestions = (list) => { mkdirSync(state, { recursive: true }); writeFileSync(questionsFile, JSON.stringify(list, null, 2)); };

  async function draftPlan() {
    const r = await planFromClaude('Read this repository (package.json, README, CLAUDE.md or AGENTS.md, .claude/launch.json, .env.example) and write its Ultimate Tester test plan: JSON that passes this JSON Schema exactly. Return the JSON as text in "plan".', ['Read', 'Glob', 'Grep']);
    if (r.errors) return set('draft', 'error', `Tess could not draft a plan that passes its schema: ${r.errors[0]}`, job.steps);
    savePlanJson(root, r.json);
    saveQuestions(r.unsure);
    set('draft', 'done', 'Drafted. Read it and fix anything wrong.', job.steps);
  }

  // An old .ultimate-tester.md becomes a proposed JSON plan. Nothing changes until the person uses it;
  // until then the .md keeps working.
  const proposalFile = join(state, 'proposed-plan.json');
  const proposal = () => { try { return JSON.parse(readFileSync(proposalFile, 'utf8')); } catch { return null; } };
  async function convertPlan() {
    const md = readPlan(root).text;
    const r = await planFromClaude(`Turn this Ultimate Tester test plan from its old Markdown form into JSON that passes the JSON Schema below. Keep every fact it states: the start command, ports, test data, hosts to avoid, commands never to run, every person, every must-never-break item, every note, lesson and test-data recipe, worded the same where you can. You may read the repo to fill gaps (like the port or where a command runs). Return the JSON as text in "plan".\n\nOld plan:\n${md}`, ['Read', 'Glob', 'Grep']);
    if (r.errors) return set('convert', 'error', `Tess could not convert the plan: ${r.errors[0]}`, job.steps);
    mkdirSync(state, { recursive: true });
    writeFileSync(proposalFile, JSON.stringify({ plan: r.json, unsure: r.unsure }, null, 2));
    set('convert', 'done', 'Converted. Check it, then use it.', job.steps);
  }
  Object.assign(api, {
    // A question from the draft, answered: written into the plan (checked against the schema) and crossed off.
    answer(field, value) {
      if (typeof field !== 'string' || !questions().some((q) => q.field === field)) throw new Error('That question was already answered');
      answerPlan(root, field, value);
      keepGuess(field);
    },
    // "Keep your guess": the draft's answer stays as it is.
    keep(field) { keepGuess(field); },
    convertPlan() {
      if (busy()) throw new Error('Something else is still working');
      if (readPlan(root).format !== 'md') throw new Error('There is no old plan to convert');
      set('convert', 'working', 'Tess is turning your plan into JSON…');
      return convertPlan().catch((e) => set('convert', 'error', `Tess could not convert the plan: ${e.message}`, job.steps));
    },
    // Use the converted plan: the JSON is written (checked again), its questions queued, and the old .md removed.
    useConverted() {
      const p = proposal();
      if (!p) throw new Error('There is no converted plan to use');
      savePlanJson(root, p.plan);
      saveQuestions(p.unsure ?? []);
      try { unlinkSync(join(root, PLAN_MD)); } catch {}
      try { unlinkSync(proposalFile); } catch {}
    },
    dropConverted() { try { unlinkSync(proposalFile); } catch {} },
    // Plan card edits on a JSON plan. base: the profileHash the card was showing; a plan changed since
    // (something Tess learned, the other window) is not overwritten.
    setPlanFields(fields, base) {
      if (base && base !== createHash('sha1').update(readPlan(root).text).digest('hex')) throw new Error('The plan changed while you were editing. Showing the latest; make your edit again.');
      setPlanFields(root, fields);
    },
    replacePlan(text, base) {
      if (typeof text !== 'string' || text.length > 200_000) throw new Error('The plan is empty or too long');
      if (base && base !== createHash('sha1').update(readPlan(root).text).digest('hex')) throw new Error('The plan changed while you were editing. Showing the latest; make your edit again.');
      replacePlan(root, text);
    },
  });
  const rest = {

    // Starts the app if it is not up, then opens a visible Chrome on it for a person to sign in.
    async signInStart(persona) {
      if (busy() || signIn) throw new Error('Something else is still working');
      const who = personasNow().find((p) => p.key === persona && p.signIn);
      if (!who) return set('signin', 'error', 'Choose a persona from the profile that signs in');
      // Its own port, never a server someone else is running; cookies on localhost carry across ports.
      const { command, url } = parseStart(withPort(readPlan(root).text, await freePort()));
      if (!command || !url) return set('signin', 'error', 'The profile needs a start command and a localhost URL under Start');
      set('signin', 'working', `Starting your app to sign in as ${who.label}…`);
      let app = null;
      try {
        app = spawn('sh', ['-c', command], { cwd: root, detached: true, stdio: 'ignore', env: childEnv() });
        if (!(await waitFor(url, 240_000))) throw new Error(`Your app did not answer at ${url} within 4 minutes`);
        mkdirSync(state, { recursive: true });
        // A Chrome profile per persona, so signing in as one never reuses another's cookies.
        signIn = { app, persona: who.key, win: await signInWindow(url, join(state, 'signin-profile', who.key)) };
        set('signin', 'waiting', `A Chrome window is open. Sign in there as ${who.label}, then come back and press "I'm signed in".`);
      } catch (e) {
        if (app) try { process.kill(-app.pid); } catch {}
        set('signin', 'error', e.message);
      }
    },

    async signInFinish() {
      if (!signIn) throw new Error('No sign-in window is open');
      try {
        mkdirSync(join(state, 'sessions'), { recursive: true });
        const n = await signIn.win.save(join(state, 'sessions', `${signIn.persona}.json`));
        set('signin', n ? 'done' : 'error', n ? `Saved. Tess will start signed in on every run.` : 'No sign-in found in that window. Try again.');
      } finally {
        signIn.win.close();
        if (signIn.app) try { process.kill(-signIn.app.pid); } catch {}
        signIn = null;
      }
    },

    // "Always keep in mind": the profile's Notes for Tess section.
    setNotes(text) {
      if (typeof text !== 'string' || text.length > 5000) throw new Error('Notes are too long');
      if (!readPlan(root).format) throw new Error('Set up the profile first');
      // Empty means "no notes".
      planNotes(root, text.split('\n').map((l) => l.trim().replace(/^-\s*/, '')).filter(Boolean));
    },

    // mode: "stop" (when Claude Code finishes), "commit" (after every commit) or "manual".
    // One answer to "when should Tess test?": installs that trigger and removes the other (manual removes both).
    setTrigger(mode) {
      if (!['stop', 'commit', 'manual'].includes(mode)) throw new Error('Choose when Tess should test');
      const cli = (...args) => execFileSync(process.execPath, [CLI, ...args], { cwd: root, env: childEnv(), stdio: 'ignore' });
      if (mode === 'manual') return cli('uninstall');
      cli('uninstall', mode === 'stop' ? 'commit' : 'stop');
      cli('install', mode);
    },

    // Settings: one trigger on or off, leaving the other as it is.
    setHook(which, on) {
      if (!['stop', 'commit'].includes(which)) throw new Error('Choose a trigger');
      execFileSync(process.execPath, [CLI, on ? 'install' : 'uninstall', which], { cwd: root, env: childEnv(), stdio: 'ignore' });
    },

    finishOnboarding() {
      mkdirSync(state, { recursive: true });
      writeFileSync(join(state, 'onboarded'), new Date().toISOString());
    },

    // Feedback on a check becomes a lesson in the profile, read on every later run.
    addLesson(text, check) {
      const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
      const t = clean(text);
      if (!t || t.length > 500) throw new Error('Say in a sentence what Tess should know (up to 500 characters)');
      if (!readPlan(root).format) throw new Error('Set up the profile first');
      planLesson(root, t, clean(check).slice(0, 120));
    },

    // Stops the test started from this window: the whole process group (Tess, her browser, the app she started).
    stopRun() {
      const active = activeRun();
      if (!active) throw new Error('No test is running');
      writeFileSync(join(active.dir, 'stopped'), new Date().toISOString());
      try { process.kill(active.pid, 'SIGTERM'); } catch {}
    },

    // kind: "changes" | "commit" | "range"; target: sha or base..head; note: extra instructions for this run only.
    startRun(kind, target, note) {
      if (typeof note === 'string' && note.length > 1000) throw new Error('Keep the note under 1000 characters');
      if (run || activeRun()) throw new Error('A test is already running');
      if (kind === 'setup' && !/^[\w-]+$/.test(target ?? '')) throw new Error('Pick a finished test to set up for');
      const args = kind === 'setup' ? ['--setup', target] : kind === 'commit' ? ['--commit', target || 'HEAD'] : kind === 'range' ? ['--range', target] : [];
      if (kind === 'range' && !/^[\w./-]+\.\.[\w./-]+$/.test(target ?? '')) throw new Error('A release is two refs, like origin/prd..HEAD');
      if (kind === 'commit' && target && !/^[\w./-]+$/.test(target)) throw new Error('That is not a commit or branch name');
      // Say so up front instead of starting a test that stops at once with nothing to show.
      if (kind === 'changes') {
        const files = changedFiles();
        const skip = files && shouldSkip(files);
        if (skip === 'no changes') throw new Error("You haven't changed anything since the last commit. Make a change, or test the last commit.");
        if (skip) throw new Error('You only changed docs, so there is nothing for me to click through. Test the last commit instead.');
      }
      // Detached so a test keeps going if the app or engine restarts mid-run.
      if (note?.trim()) args.push('--note', note.trim());
      run = spawn(process.execPath, [CLI, 'run', ...args], { cwd: root, stdio: 'ignore', detached: true, env: childEnv() });
      run.on('close', () => { run = null; });
      run.unref();
    },
  };
  return Object.assign(api, rest);
}
