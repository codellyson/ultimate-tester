import { removeApp } from '~~/apps.js'

// Off the list only: the repo, its .ultimate-tester.md and its saved tests stay on disk.
export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  if (actionsFor(app).status().running) throw createError({ statusCode: 409, statusMessage: 'Stop the running test first' })
  removeApp(app.id)
  return { ok: true }
})
