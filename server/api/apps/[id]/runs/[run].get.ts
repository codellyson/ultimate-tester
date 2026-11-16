export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  const run = getRouterParam(event, 'run') ?? ''
  if (!runExists(app.root, run)) throw createError({ statusCode: 404, statusMessage: 'no such run' })
  return runDetail(app.root, run)
})
