// Light, dark or follow the Mac. Dark unless chosen otherwise. Kept per Mac in localStorage, which both
// windows share (same origin), so a change in Settings reaches the main window through the storage event.
export type Appearance = 'dark' | 'light' | 'system'
const KEY = 'ut-appearance'

function read(): Appearance {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'system') return v } catch {}
  return 'dark'
}
const macDark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

const mode = ref<Appearance>(read())

// data-theme switches every Passalong token (color-scheme on the root); the native window follows too,
// so the title bar and traffic lights match.
export function applyAppearance(m: Appearance) {
  // "Same as Mac" still sets a theme, from the Mac's current one, so the tokens never fall back to light by accident.
  document.documentElement.dataset.theme = m === 'system' ? (macDark?.matches ? 'dark' : 'light') : m
  tauri()?.window?.getCurrentWindow().setTheme?.(m === 'system' ? null : m).catch(() => {})
}

export function useAppearance() {
  function set(m: Appearance) {
    mode.value = m
    try { localStorage.setItem(KEY, m) } catch {}
    applyAppearance(m)
  }
  return { mode: readonly(mode), set }
}

export function watchAppearance() {
  applyAppearance(mode.value)
  addEventListener('storage', (e: StorageEvent) => { if (e.key === KEY) { mode.value = read(); applyAppearance(mode.value) } })
  macDark?.addEventListener('change', () => { if (mode.value === 'system') applyAppearance('system') })
}
