import { speak } from '~~/voice.js'

// One of Tess's lines as speech (WAV). 409 while the voice isn't ready: the page uses the Mac's voice then.
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as { text?: string } | null
  const wav = await speak(body?.text ?? '')
  if (!wav) throw createError({ statusCode: 409, statusMessage: 'Voice not ready' })
  setHeader(event, 'content-type', 'audio/wav')
  return wav
})
