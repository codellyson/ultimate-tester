import { removeApp } from '~~/apps.js'
import { removeWork } from '~~/workspace.js'

// Off the list, and Ultimate Tester's own copies of it go too. The repo, its test plan and its saved tests stay.
export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  if (actionsFor(app).status().running) throw createError({ statusCode: 409, statusMessage: 'Stop the running test first' })
  removeApp(app.id)
  removeWork(app.root)
  return { ok: true }
})
