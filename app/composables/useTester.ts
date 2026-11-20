// All of the window's state and its talk with the engine, shared by every component.
import type { Target } from '~/utils/format'

export type App = { id: string, name: string, root: string, profileReady: boolean, signedIn: boolean, onboarded: boolean, running: boolean, last: RunInfo | null }
export type RunInfo = { id: string, status: string, summary: string, title: string, kind?: string | null, target?: string | null, note?: string, counts?: { pass: number, fail: number, unk: number }, shotCount?: number }
export type PlanItem = { name: string, why?: string, source?: string, status: string, note?: string, persona?: string, app?: string, replayed?: boolean }
export type Flow = { name: string, app?: string, replayed?: boolean, status: string, steps?: string[], expected?: string, actual?: string, evidence?: string[], url?: string, persona?: string, needs?: string, setupBy?: 'tess' | 'person', requests?: Req[] }
export type Req = { method: string, path: string, sent?: string, status: number, ms?: number, got?: string, expected?: string }
export type Verdict = { status: string, summary: string, flows: Flow[], durationMs?: number, usage?: string }
export type RunDetail = RunInfo & {
  apps?: { name: string, role: 'app' | 'backend', source?: 'local' | 'dev' | 'missing', branch?: string | null, commit?: string | null, dirty?: boolean, why?: string | null }[] | null
  plan: PlanItem[] | null, planUnreadable: boolean, intro: string, change: { message: string, files: string[], mode: string, note?: string, kind?: string, target?: string | null, source?: { id: string, kind: string, target: string | null, note: string, checks: string[] } } | null,
  live: { url: string } | null, typicalMs: number | null, steps: string[], verdict: Verdict | null, shots: string[]
}
export type General = { model: 'opus' | 'sonnet', timeoutMin: number, notifications: boolean }
export type Persona = { key: string, label: string, signIn: boolean, savedAt: string | null }
export type PlanQuestion = { field: string, question: string, value: unknown, kind: 'choice' | 'lines' | 'text', options?: { value: unknown, label: string }[], objects?: boolean }
export type Setup = {
  profile: string, profileHash: string, profileReady: boolean, planFormat?: "json" | "md" | null, planJson?: Record<string, unknown> | null, backends?: { name: string, repo: string, env: string, whenMissing: 'dev' | 'stop', found: { name: string, where: string, branch: string | null, commit: string | null, dirty: boolean, planOk: boolean } | null }[], planErrors?: string[], questions?: PlanQuestion[], onboarded: boolean, changed?: boolean, triggers: { stop: boolean, commit: boolean }, remotes: string[],
  personas: Persona[], allSignedIn: boolean, signingIn: string | null, running: boolean, start?: { command: string | null, url: string | null },
  job: { kind: string | null, status: string, message: string, steps: string[], since?: number, tail?: string, persona?: string, stages?: { label: string, state: "done" | "now" | "todo" }[] }
}

export const OTHER = '__other__'

const state = reactive({
  apps: [] as App[],
  appId: null as string | null,
  view: null as 'app' | 'setup' | 'run' | 'onboard' | null,
  runId: null as string | null,
  follow: true,
  runs: [] as RunInfo[],
  setup: null as Setup | null,
  detail: null as RunDetail | null,
  plan: [] as PlanItem[], // last good plan: the tester rewrites plan.json mid-run
  flash: '',
  draftDirty: false,
  copyTick: 0, // Test ▸ Copy Report asks the open test to copy itself // a profile edit with unsaved changes is open
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
  sidebar: false, // DESIGN.md: history lives behind the History button; View > Show Sidebar still brings it back
  roomy: true, // the window is wide enough for the sidebar
  inSettings: false, // this page is the Settings window
  home: false, // the Home screen (all apps) is showing
  settingsTab: 'app' as 'general' | 'app', // which Settings tab is open
  general: { model: 'opus', timeoutMin: 12, notifications: true } as General, // app-wide settings, from the engine
  booted: false, // the app list has loaded once; until then nothing renders (no Welcome flash)
})

