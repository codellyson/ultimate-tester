// All of the window's state and its talk with the engine, shared by every component.
import type { Target } from '~/utils/format'

export type App = { id: string, name: string, root: string, profileReady: boolean, signedIn: boolean, running: boolean, last: RunInfo | null }
export type RunInfo = { id: string, status: string, summary: string, title: string, kind?: string | null, target?: string | null, note?: string }
export type PlanItem = { name: string, why?: string, source?: string, status: string, note?: string, persona?: string }
export type Flow = { name: string, status: string, steps?: string[], expected?: string, actual?: string, evidence?: string[], persona?: string }
export type Verdict = { status: string, summary: string, flows: Flow[], durationMs?: number, usage?: string }
export type RunDetail = RunInfo & {
  plan: PlanItem[] | null, planUnreadable: boolean, intro: string, change: { message: string, files: string[], mode: string, note?: string, kind?: string, target?: string | null } | null,
  live: { url: string } | null, typicalMs: number | null, steps: string[], verdict: Verdict | null, shots: string[]
}
export type Persona = { key: string, label: string, signIn: boolean, savedAt: string | null }
export type Setup = {
  profile: string, profileHash: string, profileReady: boolean, onboarded: boolean, triggers: { stop: boolean, commit: boolean }, remotes: string[],
  personas: Persona[], allSignedIn: boolean, signingIn: string | null, running: boolean,
  job: { kind: string | null, status: string, message: string, steps: string[] }
}

export const OTHER = '__other__'

const state = reactive({
  apps: [] as App[],
  appId: null as string | null,
  view: null as 'setup' | 'run' | 'onboard' | null,
  runId: null as string | null,
  follow: true,
  runs: [] as RunInfo[],
  setup: null as Setup | null,
  detail: null as RunDetail | null,
  plan: [] as PlanItem[], // last good plan: the tester rewrites plan.json mid-run
  flash: '',
  dismissed: '', // an error the person closed: the next poll doesn't bring the same one back
  sel: { id: null as string | null, check: null as string | null, shot: 0 },
  unfolded: new Set<string>(),
  confirmJustDrafted: false,
  rail: 'checks' as 'checks' | 'log',
  menu: null as 'app' | 'new' | 'runs' | null,
  offline: false, // the engine stopped answering; polling keeps trying
  cmdk: false,
  note: '', // extra instructions for the next test only
  sheet: false, // the "Test a commit or range" sheet
  sidebar: true,
  roomy: true, // the window is wide enough for the sidebar
  inSettings: false, // this page is the Settings window
  booted: false, // the app list has loaded once; until then nothing renders (no Welcome flash)
})

const OFFLINE = "Can't reach Ultimate Tester's engine. It restarts by itself; try again in a few seconds."
// The native shell's API (Tauri), present only inside the Mac app.
type Tauri = {
  dialog?: { open: (o: object) => Promise<string | null> }
  event?: { listen: (name: string, cb: (e: { payload: string }) => void) => Promise<unknown> }
  notification?: { isPermissionGranted: () => Promise<boolean>, requestPermission: () => Promise<string>, sendNotification: (o: { title: string, body?: string }) => void }
  menu?: { Menu: { new: (o: { items: { text: string, action?: () => void, enabled?: boolean }[] }) => Promise<{ popup: () => Promise<void> }> }, PredefinedMenuItem: unknown }
  opener?: { revealItemInDir: (path: string) => Promise<void> }
  window?: { getCurrentWindow: () => { setBadgeLabel: (l?: string) => Promise<void>, listen: (n: string, cb: () => void) => Promise<unknown> } }
  core?: { invoke: (cmd: string, args?: object) => Promise<unknown> }
  webviewWindow?: { WebviewWindow: { getByLabel: (l: string) => Promise<{ show: () => Promise<void>, setFocus: () => Promise<void> } | null> } & (new (label: string, o: object) => unknown) }
}
export const tauri = () => (globalThis as unknown as { __TAURI__?: Tauri }).__TAURI__

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => { throw new Error(OFFLINE) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.statusMessage || j.message || 'Something went wrong')
  return j as T
}

// Only replace what changed, so Vue leaves untouched DOM (and focus) alone.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function loadApps() {
  const apps = await api<App[]>('/api/apps')
  if (!same(apps, state.apps)) state.apps = apps
  // First good answer: now we know whether there are apps. If the engine was down at launch, pick one now.
  if (!state.booted) {
    state.booted = true
    if (bootDone && !state.appId && apps[0]) selectApp(apps[0].id)
  }
  if (!state.inSettings) announce(apps)
}

