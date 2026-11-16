// What the window's Setup screen and run buttons can do, for one repo.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStart, withPort, parsePersonas } from './lib.js';
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
  let job = { kind: null, status: 'idle', message: '' };
  let signIn = null; // { win, app }
  let run = null;

  const set = (kind, status, message) => { job = { kind, status, message }; };
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
      return {
        profile,
        profileReady: !!profile && profile !== TEMPLATE,
        start: parseStart(profile),
        personas,
        // every persona that needs a sign-in has one
        allSignedIn: personas.every((p) => !p.signIn || p.savedAt),
        signingIn: signIn?.persona ?? null,
        running: !!run,
        job,
      };
    },

    saveProfile(text) {
      if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Profile is empty or too long');
      writeFileSync(profileFile, text.trimEnd() + '\n');
    },

    // Tess reads the repo and drafts the profile; takes about a minute.
    draftProfile() {
      if (busy()) throw new Error('Something else is still working');
      set('draft', 'working', 'Tess is reading the repo…');
      const schema = { type: 'object', required: ['profile'], properties: { profile: { type: 'string' } } };
      const ask = `Read this repository (package.json, README, CLAUDE.md or AGENTS.md, .claude/launch.json, .env.example) and write an Ultimate Tester profile for it, in exactly this Markdown shape:

${TEMPLATE}
Rules: Start command runs the app locally on a port nothing else in the repo uses; "Ready when" names its http://localhost URL. Seed: a local-only reset or "none". Allowed URLs: localhost only, and name any production hosts to never touch. Test accounts: if the app needs sign-in, write "Saved session from Ultimate Tester setup" (never a password). Personas: each kind of user whose access differs — plan or feature tiers, staff roles, new versus long-standing accounts, the customer or shopper side, a signed-out visitor — one line each as "- key: who they are", adding "no sign-in" for guests and visitors; 2 to 6 personas, only ones the code shows exist. Must never break: 3 to 5 core flows a user does daily. Existing checks: only the test files a change touches, never full suites.`;
      const child = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'json', '--no-session-persistence', '--setting-sources', '',
        '--json-schema', JSON.stringify(schema), '--allowedTools', 'Read', 'Glob', 'Grep', '--disallowedTools', 'Bash', 'Edit', 'Write'],
      { cwd: root, env: { ...process.env, ULTIMATE_TESTER_CHILD: '1' } });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', () => {
        try {
          writeFileSync(profileFile, JSON.parse(out).structured_output.profile.trim() + '\n');
          set('draft', 'done', 'Drafted. Read it and fix anything wrong.');
        } catch { set('draft', 'error', 'Tess could not draft the profile. Fill it in by hand.'); }
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

    // kind: "changes" | "commit" | "range"; target: sha or base..head.
    startRun(kind, target) {
      if (run) throw new Error('A test is already running');
      const args = kind === 'commit' ? ['--commit', target || 'HEAD'] : kind === 'range' ? ['--range', target] : [];
      if (kind === 'range' && !/^[\w./-]+\.\.[\w./-]+$/.test(target ?? '')) throw new Error('A release is two refs, like origin/prd..HEAD');
      if (kind === 'commit' && target && !/^[\w./-]+$/.test(target)) throw new Error('That is not a commit or branch name');
      // Detached so a test keeps going if the app or engine restarts mid-run.
      run = spawn(process.execPath, [CLI, 'run', ...args], { cwd: root, stdio: 'ignore', detached: true, env: childEnv() });
      run.on('close', () => { run = null; });
      run.unref();
    },
  };
}
