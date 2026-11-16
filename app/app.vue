<script setup lang="ts">
const { state, boot, openRun } = useTester()
onMounted(boot)
// Window-wide keys: ⌘K opens commands, Escape closes menus, ⌘1–⌘4 jump between test tabs.
function onKey(e: KeyboardEvent) {
  if (state.inSettings) return
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
    <SettingsBar v-if="state.inSettings" />
    <TitleBar v-else />
    <Transition name="view" mode="out-in">
    <Onboarding v-if="!state.appId" key="welcome" />
    <Onboarding v-else-if="state.view === 'onboard' && state.setup" :key="state.appId" />
    <SetupView v-else-if="state.view === 'setup' && state.setup" />
    <RunView v-else-if="state.view === 'run' && state.detail" :key="state.runId ?? 'run'" />
    <div v-else class="flex-1 grid place-items-center text-[var(--muted)]">Loading…</div>
    </Transition>
    <template v-if="!state.inSettings"><CommandPalette /><CustomTestSheet /></template>
  </div>
</template>
