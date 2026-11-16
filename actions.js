// What the window's Setup screen and run buttons can do, for one repo.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStart, withPort, parsePersonas, addToSection, setSection } from './lib.js';
import { signInWindow, freePort } from './live.js';

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
  const personasNow = () => parsePersonas(existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '');
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

  // Which automatic triggers are installed: Claude Code's Stop hook and/or the git post-commit hook.
  const triggers = () => {
    const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
    let hooks = '';
    try { hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
    return {
      stop: read(join(root, '.claude', 'settings.json')).includes('ultimate-tester'),
      commit: !!hooks && read(join(root, hooks, 'post-commit')).includes('# ultimate-tester'),
    };
  };
  const busy = () => job.status === 'working';

  return {
    status() {
      const profile = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '';
      const list = parsePersonas(profile);
      const personas = list.map((p) => {
        let savedAt = null;
        try { savedAt = JSON.parse(readFileSync(sessionFile(state, p.key, list), 'utf8')).savedAt; } catch {}
        return { ...p, savedAt };
      });
      const profileReady = !!profile && profile !== TEMPLATE;
      const hasRuns = existsSync(join(state, 'runs')) && readdirSync(join(state, 'runs')).length > 0;
      return {
        profile,
        profileReady,
        // Which version of the profile this page is showing; a save based on an older one is refused.
        profileHash: createHash('sha1').update(profile).digest('hex'),
        // Apps set up before onboarding existed count as onboarded once they have a test.
        onboarded: existsSync(join(state, 'onboarded')) || (profileReady && hasRuns),
        triggers: triggers(),
        // Remote branches, so release choices only show for branches this repo has.
        remotes: remoteBranches(),
        start: parseStart(profile),
        personas,
        // every persona that needs a sign-in has one
        allSignedIn: personas.every((p) => !p.signIn || p.savedAt),
        signingIn: signIn?.persona ?? null,
        running: !!run,
        job,
      };
    },

    // base: the profileHash the page was showing. If the file changed since (a lesson, a note, the other
    // window), the save is refused instead of quietly overwriting it.
    saveProfile(text, base) {
      if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Profile is empty or too long');
      const now = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '';
      if (base && base !== createHash('sha1').update(now).digest('hex')) {
        throw new Error('The profile changed while you were editing (something Tess learned, or another window). Showing the latest; make your edit again.');
      }
      writeFileSync(profileFile, text.trimEnd() + '\n');
    },

    // Tess reads the repo and drafts the profile; takes about a minute.
    draftProfile() {
      if (busy()) throw new Error('Something else is still working');
      set('draft', 'working', 'Tess is reading the repo…');
      const schema = { type: 'object', required: ['profile'], properties: { profile: { type: 'string' } } };
      const ask = `Read this repository (package.json, README, CLAUDE.md or AGENTS.md, .claude/launch.json, .env.example) and write an Ultimate Tester profile for it, in exactly this Markdown shape:

${TEMPLATE}
Rules: Start command runs the app locally on a port nothing else in the repo uses; "Ready when" names its http://localhost URL. Seed: a local-only reset or "none". Allowed URLs: localhost only, and name any production hosts to never touch. Test accounts: if the app needs sign-in, write "Saved session from Ultimate Tester setup" (never a password). Personas: each kind of user whose access differs — plan or feature tiers, staff roles, new versus long-standing accounts, the customer or shopper side, a signed-out visitor — one line each as "- key: who they are", adding "no sign-in" for guests and visitors; 2 to 6 personas, only ones the code shows exist. Must never break: 3 to 5 core flows a user does daily. Existing checks: only the test files a change touches, never full suites. Notes for Tess: keep the placeholder line as it is; the developer fills it in.`;
      const child = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--setting-sources', '',
        '--json-schema', JSON.stringify(schema), '--allowedTools', 'Read', 'Glob', 'Grep', '--disallowedTools', 'Bash', 'Edit', 'Write'],
      { cwd: root, env: { ...process.env, ULTIMATE_TESTER_CHILD: '1' } });
      // Each file Tess opens shows up live on the onboarding screen.
      const rel = (f = '') => f.startsWith(root) ? f.slice(root.length + 1) : f;
      const say = (t) => { if (t && job.steps.at(-1) !== t) job.steps = [...job.steps, t].slice(-40); };
      let buf = '';
      let profile = null;
      child.stdout.on('data', (d) => {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'result') profile = ev.structured_output?.profile ?? null;
          for (const c of ev.type === 'assistant' ? ev.message?.content ?? [] : []) {
            if (c.type !== 'tool_use') continue;
            const i = c.input ?? {};
            say(c.name === 'Read' ? `Reading ${rel(i.file_path)}` : c.name === 'Grep' ? `Searching for “${i.pattern}”` : c.name === 'Glob' ? `Looking for ${i.pattern}` : null);
          }
        }
      });
      child.on('close', () => {
        if (profile?.trim()) {
          writeFileSync(profileFile, profile.trim() + '\n');
          set('draft', 'done', 'Drafted. Read it and fix anything wrong.', job.steps);
        } else set('draft', 'error', 'Tess could not draft the profile. Fill it in by hand.', job.steps);
      });
      child.stdin.end(ask);
    },

    // Starts the app if it is not up, then opens a visible Chrome on it for a person to sign in.
    async signInStart(persona) {
      if (busy() || signIn) throw new Error('Something else is still working');
      const who = personasNow().find((p) => p.key === persona && p.signIn);
      if (!who) return set('signin', 'error', 'Choose a persona from the profile that signs in');
      // Its own port, never a server someone else is running; cookies on localhost carry across ports.
      const { command, url } = parseStart(withPort(existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '', await freePort()));
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
      if (!existsSync(profileFile)) throw new Error('Set up the profile first');
      const body = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('-') ? l : `- ${l}`)).join('\n');
      if (body) writeFileSync(profileFile, setSection(readFileSync(profileFile, 'utf8'), 'Notes for Tess', body));
    },

    // mode: "stop" (when Claude Code finishes), "commit" (after every commit) or "manual".
    setTrigger(mode) {
      if (!['stop', 'commit', 'manual'].includes(mode)) throw new Error('Choose when Tess should test');
      if (mode !== 'manual') execFileSync(process.execPath, [CLI, 'install', mode], { cwd: root, env: childEnv(), stdio: 'ignore' });
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
      if (!existsSync(profileFile)) throw new Error('Set up the profile first');
      const c = clean(check).slice(0, 120);
      writeFileSync(profileFile, addToSection(readFileSync(profileFile, 'utf8'), 'Lessons', c ? `${c}: ${t}` : t));
    },

    // Stops the test started from this window: the whole process group (Tess, her browser, the app she started).
    stopRun() {
      if (!run) throw new Error('No test started from here is running');
      try { process.kill(-run.pid, 'SIGTERM'); } catch {}
      const runs = join(state, 'runs');
      const latest = existsSync(runs) ? readdirSync(runs).sort().at(-1) : null;
      if (latest) writeFileSync(join(runs, latest, 'stopped'), new Date().toISOString());
    },

    // kind: "changes" | "commit" | "range"; target: sha or base..head; note: extra instructions for this run only.
    startRun(kind, target, note) {
      if (typeof note === 'string' && note.length > 1000) throw new Error('Keep the note under 1000 characters');
      if (run) throw new Error('A test is already running');
      const args = kind === 'commit' ? ['--commit', target || 'HEAD'] : kind === 'range' ? ['--range', target] : [];
      if (kind === 'range' && !/^[\w./-]+\.\.[\w./-]+$/.test(target ?? '')) throw new Error('A release is two refs, like origin/prd..HEAD');
      if (kind === 'commit' && target && !/^[\w./-]+$/.test(target)) throw new Error('That is not a commit or branch name');
      // Detached so a test keeps going if the app or engine restarts mid-run.
      if (note?.trim()) args.push('--note', note.trim());
      run = spawn(process.execPath, [CLI, 'run', ...args], { cwd: root, stdio: 'ignore', detached: true, env: childEnv() });
      run.on('close', () => { run = null; });
      run.unref();
    },
  };
}
