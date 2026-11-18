import { rmSync } from 'node:fs'
import { join } from 'node:path'

// One saved test: its verdict, screenshots and logs. A running test is stopped first, not deleted.
export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  const run = getRouterParam(event, 'run') ?? ''
  // Only a test's own timestamped folder: never '.', '..' or anything else SAFE would let through.
  if (!/^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(run) || !runExists(app.root, run)) throw createError({ statusCode: 404, statusMessage: 'no such run' })
  if (runInfo(app.root, run).status === 'running') throw createError({ statusCode: 409, statusMessage: 'Stop this test before deleting it' })
  rmSync(join(app.root, '.ultimate-tester', 'runs', run), { recursive: true, force: true })
  return { ok: true }
})