const OFFLINE = "Can't reach Ultimate Tester's engine. It restarts by itself; try again in a few seconds."
// The native shell's API (Tauri), present only inside the Mac app.
type Tauri = {
  dialog?: { open: (o: object) => Promise<string | null>, ask: (msg: string, o: object) => Promise<boolean> }
  event?: { listen: (name: string, cb: (e: { payload: string }) => void) => Promise<unknown> }
  notification?: { isPermissionGranted: () => Promise<boolean>, requestPermission: () => Promise<string>, sendNotification: (o: { title: string, body?: string }) => void }
  menu?: { Menu: { new: (o: { items: { text: string, action?: () => void, enabled?: boolean }[] }) => Promise<{ popup: () => Promise<void> }> }, PredefinedMenuItem: unknown }
  opener?: { revealItemInDir: (path: string) => Promise<void> }
  window?: { getCurrentWindow: () => { setBadgeLabel: (l?: string) => Promise<void>, listen: (n: string, cb: () => void) => Promise<unknown>, setTheme?: (t: 'light' | 'dark' | null) => Promise<void> } }
  core?: { invoke: (cmd: string, args?: object) => Promise<unknown> }
  webviewWindow?: { WebviewWindow: { getByLabel: (l: string) => Promise<{ show: () => Promise<void>, setFocus: () => Promise<void> } | null> } & (new (label: string, o: object) => unknown) }
}
export const tauri = () => (globalThis as unknown as { __TAURI__?: Tauri }).__TAURI__

async function api<T>(path: string, body?: unknown, method?: 'DELETE'): Promise<T> {
  const r = await fetch(path, method ? { method } : body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => { throw new Error(OFFLINE) })
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
  api<General>('/api/settings').then((g) => { if (!same(g, state.general)) state.general = g }).catch(() => {})
}