// When a test finishes while you're elsewhere: a notification, and a Dock badge until you come back.
const lastSeen = new Map<string, string>()
let unseenProblems = false
const VERDICT: Record<string, string> = { pass: 'Safe to push', fail: "Don't push yet", unverified: "Couldn't check everything", stopped: 'Test stopped' }
async function announce(apps: App[]) {
  const t = tauri()
  for (const a of apps) {
    const now = a.last ? `${a.last.id}|${a.last.status}` : ''
    const before = lastSeen.get(a.id)
    lastSeen.set(a.id, now)
    if (!before || !a.last || a.last.status === 'running') continue
    const [id, status] = before.split('|')
    if (status !== 'running' || id !== a.last.id || document.hasFocus()) continue
    if (a.last.status !== 'pass') unseenProblems = true
    if (t?.notification && (await t.notification.isPermissionGranted() || (await t.notification.requestPermission()) === 'granted')) {
      t.notification.sendNotification({ title: `${VERDICT[a.last.status] ?? 'Test finished'} · ${a.name}`, body: (a.last.summary || short(a.last.title)).slice(0, 180) })
    }
  }
  const running = apps.filter((a) => a.last?.status === 'running').length
  t?.window?.getCurrentWindow().setBadgeLabel(running ? String(running) : unseenProblems ? '!' : undefined).catch(() => {})
}

async function refresh() {
  const id = state.appId
  if (!id) return
  try {
    const [setup, runs] = await Promise.all([api<Setup>(`/api/apps/${id}/setup`), api<RunInfo[]>(`/api/apps/${id}/runs`)])
    if (id !== state.appId) return
    // A good answer means the engine is back.
    state.offline = false
    if (state.flash === OFFLINE) state.flash = ''
    if (!same(setup, state.setup)) state.setup = setup
    if (!same(runs, state.runs)) state.runs = runs
    if (state.follow) state.runId = runs[0]?.id ?? null
    if (!state.view) state.view = state.inSettings ? 'setup' : !setup.onboarded ? 'onboard' : !setup.profileReady || (!setup.allSignedIn && !runs.length) ? 'setup' : runs[0] ? 'run' : 'setup'
    if (state.view === 'run' && state.runId) {
      const d = await api<RunDetail>(`/api/apps/${id}/runs/${state.runId}`)
      if (!same(d, state.detail)) state.detail = d
      if (!d.planUnreadable) { const p = Array.isArray(d.plan) ? d.plan : []; if (!same(p, state.plan)) state.plan = p }
    }
  } catch (e) {
    if ((e as Error).message === OFFLINE) state.offline = true
    else if ((e as Error).message !== state.dismissed) state.flash = (e as Error).message
  }
}

// The app you were on comes back next launch (per-viewer convenience; storage may be unavailable).
const LAST_APP = 'ut.lastApp'
function selectApp(id: string) {
  if (!state.inSettings) try { localStorage.setItem(LAST_APP, id) } catch {}
  Object.assign(state, { appId: id, runId: null, follow: true, setup: null, detail: null, plan: [], view: null })
  history.replaceState(null, '', `?app=${id}`)
  refresh()
}

function show(v: 'setup' | 'run' | 'onboard') {
  state.view = v
  // Only Setup is kept in the URL; onboarding is decided by the app's state, so a reload never lands in it.
  history.replaceState(null, '', `?app=${state.appId}${v === 'setup' ? '&view=setup' : ''}`)
  refresh()
}

function openRun(id: string, follow = false) {
  state.runId = id; state.follow = follow; state.plan = []; state.detail = null
  show('run')
}

async function startTest(t: Target) {
  state.menu = null; state.flash = ''
  const { kind, target } = t
  if (kind === 'custom') { state.sheet = true; return }
  try {
    await api(`/api/apps/${state.appId}/run`, { kind, target, note: state.note })
    state.note = ''
    state.follow = true
    if (!state.inSettings) setTimeout(() => show('run'), 900)
  } catch (e) { state.flash = (e as Error).message }
}

// Run the open test again, exactly as it was asked for (same commit, range or uncommitted changes, same note).
async function rerun(r: { kind?: string | null, target?: string | null, note?: string } | null = state.view === 'run' ? state.detail?.change ?? null : null) {
  if (!r) { state.flash = 'Open a test first, then run it again.'; return }
  state.note = r.note ?? ''
  await startTest({ kind: r.kind ?? 'changes', target: r.target ?? undefined })
}

async function stopTest() {
  try { state.setup = await api<Setup>(`/api/apps/${state.appId}/stop`, {}); refresh() } catch (e) { state.flash = (e as Error).message }
}

// Settings is its own window in the Mac app (⌘,); in a browser it is the Setup page.
async function openSettings() {
  state.menu = null
  const invoke = tauri()?.core?.invoke
  if (!invoke || !state.appId) return show('setup')
  try { await invoke('open_settings', { appId: state.appId }) } catch (e) { state.flash = String(e) }
}

