<script setup lang="ts">
// One bar: which app / which test (both are menus), connection trouble, New test and ⌘K.
const { state, selectApp, openRun, startTest, addApp, show } = useTester()
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
const disabledNew = computed(() => !state.setup?.profileReady || state.setup?.running)
const where = computed(() => (state.view === 'setup' ? 'Setup' : state.view === 'onboard' ? 'Getting started' : null))
</script>

<template>
  <header class="h-11 shrink-0 flex items-center gap-1.5 ps-[88px] pe-3 border-b border-[var(--line)] bg-[var(--sand)] relative" data-tauri-drag-region>
    <button
      class="crumb font-medium"
      aria-haspopup="true" :aria-expanded="state.menu === 'app'"
      :aria-label="app ? `Switch app (current: ${app.name})` : 'Add an app'"
      @click.stop="app ? toggle('app') : addApp()"
    >
      <span class="size-5 rounded-[5px] bg-white ring-1 ring-[var(--line)] text-[var(--muted)] grid place-items-center text-[10px] font-semibold shrink-0" aria-hidden="true">{{ app ? app.name[0]!.toUpperCase() : '+' }}</span>
      <span class="truncate max-w-48">{{ app?.name ?? 'Add an app' }}</span>
      <span v-if="app" class="text-[var(--muted)] text-[10px]" aria-hidden="true">▾</span>
    </button>

    <template v-if="app && (where || state.runs.length)">
      <span class="text-[var(--line)] text-[18px] font-light select-none" aria-hidden="true">/</span>
      <span v-if="where" class="px-1.5 text-[var(--muted)]">{{ where }}</span>
      <button
        v-else ref="runBtn" class="crumb min-w-0"
        aria-haspopup="true" :aria-expanded="state.menu === 'runs'" :aria-label="`Switch test (current: ${short(run?.title)})`"
        @click.stop="toggle('runs')"
      >
        <span v-if="run?.status === 'running'" class="size-1.5 rounded-full bg-[var(--accent)] pulse shrink-0" aria-hidden="true" />
        <span v-else-if="run" :class="[statusOf(run.status).cls, 'shrink-0']" aria-hidden="true">{{ statusOf(run.status).icon }}</span>
        <span class="truncate">{{ short(run?.title) }}</span>
        <span v-if="run" class="text-[var(--muted)] shrink-0 tabular-nums">{{ when(run.id) }}</span>
        <span class="text-[var(--muted)] text-[10px]" aria-hidden="true">▾</span>
      </button>
    </template>

    <span v-if="state.offline" class="ms-auto flex items-center gap-1.5 px-2 text-[12px] text-[var(--warn)]" role="status">
      <span class="size-1.5 rounded-full bg-[var(--warn)] pulse" aria-hidden="true" />Reconnecting…
    </span>
    <button
      v-if="app" ref="newBtn" :class="['btn shrink-0 h-7 py-0', !state.offline && 'ms-auto']"
      aria-haspopup="true" :aria-expanded="state.menu === 'new'" @click.stop="toggle('new')"
    ><span aria-hidden="true">+</span> New test</button>
    <button
      :class="['shrink-0 h-7 rounded-md bg-white/70 ring-1 ring-[var(--line)] px-2.5 text-[var(--muted)] flex items-center gap-2.5 hover:bg-white', !app && !state.offline && 'ms-auto']"
      aria-label="Commands (⌘K)" @click="state.menu = null; state.cmdk = true"
    ><kbd class="text-[11px] font-sans">⌘K</kbd></button>

    <div v-if="state.menu === 'app'" class="absolute start-[88px] top-10 z-30 w-72 rounded-xl bg-white surface-float p-1.5" @click.stop>
      <button
        v-for="a in state.apps" :key="a.id" class="menu-item"
        :class="a.id === state.appId && 'bg-[var(--sand)] font-medium'" :aria-current="a.id === state.appId ? 'true' : undefined"
        @click="state.menu = null; selectApp(a.id)"
      >
        <span class="size-5 rounded-[5px] bg-white ring-1 ring-[var(--line)] text-[var(--muted)] grid place-items-center text-[10px] font-semibold shrink-0">{{ a.name[0]!.toUpperCase() }}</span>
        <span class="truncate flex-1">{{ a.name }}</span>
        <span v-if="appHint(a)" :class="['text-[12px]', appHint(a)!.cls]">{{ appHint(a)!.text }}</span>
      </button>
      <div class="my-1 border-t border-[var(--line)]" />
      <button class="menu-item text-[var(--muted)]" @click="state.menu = null; show('setup')">Setup: how Tess tests {{ app?.name }}</button>
      <button class="menu-item text-[var(--muted)]" @click="addApp()">+ Add an app…</button>
    </div>

    <div v-if="state.menu === 'runs'" class="absolute top-10 z-30 w-80 max-h-[60vh] overflow-y-auto rounded-xl bg-white surface-float p-1.5" :style="{ left: `${left}px` }" @click.stop>
      <p class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Tests</p>
      <button
        v-for="(r, i) in state.runs.slice(0, 30)" :key="r.id" class="menu-item"
        :class="r.id === state.runId && state.view === 'run' && 'bg-[var(--sand)] font-medium'"
        :aria-current="r.id === state.runId && state.view === 'run' ? 'true' : undefined"
        @click="state.menu = null; openRun(r.id, i === 0)"
      >
        <span v-if="r.status === 'running'" class="w-4 grid place-items-center shrink-0"><span class="size-1.5 rounded-full bg-[var(--accent)] pulse" /></span>
        <span v-else :class="[statusOf(r.status).cls, 'w-4 text-center shrink-0']" aria-hidden="true">{{ statusOf(r.status).icon }}</span>
        <span class="sr-only">{{ statusOf(r.status).word }}: </span>
        <span class="truncate flex-1">{{ short(r.title) }}</span>
        <span class="text-[12px] text-[var(--muted)] tabular-nums shrink-0">{{ when(r.id) }}</span>
        <kbd v-if="i < 4" class="text-[11px] text-[var(--muted)] font-sans w-6 text-end shrink-0">⌘{{ i + 1 }}</kbd>
      </button>
    </div>

    <div v-if="state.menu === 'new'" class="absolute top-10 z-30 w-80 rounded-xl bg-white surface-float p-1.5" :style="{ left: `${Math.max(8, left - 320)}px` }" @click.stop>
      <label class="block px-3 pt-2 pb-2">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Note for this test <span class="normal-case font-normal tracking-normal">(optional)</span></span>
        <textarea v-model="state.note" maxlength="1000" rows="2" class="field mt-1.5 resize-none" placeholder="e.g. Focus on checkout with a discount code" />
      </label>
      <p class="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">What should Tess test?</p>
      <button v-for="t in [...TARGETS, { kind: 'custom', label: 'Something else…', hint: 'a commit or range' }]" :key="t.label" class="menu-item" :disabled="disabledNew" @click="startTest(t)">
        <span class="flex-1 whitespace-nowrap">{{ t.label }}</span><span class="text-[12px] text-[var(--muted)] text-end">{{ t.hint }}</span>
      </button>
    </div>
  </header>
  <p v-if="state.flash" class="px-5 py-2 text-[12px] bg-[var(--accent-soft)] text-[var(--bad)] border-b border-[var(--line)] flex gap-3" role="alert">
    <span class="flex-1">{{ state.flash }}</span>
    <button class="link text-[12px]" @click="state.flash = ''">Dismiss</button>
  </p>
</template>
