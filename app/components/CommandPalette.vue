<script setup lang="ts">
// Grouped, with "Open" first: nothing that starts a run is ever the default.
const { state, openRun, openSettings, startTest, rerun, stopTest, selectApp, addApp } = useTester()
const q = ref('')
const sel = ref(-1)
const input = ref<HTMLInputElement>()
const box = ref<HTMLElement>()
const { onTab } = useModalFocus(() => state.cmdk, box)

type Cmd = { group: string, label: string, hint?: string, run: () => void }
const commands = computed<Cmd[]>(() => {
  const list: Cmd[] = []
  state.runs.slice(0, 8).forEach((r, i) => list.push({ group: 'Open', label: `${short(r.title)} · ${when(r.id)} · ${statusOf(r.status).word}`, hint: i < 4 ? `⌘${i + 1}` : '', run: () => openRun(r.id) }))
  list.push({ group: 'Open', label: 'Home: all your apps', run: () => { state.home = true } })
  list.push({ group: 'Open', label: 'Settings: how Tess tests this app', hint: '⌘,', run: () => openSettings() })
  if (state.view === 'run' && state.detail?.change) list.push({ group: 'Test', label: 'Run this test again', hint: '⌘R', run: rerun })
  if (state.setup?.running) list.push({ group: 'Test', label: 'Stop the running test', hint: '⌘.', run: stopTest })
  for (const t of targetsFor(state.setup?.remotes)) list.push({ group: 'Test', label: `Test ${t.label.toLowerCase()}`, hint: t.hint, run: () => startTest(t) })
  list.push({ group: 'Test', label: 'Test something else…', run: () => startTest({ kind: 'custom' }) })
  for (const p of state.setup?.personas ?? []) if (p.signIn) list.push({ group: 'Sign in as', label: shortLabel(p.label), hint: p.savedAt ? 'signed in · opens Settings' : 'opens Settings', run: openSettings })
  for (const a of state.apps) if (a.id !== state.appId) list.push({ group: 'Apps', label: `Switch to ${a.name}`, run: () => selectApp(a.id) })
  list.push({ group: 'Apps', label: 'Add an app…', run: () => addApp() })
  return list
})
const shown = computed(() => commands.value.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q.value.toLowerCase())))
const groups = computed(() => {
  const out: { group: string, items: { cmd: Cmd, i: number }[] }[] = []
  shown.value.forEach((cmd, i) => { if (out.at(-1)?.group !== cmd.group) out.push({ group: cmd.group, items: [] }); out.at(-1)!.items.push({ cmd, i }) })
  return out
})

watch(() => state.cmdk, (open) => { if (open) { q.value = ''; sel.value = -1; nextTick(() => input.value?.focus()) } })
// Typing selects the best match; an empty box selects nothing, so Enter alone never starts a test.
watch(q, (v) => { sel.value = v.trim() ? 0 : -1 })
watch(sel, () => nextTick(() => document.getElementById(`cmd-${sel.value}`)?.scrollIntoView({ block: 'nearest' })))

function run(c?: Cmd) { if (!c) return; state.cmdk = false; c.run() }
function key(e: KeyboardEvent) {
  if (e.key === 'Escape') state.cmdk = false
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel.value = Math.max(0, Math.min(shown.value.length - 1, sel.value + (e.key === 'ArrowDown' ? 1 : -1))) }
  else if (e.key === 'Enter') run(shown.value[sel.value])
}
</script>

<template>
  <Transition name="palette"><div v-if="state.cmdk" class="fixed inset-0 z-40 bg-black/20 grid place-items-start justify-center pt-24" ref="box" role="dialog" aria-modal="true" @keydown="onTab($event); key($event)" aria-label="Commands" @click.self="state.cmdk = false">
    <div class="origin-top w-[520px] max-w-[92vw] rounded-xl bg-[var(--surface)] surface-float overflow-hidden">
      <input
        ref="input" v-model="q" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
        :aria-activedescendant="sel >= 0 ? `cmd-${sel}` : undefined" aria-label="Command" placeholder="What should Tess do?"
        class="no-ring w-full px-4 py-3 text-[15px] bg-transparent outline-none border-b border-[var(--line)]"
      >
      <div id="cmdk-list" class="max-h-80 overflow-y-auto p-1.5" role="listbox" aria-label="Commands">
        <template v-for="g in groups" :key="g.group">
          <p class="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-[var(--muted)]">{{ g.group }}</p>
          <button
            v-for="{ cmd, i } in g.items" :id="`cmd-${i}`" :key="cmd.label" role="option" tabindex="-1"
            :aria-selected="i === sel" :class="['menu-item', i === sel && 'bg-[var(--sand)]']" @click="run(cmd)"
          >
            <span class="flex-1 truncate">{{ cmd.label }}</span>
            <span v-if="cmd.hint" class="text-[12px] text-[var(--muted)] shrink-0">{{ cmd.hint }}</span>
          </button>
        </template>
        <p v-if="!shown.length" class="px-3 py-3 text-[var(--muted)]">Nothing matches.</p>
      </div>
    </div>
  </div></Transition>
</template>