function onMenu(id: string) {
  const act: Record<string, () => void> = {
    'settings': openSettings,
    'new-test': () => { if (state.appId && state.view !== 'onboard') state.menu = 'new' },
    'add-app': addApp,
    'rerun': rerun,
    'stop': stopTest,
    'toggle-sidebar': () => { state.sidebar = !state.sidebar },
    'show-checks': () => { state.rail = 'checks' },
    'show-log': () => { state.rail = 'log' },
    'commands': () => { state.menu = null; state.cmdk = true },
    'getting-started': () => { if (state.appId) show('onboard') },
  }
  const recent = id.match(/^recent-(\d)$/)
  if (recent) { const i = Number(recent[1]) - 1; const r = state.runs[i]; if (r) openRun(r.id, i === 0); return }
  act[id]?.()
}

async function addApp() {
  state.menu = null
  const t = tauri()
  const path = t?.dialog ? await t.dialog.open({ directory: true, title: "Choose your app's repo folder" }) : prompt("Path to your app's repo folder")
  if (!path) return
  try { const a = await api<App>('/api/apps', { path }); await loadApps(); selectApp(a.id) } catch (e) { state.flash = (e as Error).message }
}

async function addSample() {
  state.flash = ''
  try { const a = await api<App>('/api/apps/sample', {}); await loadApps(); selectApp(a.id) } catch (e) { state.flash = (e as Error).message }
}

async function setupAction(path: string, body: unknown = {}) {
  try { state.setup = await api<Setup>(`/api/apps/${state.appId}/${path}`, body); return true } catch (e) {
    state.flash = (e as Error).message
    refresh() // show what is really on disk now (e.g. after a refused, out-of-date save)
    return false
  }
}

let started = false
let bootDone = false // boot has chosen the app from the URL; later picks are for a late engine
async function boot() {
  if (started) return
  started = true
  const params = new URLSearchParams(location.search)
  state.inSettings = params.get('window') === 'settings'
  const t = tauri()
  // In the Mac app, right-click never shows WebKit's Reload menu: it is left only where text can be copied.
  if (t) document.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest?.('input, textarea, .selectable, .mono')) e.preventDefault()
  })
  if (state.inSettings) {
    // Settings stays loaded while hidden, so it re-reads the profile every time it is shown or focused.
    t?.event?.listen('settings-app', (e) => { if (e.payload && e.payload !== state.appId) selectApp(e.payload); else refresh() })
    window.addEventListener('focus', () => refresh())
  }
  if (!state.inSettings && t?.core) {
    // Keep the menu bar honest: greyed out when a command can't run, latest tests by name.
    const menuState = computed(() => ({
      newTest: !!state.appId && state.view !== 'onboard' && !!state.setup?.profileReady && !state.setup?.running,
      rerun: state.view === 'run' && !!state.detail?.change && !state.setup?.running,
      stop: !!state.setup?.running,
      sidebarShown: state.sidebar,
      sidebarAvailable: state.roomy && (state.view === 'run' || state.view === 'setup'),
      recent: state.runs.slice(0, 4).map((r) => `${short(r.title)} · ${when(r.id)}`),
      testing: state.apps.some((a) => a.last?.status === 'running'),
    }))
    watch(menuState, (m) => { t.core?.invoke('set_menu_state', m).catch(() => {}) }, { immediate: true })
  }
  if (!state.inSettings) {
    t?.event?.listen('menu', (e) => onMenu(e.payload))
    window.addEventListener('focus', () => { unseenProblems = false; announce(state.apps) })
  }
  await loadApps().catch(() => {})
  state.appId = params.get('app') ?? (() => { try { return localStorage.getItem(LAST_APP) } catch { return null } })()
  if (!state.appId || !state.apps.some((a) => a.id === state.appId)) state.appId = state.apps[0]?.id ?? null
  // Polling starts even with no app yet, so the first app added gets live updates.
  // Every second only while something is happening; otherwise every 10s, and at once when the window comes back.
  let tick = 0
  setInterval(() => {
    const s = state.setup
    const busy = s?.running || s?.job?.status === 'working' || !!s?.signingIn || state.detail?.status === 'running'
    if (busy || ++tick % 10 === 0) refresh()
  }, 1000)
  window.addEventListener('focus', () => refresh())
  setInterval(() => loadApps().catch(() => {}), 5000)
  bootDone = true
  if (!state.appId) return
  selectApp(state.appId)
  const v = params.get('view')
  if (v === 'setup') show(v)
}

export function useTester() {
  return { state, tauri, api, refresh, loadApps, selectApp, show, openRun, startTest, rerun, stopTest, openSettings, addApp, addSample, setupAction, boot }
}
