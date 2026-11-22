<script setup lang="ts">
import { PhHouse, PhPlus, PhClockCounterClockwise, PhMoon, PhSun } from '@phosphor-icons/vue'
// One bar: Home / app / test (the test is a menu), connection trouble, New test and ⌘K.
const { state, openRun, startTest, addApp, show, tauri, setupAction, stopTest, loadWork } = useTester()
const app = computed(() => state.apps.find((a) => a.id === state.appId))
// One click between dark and light; Settings also offers "Same as Mac".
const look = useAppearance()
const isDark = computed(() => look.mode.value === 'dark' || (look.mode.value === 'system' && document.documentElement.dataset.theme === 'dark'))
const run = computed(() => state.runs.find((r) => r.id === state.runId))
// One status pill for anything slow, seen from every screen (DESIGN.md · Working): what it is, how long, Cancel.
const now = ref(Date.now())
const ticker = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(ticker))
const clock = (since?: number) => { const s = since ? Math.max(0, Math.round((now.value - since) / 1000)) : 0; return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` }
// A run id is its start time ("2026-11-20T02-18-59-410Z").
const startedAt = (id?: string) => (id ? Date.parse(id.replace(/T(\d+)-(\d+)-(\d+)-(\d+)Z$/, 'T$1:$2:$3.$4Z')) : undefined)
const working = computed(() => {
  const s = state.setup, j = s?.job, name = app.value?.name ?? 'your app'
  if (j && ['working', 'waiting'].includes(j.status)) {
    const who = s?.personas.find((p) => p.key === j.persona)?.key
    const text = j.kind === 'signin' ? (j.status === 'waiting' ? `Waiting for you to sign in as ${who}` : `Starting ${name} to sign in as ${who}`)
      : j.kind === 'draft' ? `Reading ${name} to write its test plan` : j.kind === 'convert' ? `Converting ${name}'s test plan` : j.message
    return { text, since: j.since, cancel: () => setupAction('cancel'), open: () => show('setup') }
  }
  if (s?.running) {
    const latest = state.runs[0]
    return { text: `Testing ${name}`, since: startedAt(latest?.id), cancel: () => stopTest(), open: () => latest && openRun(latest.id) }
  }
  return null
})
const runBtn = ref<HTMLElement>()
const newBtn = ref<HTMLElement>()
const left = ref(0)
function toggle(which: 'app' | 'new' | 'runs') {
  const el = which === 'new' ? newBtn.value : which === 'runs' ? runBtn.value : null
  if (el) left.value = el.getBoundingClientRect().right
  state.menu = state.menu === which ? null : which
}
// Menus behave like menus: focus goes in, ↑↓ Home End move, Esc closes and returns focus to the button.
const appBtn = ref<HTMLElement>()
const triggers: Record<string, Ref<HTMLElement | undefined>> = { app: appBtn, runs: runBtn, new: newBtn }
watch(() => state.menu, (m, prev) => nextTick(() => {
  if (m === 'new' && newBtn.value) left.value = newBtn.value.getBoundingClientRect().right
  if (m === 'new') loadWork() // where the work is can change between tests
  if (m) document.querySelector<HTMLElement>(`[data-menu="${m}"] [role^=menuitem], [data-menu="${m}"] textarea`)?.focus()
  else if (prev && (!document.activeElement || document.activeElement === document.body)) triggers[prev]?.value?.focus()
}))
function menuKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { const m = state.menu; state.menu = null; if (m) nextTick(() => triggers[m]?.value?.focus()); return }
  if ((e.target as HTMLElement).tagName === 'TEXTAREA') return // arrows move the caret in the note
  const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role^=menuitem]:not(:disabled)')]
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
const disabledNew = computed(() => !state.setup?.profileReady || state.setup?.running)
const where = computed(() => (state.view === 'setup' ? 'Setup' : state.view === 'onboard' ? 'Getting started' : null))
</script>

