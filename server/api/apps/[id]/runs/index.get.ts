export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  return runsOf(app.root).slice(0, 300).map((id) => runInfo(app.root, id))
})
