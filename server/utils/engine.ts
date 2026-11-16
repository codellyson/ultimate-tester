// The engine's reads over each app's .ultimate-tester folder, plus one actions object per app.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createActions } from '../../actions.js'
import { findApp } from '../../apps.js'

export const SAFE = /^[\w.-]+$/
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : null)
const json = (f: string) => { try { return JSON.parse(read(f) ?? 'null') } catch { return undefined } }
const runsDir = (root: string) => join(root, '.ultimate-tester', 'runs')

export function runsOf(root: string): string[] {
  const dir = runsDir(root)
  return existsSync(dir) ? readdirSync(dir).filter((d: string) => SAFE.test(d)).sort().reverse() : []
}

export function runInfo(root: string, id: string) {
  const dir = join(runsDir(root), id)
  const v = json(join(dir, 'verdict.json'))
  const c = json(join(dir, 'change.json'))
  // No verdict and nothing written for 10 minutes: the run was stopped, not still going.
  const log = join(dir, 'live.log')
  const quiet = Date.now() - statSync(existsSync(log) ? log : dir).mtimeMs > 10 * 60_000
  return { id, status: v?.status ?? (quiet ? 'stopped' : 'running'), summary: v?.summary ?? '', title: c?.message?.split('\n')[0] ?? '' }
}

// Median of recent finished runs, for the "~N min left" estimate.
function typicalDuration(root: string) {
  const ms = runsOf(root).slice(0, 10).map((d) => json(join(runsDir(root), d, 'verdict.json'))?.durationMs).filter(Boolean).sort((a, b) => a - b)
  return ms.length ? ms[Math.floor(ms.length / 2)] : null
}

export function runDetail(root: string, id: string) {
  const dir = join(runsDir(root), id)
  const plan = json(join(dir, 'plan.json'))
  return {
    ...runInfo(root, id),
    // null while the tester is mid-write; the page keeps the last good plan
    plan: plan === undefined ? null : plan,
    planUnreadable: plan === undefined,
    intro: (read(join(dir, 'intro.txt')) ?? '').trim(),
    change: json(join(dir, 'change.json')) ?? null,
    live: existsSync(join(dir, 'live.jpg')) ? { url: json(join(dir, 'live.json'))?.url ?? '' } : null,
    typicalMs: typicalDuration(root),
    steps: (read(join(dir, 'live.log')) ?? '').split('\n').filter(Boolean),
    verdict: json(join(dir, 'verdict.json')) ?? null,
    shots: readdirSync(dir).filter((f: string) => f.endsWith('.png')).sort(),
  }
}

export const runExists = (root: string, id: string) => SAFE.test(id) && existsSync(join(runsDir(root), id))
export const shotPath = (root: string, run: string, file: string) => join(runsDir(root), run, file)

const actions = new Map<string, ReturnType<typeof createActions>>()
export function actionsFor(app: { id: string, root: string }) {
  if (!actions.has(app.id)) actions.set(app.id, createActions(app.root))
  return actions.get(app.id)!
}

// Every per-app route starts here: unknown ids are a 404, never a path.
export function appOr404(id: string | undefined) {
  const app = id ? findApp(id) : null
  if (!app) throw createError({ statusCode: 404, statusMessage: 'no such app' })
  return app
}