<template>
  <header :class="['h-11 shrink-0 flex items-center gap-1.5 pe-3 border-b border-[var(--line)] bg-[var(--page)] text-[13px] relative', tauri() ? 'ps-[88px]' : 'ps-3']" data-tauri-drag-region>
    <Transition name="fade">
      <div v-if="working" class="absolute left-1/2 -translate-x-1/2 flex items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] h-7 ps-1 pe-1 text-[12.5px] font-medium shadow-[var(--lift)] max-w-[46%]" role="status" aria-live="polite">
        <button class="flex items-center gap-2 ps-1.5 pe-2 min-w-0" :title="working.text" @click="working.open()">
          <span class="tess breathe size-3.5 rounded-full shrink-0" aria-hidden="true" />
          <span class="truncate">{{ working.text }}</span>
          <span class="opacity-60 tabular-nums shrink-0">· {{ clock(working.since) }}</span>
        </button>
        <button class="shrink-0 rounded-full px-2 h-5 text-[12px] opacity-70 hover:opacity-100" @click="working.cancel()">Cancel</button>
      </div>
    </Transition>
    <button v-if="state.apps.length" :class="['crumb', state.home && 'bg-[var(--hover)]']" :aria-current="state.home ? 'page' : undefined" aria-label="Home" title="Home: all your apps" @click="state.menu = null; state.home = true"><PhHouse class="size-4" aria-hidden="true" /></button>
    <button
      v-if="!state.home || !state.apps.length" ref="appBtn" class="crumb font-medium"
      :aria-label="app ? `${app.name}: open its page` : 'Add an app'" :aria-current="state.view === 'app' && !state.home ? 'page' : undefined"
      @click.stop="state.menu = null; app ? show('app') : addApp()"
    >
      <span class="tess size-3.5 rounded-full shrink-0" aria-hidden="true" />
      <span class="truncate max-w-48">{{ app?.name ?? 'Add an app' }}</span>
    </button>

    <!-- With the sidebar open, the sidebar is the test picker; the crumb is for when it is hidden. -->
    <template v-if="app && !state.home && (where || (state.view === 'run' && run))">
      <span class="text-[var(--line-strong)] text-[16px] select-none" aria-hidden="true">/</span>
      <span class="px-1.5 text-[var(--muted)] truncate min-w-0">{{ where ?? short(run?.title) }}</span>
    </template>

    <Transition name="fade"><span v-if="state.offline" class="ms-auto flex items-center gap-1.5 px-2 text-[12px] text-[var(--warn)]" role="status">
      <span class="size-1.5 rounded-full bg-[var(--warn)] pulse" aria-hidden="true" />Reconnecting…
    </span></Transition>
    <button
      v-if="app && !state.home && state.view !== 'onboard' && state.runs.length" ref="runBtn" :class="['btn shrink-0 h-7', !state.offline && 'ms-auto']"
      aria-haspopup="true" :aria-expanded="state.menu === 'runs'" @click.stop="toggle('runs')"
    ><PhClockCounterClockwise class="size-4" aria-hidden="true" />History</button>
    <button
      v-if="app && !state.home && state.view !== 'onboard'" ref="newBtn" :class="['btn shrink-0 h-7', !state.offline && !state.runs.length && 'ms-auto']"
      aria-haspopup="true" :aria-expanded="state.menu === 'new'" @click.stop="toggle('new')"
    ><PhPlus class="size-4" aria-hidden="true" />New test</button>
    <button
      :class="['shrink-0 h-7 rounded-full ring-1 ring-inset ring-[var(--line-strong)] px-2.5 text-[var(--muted)] flex items-center hover:bg-[var(--surface-hover)]', (!app || state.home || state.view === 'onboard') && !state.offline && 'ms-auto']"
      aria-label="Commands (⌘K)" @click="state.menu = null; state.cmdk = true"
    ><kbd class="text-[11px] font-sans">⌘K</kbd></button>


    <Transition name="pop"><div v-if="state.menu === 'runs'" data-menu="runs" role="menu" aria-label="Tests" class="origin-top-right absolute top-10 z-30 w-80 max-h-[60vh] overflow-y-auto rounded-[14px] bg-[var(--surface)] surface-float p-1.5 flex flex-col gap-0.5" :style="{ left: `${Math.max(8, left - 320)}px` }" @click.stop @keydown="menuKey">
      <p class="px-2.5 pt-1.5 pb-1 text-[12px] text-[var(--faint)]">History</p>
      <button
        v-for="(r, i) in state.runs.slice(0, 30)" :key="r.id" role="menuitem" class="menu-item"
        :class="r.id === state.runId && state.view === 'run' && 'bg-[var(--sand)] font-medium'"
        :aria-current="r.id === state.runId && state.view === 'run' ? 'true' : undefined"
        @click="state.menu = null; openRun(r.id, i === 0)"
      >
        <span v-if="r.status === 'running'" class="w-4 grid place-items-center shrink-0"><span class="size-1.5 rounded-full bg-[var(--accent)] pulse" /></span>
        <component :is="statusOf(r.status).icon" v-else :class="[statusOf(r.status).cls, 'size-4 shrink-0']" aria-hidden="true" />
        <span class="sr-only">{{ statusOf(r.status).word }}: </span>
        <span class="truncate flex-1">{{ short(r.title) }}</span>
        <span class="text-[12px] text-[var(--muted)] tabular-nums shrink-0">{{ when(r.id) }}</span>
        <kbd v-if="i < 4" class="text-[11px] text-[var(--muted)] font-sans w-6 text-end shrink-0">⌘{{ i + 1 }}</kbd>
      </button>
    </div></Transition>

    <Transition name="pop"><div v-if="state.menu === 'new'" data-menu="new" role="dialog" aria-label="New test" class="origin-top-right absolute top-10 z-30 w-96 max-h-[80vh] overflow-y-auto rounded-[14px] bg-[var(--surface)] surface-float p-1.5" :style="{ left: `${Math.max(8, left - 384)}px` }" @click.stop @keydown="menuKey">
      <WorkPicker :disabled="disabledNew" />
      <div class="my-1 border-t border-[var(--line)]" />
      <label class="block px-3 pt-1 pb-2">
        <span class="text-[12px] font-medium text-[var(--muted)]">Note for this test <span class="font-normal">(optional · ⌘↩ to test your changes)</span></span>
        <textarea v-model="state.note" maxlength="1000" rows="2" class="field mt-1.5 resize-none" placeholder="e.g. Focus on checkout with a discount code" @keydown.meta.enter.prevent="!disabledNew && startTest({ kind: 'changes' })" />
      </label>
    </div></Transition>
      <button class="shrink-0 size-7 rounded-full ring-1 ring-inset ring-[var(--line-strong)] text-[var(--muted)] grid place-items-center hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]" :aria-label="isDark ? 'Switch to light' : 'Switch to dark'" :title="isDark ? 'Switch to light' : 'Switch to dark'" @click="look.set(isDark ? 'light' : 'dark')"><component :is="isDark ? PhSun : PhMoon" class="size-4" aria-hidden="true" /></button>
  </header>
</template>
