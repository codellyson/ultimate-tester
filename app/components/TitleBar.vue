<script setup lang="ts">
import { ChevronDownIcon, PlusIcon } from '@heroicons/vue/16/solid'
// One bar: which app / which test (both are menus), connection trouble, New test and ⌘K.
const { state, selectApp, openRun, startTest, addApp, openSettings } = useTester()
const app = computed(() => state.apps.find((a) => a.id === state.appId))
const run = computed(() => state.runs.find((r) => r.id === state.runId))
const runBtn = ref<HTMLElement>()
const newBtn = ref<HTMLElement>()
const left = ref(0)
function toggle(which: 'app' | 'new' | 'runs') {
  const el = which === 'new' ? newBtn.value : which === 'runs' ? runBtn.value : null
  if (el) left.value = el.getBoundingClientRect()[which === 'new' ? 'right' : 'left']
  state.menu = state.menu === which ? null : which
}
const appHint = (a: (typeof state.apps)[number]) => {
  if (!a.profileReady || !a.signedIn) return { text: 'needs setup', cls: 'text-[var(--warn)]' }
  const s = a.running ? statusOf('running') : a.last ? statusOf(a.last.status) : null
  return s ? { text: `last test ${s.word}`, cls: s.cls } : null
}
// Menus behave like menus: focus goes in, ↑↓ Home End move, Esc closes and returns focus to the button.
const appBtn = ref<HTMLElement>()
const triggers: Record<string, Ref<HTMLElement | undefined>> = { app: appBtn, runs: runBtn, new: newBtn }
watch(() => state.menu, (m, prev) => nextTick(() => {
  if (m) document.querySelector<HTMLElement>(`[data-menu="${m}"] [role=menuitem], [data-menu="${m}"] textarea`)?.focus()
  else if (prev && (!document.activeElement || document.activeElement === document.body)) triggers[prev]?.value?.focus()
}))
function menuKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { const m = state.menu; state.menu = null; if (m) nextTick(() => triggers[m]?.value?.focus()); return }
  const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')]
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
const disabledNew = computed(() => !state.setup?.profileReady || state.setup?.running)
const sidebarShown = ref(true)
onMounted(() => { const q = matchMedia('(min-width: 1080px)'); const set = () => { sidebarShown.value = state.sidebar && q.matches }; set(); q.addEventListener('change', set); watch(() => state.sidebar, set) })
const where = computed(() => (state.view === 'setup' ? 'Setup' : state.view === 'onboard' ? 'Getting started' : null))
</script>

