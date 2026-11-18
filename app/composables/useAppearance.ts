// Light, dark or follow the Mac. Dark unless chosen otherwise. Kept per Mac in localStorage, which both
// windows share (same origin), so a change in Settings reaches the main window through the storage event.
export type Appearance = 'dark' | 'light' | 'system'
const KEY = 'ut-appearance'

function read(): Appearance {
  return 'light' // DESIGN.md: one light palette for now; dark mode comes later
}

const mode = ref<Appearance>(read())

// data-theme switches every Passalong token (color-scheme on the root); the native window follows too,
// so the title bar and traffic lights match.
export function applyAppearance(m: Appearance) {
  const root = document.documentElement
  if (m === 'system') delete root.dataset.theme
  else root.dataset.theme = m
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
}
