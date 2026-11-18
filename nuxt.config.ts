import tailwindcss from '@tailwindcss/vite'

// One Nuxt app is the whole product: the page (web and the Tauri window) and the engine API (Nitro).
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  devtools: { enabled: false },
  app: {
    head: {
      title: 'Ultimate Tester',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      // Appearance before first paint (dark unless chosen otherwise), so the window never flashes light.
      script: [{ innerHTML: "try{var m=localStorage.getItem('ut-appearance')||'light';if(m!=='system')document.documentElement.dataset.theme=m}catch(e){document.documentElement.dataset.theme='light'}" }],
    },
  },
})