<template>
  <header class="h-11 shrink-0 flex items-center gap-1.5 ps-[88px] pe-3 border-b border-[var(--line)] bg-[var(--sand)] relative" data-tauri-drag-region>
    <button
      ref="appBtn" class="crumb font-medium"
      aria-haspopup="true" :aria-expanded="state.menu === 'app'"
      :aria-label="app ? `Switch app (current: ${app.name})` : 'Add an app'"
      @click.stop="app ? toggle('app') : addApp()"
    >
      <span class="size-5 rounded-[5px] bg-[var(--surface)] ring-1 ring-[var(--line)] text-[var(--muted)] grid place-items-center text-[10px] font-semibold shrink-0" aria-hidden="true">{{ app ? app.name[0]!.toUpperCase() : '+' }}</span>
      <span class="truncate max-w-48">{{ app?.name ?? 'Add an app' }}</span>
      <ChevronDownIcon v-if="app" :class="['size-4 text-[var(--muted)] transition-[rotate] duration-150', state.menu === 'app' && 'rotate-180']" aria-hidden="true" />
    </button>

    <!-- With the sidebar open, the sidebar is the test picker; the crumb is for when it is hidden. -->
    <template v-if="app && (where || (state.runs.length && !sidebarShown))">
      <span class="text-[var(--line)] text-[18px] font-light select-none" aria-hidden="true">/</span>
      <span v-if="where" class="px-1.5 text-[var(--muted)]">{{ where }}</span>
      <button
        v-else ref="runBtn" class="crumb min-w-0"
        aria-haspopup="true" :aria-expanded="state.menu === 'runs'" :aria-label="`Switch test (current: ${short(run?.title)})`"
        @click.stop="toggle('runs')"
      >
        <span v-if="run?.status === 'running'" class="size-1.5 rounded-full bg-[var(--accent)] pulse shrink-0" aria-hidden="true" />
        <component :is="statusOf(run.status).icon" v-else-if="run" :class="[statusOf(run.status).cls, 'size-4 shrink-0']" aria-hidden="true" />
        <span class="truncate">{{ short(run?.title) }}</span>
        <span v-if="run" class="text-[var(--muted)] shrink-0 tabular-nums">{{ when(run.id) }}</span>
        <ChevronDownIcon :class="['size-4 text-[var(--muted)] shrink-0 transition-[rotate] duration-150', state.menu === 'runs' && 'rotate-180']" aria-hidden="true" />
      </button>
    </template>

    <Transition name="fade"><span v-if="state.offline" class="ms-auto flex items-center gap-1.5 px-2 text-[12px] text-[var(--warn)]" role="status">
      <span class="size-1.5 rounded-full bg-[var(--warn)] pulse" aria-hidden="true" />Reconnecting…
    </span></Transition>
    <button
      v-if="app && state.view !== 'onboard'" ref="newBtn" :class="['btn shrink-0 h-7 py-0', !state.offline && 'ms-auto']"
      aria-haspopup="true" :aria-expanded="state.menu === 'new'" @click.stop="toggle('new')"
    ><PlusIcon class="size-4 -ms-1" aria-hidden="true" />New test</button>
    <button
      :class="['shrink-0 h-7 rounded-md bg-[var(--surface)] ring-1 ring-[var(--line)] px-2.5 text-[var(--muted)] flex items-center gap-2.5 hover:bg-[var(--surface)]', (!app || state.view === 'onboard') && !state.offline && 'ms-auto']"
      aria-label="Commands (⌘K)" @click="state.menu = null; state.cmdk = true"
    ><kbd class="text-[11px] font-sans">⌘K</kbd></button>

    <Transition name="pop"><div v-if="state.menu === 'app'" data-menu="app" role="menu" aria-label="Apps" class="origin-top-left absolute start-[88px] top-10 z-30 w-72 rounded-xl bg-[var(--surface)] surface-float p-1.5" @click.stop @keydown="menuKey">
      <button
        v-for="a in state.apps" :key="a.id" role="menuitem" class="menu-item"
        :class="a.id === state.appId && 'bg-[var(--sand)] font-medium'" :aria-current="a.id === state.appId ? 'true' : undefined"
        @click="state.menu = null; selectApp(a.id)"
      >
        <span class="size-5 rounded-[5px] bg-[var(--surface)] ring-1 ring-[var(--line)] text-[var(--muted)] grid place-items-center text-[10px] font-semibold shrink-0">{{ a.name[0]!.toUpperCase() }}</span>
        <span class="truncate flex-1">{{ a.name }}</span>
        <span v-if="appHint(a)" :class="['text-[12px]', appHint(a)!.cls]">{{ appHint(a)!.text }}</span>
      </button>
      <div class="my-1 border-t border-[var(--line)]" />
      <button role="menuitem" class="menu-item text-[var(--muted)]" @click="openSettings()"><span class="flex-1">Settings for {{ app?.name }}…</span><kbd class="text-[11px] font-sans">⌘,</kbd></button>
      <button role="menuitem" class="menu-item text-[var(--muted)]" @click="addApp()"><PlusIcon class="size-4" aria-hidden="true" />Add an app…</button>
    </div></Transition>

    <Transition name="pop"><div v-if="state.menu === 'runs'" data-menu="runs" role="menu" aria-label="Tests" class="origin-top-left absolute top-10 z-30 w-80 max-h-[60vh] overflow-y-auto rounded-xl bg-[var(--surface)] surface-float p-1.5" :style="{ left: `${left}px` }" @click.stop @keydown="menuKey">
      <p class="px-3 pt-2 pb-1 text-[12px] font-medium text-[var(--muted)]">Tests</p>
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

    <Transition name="pop"><div v-if="state.menu === 'new'" data-menu="new" role="dialog" aria-label="New test" class="origin-top-right absolute top-10 z-30 w-80 rounded-xl bg-[var(--surface)] surface-float p-1.5" :style="{ left: `${Math.max(8, left - 320)}px` }" @click.stop @keydown="menuKey">
      <label class="block px-3 pt-2 pb-2">
        <span class="text-[12px] font-medium text-[var(--muted)]">Note for this test <span class="font-normal">(optional)</span></span>
        <textarea v-model="state.note" maxlength="1000" rows="2" class="field mt-1.5 resize-none" placeholder="e.g. Focus on checkout with a discount code" />
      </label>
      <p class="px-3 pt-1 pb-1 text-[12px] font-medium text-[var(--muted)]">What should Tess test?</p>
      <button v-for="t in [...targetsFor(state.setup?.remotes), { kind: 'custom', label: 'Something else…', hint: 'a commit or range' }]" :key="t.label" class="menu-item" :disabled="disabledNew" @click="startTest(t)">
        <span class="flex-1 whitespace-nowrap">{{ t.label }}</span><span class="text-[12px] text-[var(--muted)] text-end">{{ t.hint }}</span>
      </button>
    </div></Transition>
  </header>
  <Transition name="reveal"><p v-if="state.flash" class="px-5 py-2 text-[12px] bg-[var(--bad-soft)] text-[var(--bad)] border-b border-[var(--line)] flex gap-3" role="alert">
    <span class="flex-1">{{ state.flash }}</span>
    <button class="link text-[12px]" @click="state.flash = ''">Dismiss</button>
  </p></Transition>
</template>
