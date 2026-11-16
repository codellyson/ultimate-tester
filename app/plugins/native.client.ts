// Inside the Mac app, <html class="native">: system font, system accent colour, and a see-through
// background so the window's sidebar material shows through. The web version keeps its own look.
export default defineNuxtPlugin(() => {
  if ((globalThis as { __TAURI__?: unknown }).__TAURI__) document.documentElement.classList.add('native')
})
