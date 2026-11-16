// All of the window's state and its talk with the engine, shared by every component.
import type { Target } from '~/utils/format'

export type App = { id: string, name: string, root: string, profileReady: boolean, signedIn: boolean, running: boolean, last: RunInfo | null }
export type RunInfo = { id: string, status: string, summary: string, title: string }
export type PlanItem = { name: string, why?: string, source?: string, status: string, note?: string, persona?: string }
export type Flow = { name: string, status: string, steps?: string[], expected?: string, actual?: string, evidence?: string[], persona?: string }
export type Verdict = { status: string, summary: string, flows: Flow[], durationMs?: number, usage?: string }
export type RunDetail = RunInfo & {
  plan: PlanItem[] | null, planUnreadable: boolean, intro: string, change: { message: string, files: string[], mode: string, note?: string } | null,
  live: { url: string } | null, typicalMs: number | null, steps: string[], verdict: Verdict | null, shots: string[]
}
export type Persona = { key: string, label: string, signIn: boolean, savedAt: string | null }
export type Setup = {
  profile: string, profileReady: boolean, onboarded: boolean, triggers: { stop: boolean, commit: boolean }, remotes: string[],
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
  sel: { id: null as string | null, check: null as string | null, shot: 0 },
  unfolded: new Set<string>(),
  confirmJustDrafted: false,
  rail: 'checks' as 'checks' | 'log',
  menu: null as 'app' | 'new' | 'runs' | null,
  offline: false, // the engine stopped answering; polling keeps trying
  cmdk: false,
  note: '', // extra instructions for the next test only
})

const OFFLINE = "Can't reach Ultimate Tester's engine. It restarts by itself; try again in a few seconds."
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
    if (!state.view) state.view = !setup.onboarded ? 'onboard' : !setup.profileReady || (!setup.allSignedIn && !runs.length) ? 'setup' : runs[0] ? 'run' : 'setup'
    if (state.view === 'run' && state.runId) {
      const d = await api<RunDetail>(`/api/apps/${id}/runs/${state.runId}`)
      if (!same(d, state.detail)) state.detail = d
      if (!d.planUnreadable) { const p = Array.isArray(d.plan) ? d.plan : []; if (!same(p, state.plan)) state.plan = p }
    }
  } catch (e) {
    if ((e as Error).message === OFFLINE) state.offline = true
    else state.flash = (e as Error).message
  }
}

function selectApp(id: string) {
  Object.assign(state, { appId: id, runId: null, follow: true, setup: null, detail: null, plan: [], view: null })
  history.replaceState(null, '', `?app=${id}`)
  refresh()
}

function show(v: 'setup' | 'run' | 'onboard') {
  state.view = v
  history.replaceState(null, '', `?app=${state.appId}${v !== 'run' ? `&view=${v}` : ''}`)
  refresh()
}

function openRun(id: string, follow = false) {
  state.runId = id; state.follow = follow; state.plan = []; state.detail = null
  show('run')
}

async function startTest(t: Target) {
  state.menu = null; state.flash = ''
  let { kind, target } = t
  if (kind === 'custom') {
    const v = prompt('A commit (like abc1234) or a release (like origin/prd..HEAD)')
    if (!v) return
    target = v; kind = v.includes('..') ? 'range' : 'commit'
  }
  try {
    await api(`/api/apps/${state.appId}/run`, { kind, target, note: state.note })
    state.note = ''
    state.follow = true
    setTimeout(() => show('run'), 900)
  } catch (e) { state.flash = (e as Error).message }
}

async function addApp() {
  state.menu = null
  const tauri = (window as unknown as { __TAURI__?: { dialog?: { open: (o: object) => Promise<string | null> } } }).__TAURI__
  const path = tauri?.dialog ? await tauri.dialog.open({ directory: true, title: "Choose your app's repo folder" }) : prompt("Path to your app's repo folder")
  if (!path) return
  try { const a = await api<App>('/api/apps', { path }); await loadApps(); selectApp(a.id) } catch (e) { state.flash = (e as Error).message }
}

async function addSample() {
  state.flash = ''
  try { const a = await api<App>('/api/apps/sample', {}); await loadApps(); selectApp(a.id) } catch (e) { state.flash = (e as Error).message }
}

async function setupAction(path: string, body: unknown = {}) {
  try { state.setup = await api<Setup>(`/api/apps/${state.appId}/${path}`, body); return true } catch (e) { state.flash = (e as Error).message; return false }
}

let started = false
async function boot() {
  if (started) return
  started = true
  const params = new URLSearchParams(location.search)
  await loadApps().catch(() => {})
  state.appId = params.get('app')
  if (!state.appId || !state.apps.some((a) => a.id === state.appId)) state.appId = state.apps[0]?.id ?? null
  // Polling starts even with no app yet, so the first app added gets live updates.
  setInterval(() => {
    const s = state.setup
    if (state.view === 'run' || state.view === 'onboard' || s?.job?.status === 'working' || s?.signingIn) refresh()
  }, 1000)
  setInterval(() => loadApps().catch(() => {}), 5000)
  if (!state.appId) return
  selectApp(state.appId)
  const v = params.get('view')
  if (v === 'setup' || v === 'onboard') show(v)
}

export function useTester() {
  return { state, api, refresh, loadApps, selectApp, show, openRun, startTest, addApp, addSample, setupAction, boot }
}
