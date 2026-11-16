<script setup lang="ts">
const { state, boot, addApp, openRun } = useTester()
onMounted(boot)
// Window-wide keys: ⌘K opens commands, Escape closes menus, ⌘1–⌘4 jump between test tabs.
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); state.menu = null; state.cmdk = true; return }
  if (e.key === 'Escape') state.menu = null
  if ((e.metaKey || e.ctrlKey) && /^[1-4]$/.test(e.key)) {
    const r = state.runs[Number(e.key) - 1]
    if (r) { e.preventDefault(); openRun(r.id, e.key === '1') }
  }
}
const closeMenus = () => { state.menu = null }
onMounted(() => { window.addEventListener('keydown', onKey); document.addEventListener('click', closeMenus) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', closeMenus) })
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <TitleBar />
    <section v-if="!state.appId" class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col gap-6">
        <TessSays>
          Hi, I'm Tess. I test your app the way a person would, after every change. Which app should I look after first?
          <template #actions><button class="btn-blue self-start" @click="addApp()">Choose an app folder</button></template>
        </TessSays>
      </div>
    </section>
    <SetupView v-else-if="state.view === 'setup' && state.setup" />
    <RunView v-else-if="state.view === 'run' && state.detail" />
    <div v-else class="flex-1 grid place-items-center text-[var(--muted)]">Loading…</div>
    <CommandPalette />
  </div>
</template>
