import { writeSettings } from '~~/apps.js'

export default defineEventHandler(async (event) => {
  try { return writeSettings((await readBody(event)) ?? {}) } catch (e) { throw createError({ statusCode: 400, statusMessage: (e as Error).message }) }
})