// When a test finishes while you're elsewhere: a notification, and a Dock badge until you come back.
const lastSeen = new Map<string, string>()
let unseenProblems = false
const VERDICT: Record<string, string> = { pass: 'All checks passed', fail: 'Something broke', unverified: "Some checks couldn't run", stopped: 'Test stopped' }
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
    if (state.general.notifications && t?.notification && (await t.notification.isPermissionGranted() || (await t.notification.requestPermission()) === 'granted')) {
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
    // Opening an app shows its page; a brand-new app goes through getting started first.
    if (!state.view) state.view = state.inSettings ? 'setup' : !setup.onboarded && !runs.length ? 'onboard' : 'app'
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
// Before anything replaces the screen: an unsaved profile edit is never dropped without asking.
async function leaveDraft() {
  if (!state.draftDirty) return true
  const ok = await askConfirm({ title: 'Discard your edit?', message: 'You have unsaved changes to how Tess tests this app.', okLabel: 'Discard', danger: true })
  if (ok) state.draftDirty = false
  return ok
}

async function selectApp(id: string) {
  if (!(await leaveDraft())) return
  if (!state.inSettings) try { localStorage.setItem(LAST_APP, id) } catch {}
  Object.assign(state, { home: false, appId: id, runId: null, follow: true, setup: null, detail: null, plan: [], view: null })
  history.replaceState(null, '', `?app=${id}`)
  refresh()
}

async function show(v: 'app' | 'setup' | 'run' | 'onboard') {
  if (v !== state.view && !(await leaveDraft())) return
  state.view = v
  state.home = false
  // Only Setup is kept in the URL; onboarding is decided by the app's state, so a reload never lands in it.
  history.replaceState(null, '', `?app=${state.appId}${v === 'setup' ? '&view=setup' : ''}`)
  refresh()
}

async function openRun(id: string, follow = false) {
  if (!(await leaveDraft())) return
  state.runId = id; state.follow = follow; state.plan = []; state.detail = null
  show('run')
}

async function startTest(t: Target) {
  state.menu = null; state.flash = ''
  const { kind, target } = t
  if (kind === 'custom') { state.sheet = true; return }
  try {
    await api(`/api/apps/${state.appId}/run`, { kind, target, note: state.note, replayFrom: t.replayFrom })
    state.note = ''
    state.follow = true
    // Jump to the new test only if the person is still where they started it from.
    const from = { app: state.appId, view: state.view }
    if (!state.inSettings) setTimeout(() => { if (state.appId === from.app && state.view === from.view) show('run') }, 900)
  } catch (e) { state.flash = (e as Error).message }
}

// Run the open test again, exactly as it was asked for (same commit, range or uncommitted changes, same note).
async function rerun(r: { kind?: string | null, target?: string | null, note?: string } | null = state.view === 'run' ? state.detail?.change ?? null : null) {
  if (!r) { state.flash = 'Open a test first, then run it again.'; return }
  state.note = r.note ?? ''
  await startTest({ kind: r.kind ?? 'changes', target: r.target ?? undefined, replayFrom: state.view === 'run' ? state.detail?.id : undefined })
}

async function stopTest() {
  try { state.setup = await api<Setup>(`/api/apps/${state.appId}/stop`, {}); refresh() } catch (e) { state.flash = (e as Error).message }
}

// Settings is its own window in the Mac app (⌘,); in a browser it is the Setup page.
// General settings are saved by the engine, so the CLI (model, time limit) and both windows use the same values.
async function saveGeneral(patch: Partial<General>) {
  try { state.general = await api<General>('/api/settings', patch) } catch (e) { state.flash = (e as Error).message }
}

// tab: which Settings tab to show; null keeps the one used last (⌘,).
const TAB = 'ut-settings-tab'
async function openSettings(tab: 'general' | 'app' | null = 'app') {
  state.menu = null
  if (tab) try { localStorage.setItem(TAB, tab) } catch {}
  const invoke = tauri()?.core?.invoke
  if (!invoke || !state.appId) return show('setup')
  try { await invoke('open_settings', { appId: state.appId }) } catch (e) { state.flash = String(e) }
}

function onMenu(id: string) {
  const act: Record<string, () => void> = {
    'settings': () => openSettings(null),
    'new-test': () => { if (state.appId && state.view !== 'onboard') state.menu = 'new' },
    'add-app': addApp,
    'rerun': rerun,
    'stop': stopTest,
    'toggle-sidebar': () => { state.sidebar = !state.sidebar },
    'show-checks': () => { state.rail = 'checks' },
    'copy-report': () => { if (state.view === 'run') state.copyTick++; else state.flash = 'Open a finished test to copy its report.' },
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
  const typed = () => askText({ title: 'Add an app', message: "The folder of your app's git repo.", okLabel: 'Add', input: { placeholder: '~/code/my-app' } })
  const path = t?.dialog ? await t.dialog.open({ directory: true, title: "Choose your app's repo folder" })
    : await api<{ path: string | null }>('/api/pick-folder', {}).then((r) => r.path, typed)
  if (!path) return
  try { const a = await api<App>('/api/apps', { path }); await loadApps(); selectApp(a.id) } catch (e) { state.flash = (e as Error).message }
}

// Off the list only; the repo, its plan and its saved tests stay on disk.
async function removeApp(id: string) {
  const a = state.apps.find((x) => x.id === id)
  if (!a || !(await askConfirm({ title: `Remove ${a.name} from Ultimate Tester?`, message: 'Its repo, test plan and saved tests stay where they are; you can add it again any time.', okLabel: 'Remove', danger: true }))) return
  try {
    await api(`/api/apps/${id}`, undefined, 'DELETE')
    if (state.appId === id) { state.appId = null; state.home = true }
    await loadApps()
  } catch (e) { state.flash = (e as Error).message }
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
  // Scrollbars appear while a pane scrolls and fade a second later (styled in main.css).
  const fading = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  document.addEventListener('scroll', (e) => {
    const el = e.target as Element
    if (!el?.classList) return
    el.classList.add('scrolling')
    clearTimeout(fading.get(el))
    fading.set(el, setTimeout(() => el.classList.remove('scrolling'), 900))
  }, true)
  // In the Mac app, right-click never shows WebKit's Reload menu: it is left only where text can be copied.
  if (t) document.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest?.('input, textarea, .selectable, .mono')) e.preventDefault()
  })
  // Both windows tell the app about an unsaved edit, so ⌘Q can ask before throwing it away.
  if (t?.core) watch(() => state.draftDirty, (d) => { t.core?.invoke('set_draft', { dirty: d }).catch(() => {}) })
  if (state.inSettings) {
    // Settings stays loaded while hidden, so it re-reads the profile every time it is shown or focused.
    // Never switch apps under an unsaved edit; the person finishes or cancels it first.
    const readTab = () => { try { state.settingsTab = localStorage.getItem(TAB) === 'general' ? 'general' : 'app' } catch {} }
    readTab()
    t?.event?.listen('settings-app', (e) => {
      readTab()
      if (e.payload && e.payload !== state.appId && state.draftDirty) { state.flash = 'Finish or cancel your edit to switch Settings to another app.'; return }
      if (e.payload && e.payload !== state.appId) selectApp(e.payload); else refresh()
    })
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
  // Home has no app in its address, so a reload comes back to Home.
  if (!state.inSettings) watch(() => state.home, (h) => { if (h) history.replaceState(null, '', '/') })
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
  // The main window opens on Home, with the last app loaded behind it, unless a link names an app.
  const home = !state.inSettings && !params.get('app')
  await selectApp(state.appId)
  if (home) state.home = true
  const v = params.get('view')
  if (v === 'setup') show(v)
}

export function useTester() {
  return { state, tauri, saveGeneral, leaveDraft, api, refresh, loadApps, selectApp, show, openRun, startTest, rerun, stopTest, openSettings, addApp, addSample, removeApp, setupAction, boot }
}
