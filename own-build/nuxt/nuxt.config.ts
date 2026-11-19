// Tess's copy of a Nuxt app builds here, inside node_modules, so it runs beside the developer's own dev server
// (Nuxt allows one dev server per build folder) and never shows up as a change in their repo.
export default defineNuxtConfig({ buildDir: 'node_modules/.cache/ultimate-tester/.nuxt' })
