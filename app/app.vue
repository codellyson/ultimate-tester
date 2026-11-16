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
// The history sidebar, on the main window's test and setup screens (not onboarding, not Settings).
// Like Mac apps, the sidebar steps aside when the window is too narrow for it and the evidence.
const roomy = ref(true)
onMounted(() => { const q = matchMedia('(min-width: 1080px)'); roomy.value = q.matches; q.addEventListener('change', (e) => { roomy.value = e.matches }) })
const showSidebar = computed(() => !state.inSettings && !!state.appId && state.sidebar && roomy.value && (state.view === 'run' || state.view === 'setup'))
const closeMenus = () => { state.menu = null }
onMounted(() => { window.addEventListener('keydown', onKey); document.addEventListener('click', closeMenus) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', closeMenus) })
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <SettingsBar v-if="state.inSettings" />
    <TitleBar v-else />
    <div class="flex-1 min-h-0 flex">
    <Sidebar v-if="showSidebar" />
    <Transition name="view" mode="out-in">
    <Onboarding v-if="!state.appId" key="welcome" />
    <Onboarding v-else-if="state.view === 'onboard' && state.setup" :key="state.appId" />
    <SetupView v-else-if="state.view === 'setup' && state.setup" />
    <RunView v-else-if="state.view === 'run' && state.detail" :key="state.runId ?? 'run'" />
    <div v-else class="flex-1 min-w-0 grid place-items-center text-[var(--muted)]">Loading…</div>
    </Transition>
    </div>
    <template v-if="!state.inSettings"><CommandPalette /><CustomTestSheet /></template>
  </div>
</template>
