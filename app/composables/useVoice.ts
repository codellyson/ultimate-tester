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

// Kokoro playback that keeps up with the test. A line is made into speech the moment it arrives (that takes a
// second or two), and only the newest line is ever spoken: an older one still being made is dropped, and one still
// playing is cut short unless it's nearly done, so the voice stays with what's on screen.
const NEARLY_DONE_S = 1.2
let playing: HTMLAudioElement | null = null
let latest = 0
function halt() { if (playing) { playing.pause(); URL.revokeObjectURL(playing.src); playing = null } }
async function sayKokoro(text: string, interrupt: boolean) {
  const id = ++latest
  let res: Response
  try { res = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }) } catch { return }
  if (!res.ok || id !== latest) return
  const url = URL.createObjectURL(await res.blob())
  if (id !== latest) { URL.revokeObjectURL(url); return }
  const audio = new Audio(url)
  const start = () => {
    if (id !== latest || !on.value) { URL.revokeObjectURL(url); return }
    halt()
    playing = audio
    audio.onended = audio.onerror = () => { if (playing === audio) { URL.revokeObjectURL(url); playing = null } }
    audio.play().catch(() => audio.onended?.(new Event('ended')))
  }
  const left = playing ? playing.duration - playing.currentTime : 0
  if (playing && !interrupt && left <= NEARLY_DONE_S) playing.addEventListener('ended', start, { once: true })
  else start()
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
  function stop() { latest++; halt() }
  // Why nothing is spoken while the voice is on, or null when it's ready (or off).
  const unavailable = computed(() => !on.value || status.value.state === 'ready' ? null
    : status.value.state === 'error' ? `Voice not available: ${status.value.message}`
    : ['installing', 'loading'].includes(status.value.state) ? `Voice not available yet. ${status.value.message}.`
    : 'Voice not available.')
  return { on: readonly(on), status: readonly(status), unavailable, supported, set, say, stop }
}
