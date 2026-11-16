<script setup lang="ts">
// The test history, as a Mac source list: grouped by day, ↑↓ to move, right-click for more.
import type { RunInfo } from '~/composables/useTester'
const { state, openRun, rerun, tauri } = useTester()
const app = computed(() => state.apps.find((a) => a.id === state.appId))

const dayOf = (id: string) => {
  const d = new Date(started(id)); const today = new Date()
  const y = new Date(today); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}
const groups = computed(() => {
  const out: { day: string, runs: RunInfo[] }[] = []
  for (const r of state.runs) {
    const day = dayOf(r.id)
    if (out.at(-1)?.day !== day) out.push({ day, runs: [] })
    out.at(-1)!.runs.push(r)
  }
  return out
})
const current = computed(() => (state.view === 'run' ? state.runId : null))
const open = (r: RunInfo) => openRun(r.id, r.id === state.runs[0]?.id)

const list = ref<HTMLElement>()
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault(); e.stopPropagation()
  const ids = state.runs.map((r) => r.id)
  const i = ids.indexOf(current.value ?? '')
  const next = state.runs[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
  if (next) { open(next); nextTick(() => list.value?.querySelector<HTMLElement>(`[data-run="${next.id}"]`)?.focus()) }
}

// Native right-click menu in the Mac app; the browser's own menu elsewhere.
async function menu(e: MouseEvent, r: RunInfo) {
  const t = tauri()
  if (!t?.menu) return
  e.preventDefault()
  const dir = app.value ? `${app.value.root}/.ultimate-tester/runs/${r.id}` : null
  const m = await t.menu.Menu.new({ items: [
    { text: 'Open', action: () => open(r) },
    { text: 'Run Again', enabled: r.status !== 'running', action: () => rerun(r) },
    { text: 'Copy Verdict', enabled: !!r.summary, action: () => navigator.clipboard.writeText(r.summary) },
    { text: 'Show in Finder', enabled: !!dir && !!t.opener, action: () => { if (dir) t.opener?.revealItemInDir(dir) } },
  ] })
  await m.popup()
}
</script>

<template>
  <nav class="w-60 shrink-0 border-e border-[var(--line)] bg-[var(--sidebar)] flex flex-col min-h-0" aria-label="Tests">
    <div ref="list" class="flex-1 min-h-0 overflow-y-auto px-2 pb-3" role="listbox" aria-label="Tests" @keydown="onKey">
      <template v-for="g in groups" :key="g.day">
        <p class="px-2 pt-4 pb-1 text-[11px] font-medium text-[var(--muted)]">{{ g.day }}</p>
        <button
          v-for="r in g.runs" :key="r.id" :data-run="r.id" role="option" :aria-selected="r.id === current"
          :tabindex="r.id === current || (!current && r.id === state.runs[0]?.id) ? 0 : -1"
          :class="['static w-full text-start rounded-md px-2 py-1.5 flex items-start gap-2', r.id === current ? 'bg-[var(--select)]' : 'hover:bg-[var(--hover)]']"
          @click="open(r)" @contextmenu="menu($event, r)"
        >
          <component :is="statusOf(r.status).icon" :class="['size-4 shrink-0 mt-px', statusOf(r.status).cls]" aria-hidden="true" />
          <span class="flex-1 min-w-0">
            <span class="block truncate">{{ short(r.title) }}</span>
            <span class="block text-[11px] text-[var(--muted)] tabular-nums"><span class="sr-only">{{ statusOf(r.status).word }}, </span>{{ new Date(started(r.id)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}</span>
          </span>
        </button>
      </template>
      <p v-if="!state.runs.length" class="px-2 pt-4 text-[var(--muted)]">No tests yet. Start one with ⌘N.</p>
    </div>
  </nav>
</template>
