// Tess's voice: Kokoro (af_heart by default), run locally on this Mac. It is about 430 MB with its model, so it
// isn't shipped in the app: the first time someone turns the voice on, it is installed once into
// ~/.ultimate-tester/voice. Until it's ready, the page falls back to the Mac's own voice.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = join(process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester'), 'voice');
const PKG = 'kokoro-js@1.2.1';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const DEFAULT_VOICE = 'af_heart';

let state = { state: 'off', message: '' }; // off | installing | loading | ready | error
let tts = null, preparing = null;
export const voiceStatus = () => ({ ...state, voice: DEFAULT_VOICE });
const installed = () => existsSync(join(DIR, 'node_modules', 'kokoro-js'));

function npmInstall() {
  return new Promise((resolve, reject) => {
    mkdirSync(DIR, { recursive: true });
    if (!existsSync(join(DIR, 'package.json'))) writeFileSync(join(DIR, 'package.json'), '{ "name": "ultimate-tester-voice", "private": true }\n');
    const child = spawn('npm', ['install', PKG, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: DIR, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`npm couldn't install Kokoro: ${err.trim().split('\n').pop() || `exit ${code}`}`))));
  });
}

// Installs Kokoro if needed and loads the model once; safe to call again while it's going.
export function prepareVoice() {
  if (tts || preparing) return preparing ?? Promise.resolve();
  preparing = (async () => {
    try {
      if (!installed()) { state = { state: 'installing', message: "Getting Tess's voice: installing Kokoro (one time, about 330 MB)" }; await npmInstall(); }
      state = { state: 'loading', message: "Getting Tess's voice: loading the model (the first time downloads about 90 MB)" };
      const req = createRequire(join(DIR, 'package.json'));
      const { KokoroTTS } = await import(pathToFileURL(req.resolve('kokoro-js')).href);
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'cpu' });
      state = { state: 'ready', message: '' };
    } catch (e) {
      state = { state: 'error', message: e.message };
    } finally { preparing = null; }
  })();
  return preparing;
}

// One line as a WAV file, or null when the voice isn't ready (the page then uses the Mac's voice).
export async function speak(text, voice = DEFAULT_VOICE) {
  if (!tts) return null;
  const clean = String(text ?? '').replace(/`/g, '').trim().slice(0, 600);
  if (!clean) return null;
  // A little faster than her natural pace, so a line is over before the test has moved far past it.
  const audio = await tts.generate(clean, { voice, speed: 1.15 });
  return Buffer.from(audio.toWav());
}
