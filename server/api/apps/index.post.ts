import { addApp } from '~~/apps.js'

export default defineEventHandler(async (event) => {
  const body: { path?: string } = (await readBody(event).catch(() => null)) ?? {}
  try { return addApp(body.path) } catch (e) { throw createError({ statusCode: 400, statusMessage: (e as Error).message }) }
})
