// Only this machine's own page may use the engine: a wrong Host is DNS rebinding, a foreign Origin on a write is another site.
export default defineEventHandler((event) => {
  const port = getRequestURL(event).port || '80'
  const local = new Set([`localhost:${port}`, `127.0.0.1:${port}`])
  if (!local.has(getRequestHeader(event, 'host') ?? '')) throw createError({ statusCode: 403, statusMessage: 'wrong host' })
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    const origin = getRequestHeader(event, 'origin') ?? ''
    const ok = [...local].some((h) => origin === `http://${h}`) || origin === 'tauri://localhost' || origin === 'http://tauri.localhost'
    if (!ok) throw createError({ statusCode: 403, statusMessage: 'wrong origin' })
  }
})
