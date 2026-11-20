// Tess, read aloud: her lines while she tests and her summary when she's done. Off unless turned on, kept per
// Mac in localStorage (both windows share it). Her voice is Kokoro's af_heart, run by the engine on this Mac,
// set up once the first time the voice is turned on. Until it's ready nothing is spoken: the page says the
// voice isn't available, and why.
const KEY = 'ut-voice'
const read = () => { try { return localStorage.getItem(KEY) === 'on' } catch { return false } }
const on = ref(read())
const status = ref<{ state: 'off' | 'installing' | 'loading' | 'ready' | 'error', message: string }>({ state: 'off', message: '' })

let polling: ReturnType<typeof setInterval> | null = null
async function poll() {
  try { status.value = await (await fetch('/api/voice')).json() } catch {}
  if (polling && !['installing', 'loading'].includes(status.value.state)) { clearInterval(polling); polling = null }
}
async function prepare() {
  try { status.value = await (await fetch('/api/voice/prepare', { method: 'POST' })).json() } catch { return }
  if (!polling && ['installing', 'loading'].includes(status.value.state)) polling = setInterval(poll, 2000)
}
if (typeof window !== 'undefined') {
  addEventListener('storage', (e: StorageEvent) => { if (e.key === KEY) on.value = read() })
  // Know at once whether the voice is ready; turned on before, get it ready again (the engine keeps the
  // model in memory only while it runs).
  setTimeout(() => (on.value ? prepare() : poll()), 1000)
}

// Kokoro playback: one line at a time; a newer line replaces any that is still waiting, so the voice never lags.
let playing: HTMLAudioElement | null = null
let waiting: string | null = null
async function sayKokoro(text: string, interrupt: boolean) {
  if (interrupt && playing) { playing.pause(); playing = null }
  if (playing) { waiting = text; return }
  let res: Response
  try { res = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }) } catch { return }
  if (!res.ok) return
  const url = URL.createObjectURL(await res.blob())
  const audio = new Audio(url)
  playing = audio
  const next = () => { URL.revokeObjectURL(url); if (playing === audio) playing = null; const w = waiting; waiting = null; if (w && on.value) sayKokoro(w, false) }
  audio.onended = next
  audio.onerror = next
  audio.play().catch(next)
}

export function useVoice() {
  const supported = typeof window !== 'undefined' && 'Audio' in window
  // Resolves once the engine has answered, so the first line after turning it on uses the right voice.
  async function set(next: boolean) {
    on.value = next
    try { localStorage.setItem(KEY, next ? 'on' : 'off') } catch {}
    if (next) await prepare()
    else stop()
  }
  function say(text: string, { interrupt = false } = {}) {
    // Never read code aloud: drop JSON and quoted code, which older summaries may still contain.
    const clean = text.replace(/\{[^{}]*\}/g, '').replace(/`[^`]*`/g, '').replace(/\s{2,}/g, ' ').trim()
    if (!on.value || !clean) return
    if (status.value.state === 'ready') sayKokoro(clean, interrupt)
  }
  function stop() { waiting = null; if (playing) { playing.pause(); playing = null } }
  // Why nothing is spoken while the voice is on, or null when it's ready (or off).
  const unavailable = computed(() => !on.value || status.value.state === 'ready' ? null
    : status.value.state === 'error' ? `Voice not available: ${status.value.message}`
    : ['installing', 'loading'].includes(status.value.state) ? `Voice not available yet. ${status.value.message}.`
    : 'Voice not available.')
  return { on: readonly(on), status: readonly(status), unavailable, supported, set, say, stop }
}
