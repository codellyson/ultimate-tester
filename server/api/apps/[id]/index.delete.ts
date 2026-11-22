import { removeApp } from '~~/apps.js'
import { forgetApp } from '~~/forget.js'

// Forgets the app: off the list, and everything Ultimate Tester stored for it goes (see forget.js).
export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  if (actionsFor(app).status().running) throw createError({ statusCode: 409, statusMessage: 'Stop the running test first' })
  removeApp(app.id)
  forgetApp(app.root)
  return { ok: true }
})
