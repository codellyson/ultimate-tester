// Runs the browser the tester drives, and streams its screen into the run folder
// (live.jpg + live.json) so the Ultimate Tester window can show it live.
import { spawn } from 'node:child_process';
import { recordStarted, forgetStarted } from './started.js';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export const CHROME = [
  process.env.ULTIMATE_TESTER_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

export const freePort = () => new Promise((res) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(profileDir, { headed = false, url = 'about:blank' } = {}) {
  const port = await freePort();
  const chrome = spawn(CHROME, [
    ...(headed ? [] : ['--headless=new']), `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--window-size=1280,800', '--no-first-run', '--no-default-browser-check', url,
  ], { stdio: 'ignore' });
  const endpoint = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${endpoint}/json/version`); break; } catch { await sleep(100); }
  }
  return { chrome, endpoint };
}

// One CDP call on the browser-level socket.
async function browserCall(endpoint, method, params = {}) {
  const { webSocketDebuggerUrl } = await (await fetch(`${endpoint}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.send(JSON.stringify({ id: 1, method, params }));
  const reply = await new Promise((r) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) r(d); }; });
  ws.close();
  if (reply.error) throw new Error(reply.error.message);
  return reply.result;
}

// Opens a visible Chrome on the app so a person signs in their own way (password, SSO, code).
// Returns save(), which keeps the session's cookies, and close().
export async function signInWindow(url, profileDir) {
  if (!CHROME) throw new Error('Google Chrome not found; set ULTIMATE_TESTER_CHROME');
  const { chrome, endpoint } = await launch(profileDir, { headed: true, url });
  return {
    save: async (file) => {
      const { cookies } = await browserCall(endpoint, 'Storage.getCookies');
      // Nothing to keep yet: save nothing, so the person isn't shown as signed in when they aren't.
      if (cookies.length) writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), url, cookies }), { mode: 0o600 });
      return cookies.length;
    },
    close: () => chrome.kill(),
  };
}

// Swaps the running browser to one persona's saved sign-in, or to signed out when file is null.
// shortcut: restores cookies only, not localStorage; add a page-init script if an app keeps its sign-in there.
export async function useSession(endpoint, file) {
  await browserCall(endpoint, 'Storage.clearCookies');
  if (!file) return 0;
  const { cookies } = JSON.parse(readFileSync(file, 'utf8'));
  await browserCall(endpoint, 'Storage.setCookies', { cookies });
  return cookies.length;
}

// Returns { endpoint, stop } or null when no Chrome is found (the tester then launches its own browser).
// The browser starts signed out; the tester switches persona with `ultimate-tester as <key>`.
export async function startBrowser(runDir) {
  if (!CHROME) return null;
  const { chrome, endpoint } = await launch(join(runDir, 'chrome-profile'));
  recordStarted(chrome.pid, join(runDir, 'chrome-profile'), { group: false });

  let stopped = false, ws = null, attachedTo = null, offline = false;
  const frame = join(runDir, 'live.jpg');
  const stream = async () => {
    while (!stopped) {
      try {
        const pages = (await (await fetch(`${endpoint}/json`)).json()).filter((t) => t.type === 'page');
        // Follow the newest page the tester opened.
        const page = pages.find((p) => !p.url.startsWith('about:')) ?? pages[0];
        // Keep the last real screen when the app is stopped at the end, not Chrome's error page.
        offline = !page || page.url.startsWith('chrome-error:');
        if (!offline) writeFileSync(join(runDir, 'live.json'), JSON.stringify({ url: page.url }));
        if (page && page.id !== attachedTo) {
          ws?.close();
          attachedTo = page.id;
          ws = new WebSocket(page.webSocketDebuggerUrl);
          let id = 0;
          const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
          ws.onopen = () => send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
          ws.onmessage = (m) => {
            const msg = JSON.parse(m.data);
            if (msg.method !== 'Page.screencastFrame') return;
            if (!offline) {
              writeFileSync(`${frame}.tmp`, Buffer.from(msg.params.data, 'base64'));
              renameSync(`${frame}.tmp`, frame); // the window never reads a half-written frame
            }
            send('Page.screencastFrameAck', { sessionId: msg.params.sessionId });
          };
          ws.onclose = () => { if (attachedTo === page.id) attachedTo = null; };
        }
      } catch {}
      await sleep(1000);
    }
  };
  stream();
  return {
    endpoint,
    stop: () => { stopped = true; ws?.close(); forgetStarted(chrome.pid); chrome.kill(); },
  };
}
