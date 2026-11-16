import { existsSync, readFileSync } from 'node:fs'

// Run ids and file names come from the page: plain names only, never paths.
export default defineEventHandler((event) => {
  const app = appOr404(getRouterParam(event, 'id'))
  const run = getRouterParam(event, 'run') ?? ''
  const file = getRouterParam(event, 'file') ?? ''
  if (!SAFE.test(run) || !SAFE.test(file) || !/\.(png|jpg)$/.test(file)) throw createError({ statusCode: 404, statusMessage: 'not found' })
  const f = shotPath(app.root, run, file)
  if (!existsSync(f)) throw createError({ statusCode: 404, statusMessage: 'no such file' })
  setHeader(event, 'content-type', file.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
  setHeader(event, 'cache-control', 'no-store')
  return readFileSync(f)
})
