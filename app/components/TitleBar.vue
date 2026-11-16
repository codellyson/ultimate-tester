<script setup lang="ts">
// App picker, the last four tests as tabs, a new-test menu and ⌘K.
const { state, selectApp, openRun, startTest, addApp, show } = useTester()
const app = computed(() => state.apps.find((a) => a.id === state.appId))
const newBtn = ref<HTMLElement>()
const newLeft = ref(0)
function toggle(which: 'app' | 'new') {
  if (which === 'new' && newBtn.value) newLeft.value = newBtn.value.getBoundingClientRect().left
  state.menu = state.menu === which ? null : which
}
const appHint = (a: (typeof state.apps)[number]) => {
  if (!a.profileReady || !a.signedIn) return { text: 'needs setup', cls: 'text-[var(--warn)]' }
  const s = a.running ? statusOf('running') : a.last ? statusOf(a.last.status) : null
  return s ? { text: `last test ${s.word}`, cls: s.cls } : null
}
const disabledNew = computed(() => !state.setup?.profileReady || state.setup?.running)
</script>

<template>
  <header class="h-11 shrink-0 flex items-center gap-3 ps-20 pe-4 border-b border-[var(--line)] bg-[var(--sand)] relative" data-tauri-drag-region>
    <button
      class="flex items-center gap-1.5 font-medium shrink-0 rounded-md px-1.5 py-1 hover:bg-black/5"
      aria-haspopup="true" :aria-expanded="state.menu === 'app'"
      :aria-label="app ? `Switch app (current: ${app.name})` : 'Add an app'"
      @click.stop="app ? toggle('app') : addApp()"
    >
      <span class="size-5 rounded-md bg-[var(--accent)] text-white grid place-items-center text-[10px] font-bold">{{ app ? app.name[0]!.toUpperCase() : '+' }}</span>
      <span>{{ app?.name ?? 'Add an app' }}</span>
      <span v-if="app" class="text-[var(--muted)]">▾</span>
    </button>

    <nav class="flex items-end gap-1 self-end min-w-0 overflow-hidden" aria-label="Tests">
      <button
        v-for="r in state.runs.slice(0, 4)" :key="r.id" class="tab"
        :aria-current="state.view === 'run' && r.id === state.runId ? 'true' : undefined"
        :title="`${short(r.title)} · ${when(r.id)} · ${statusOf(r.status).word}`"
        :aria-label="`${short(r.title)} · ${when(r.id)} · ${statusOf(r.status).word}`"
        @click="openRun(r.id, r.id === state.runs[0]?.id)"
      >
        <span v-if="r.status === 'running'" class="size-1.5 rounded-full bg-[var(--accent)] pulse shrink-0" />
        <span v-else :class="[statusOf(r.status).cls, 'shrink-0']">{{ statusOf(r.status).icon }}</span>
        <span class="truncate">{{ short(r.title) }}</span>
        <span class="text-[11px] text-[var(--muted)] shrink-0">{{ when(r.id) }}</span>
      </button>
    </nav>
    <button ref="newBtn" class="tab shrink-0" aria-label="New test" aria-haspopup="true" :aria-expanded="state.menu === 'new'" @click.stop="toggle('new')">+</button>
    <button aria-label="Commands (⌘K)" class="ms-auto shrink-0 rounded-md bg-white/70 ring-1 ring-[var(--line)] px-3 py-1 text-[var(--muted)] flex gap-3" @click="state.menu = null; state.cmdk = true">
      <span>⌘K</span><span class="hidden md:inline">Test, sign in as, open…</span>
    </button>

    <div v-if="state.menu === 'app'" class="absolute start-20 top-10 z-30 w-72 rounded-xl bg-white surface-float p-1.5" @click.stop>
      <button
        v-for="a in state.apps" :key="a.id" class="menu-item"
        :class="a.id === state.appId && 'bg-[var(--sand)] font-medium'" :aria-current="a.id === state.appId ? 'true' : undefined"
        @click="state.menu = null; selectApp(a.id)"
      >
        <span class="size-5 rounded-md bg-[var(--accent)] text-white grid place-items-center text-[10px] font-bold shrink-0">{{ a.name[0]!.toUpperCase() }}</span>
        <span class="truncate flex-1">{{ a.name }}</span>
        <span v-if="appHint(a)" :class="['text-[12px]', appHint(a)!.cls]">{{ appHint(a)!.text }}</span>
      </button>
      <div class="my-1 border-t border-[var(--line)]" />
      <button class="menu-item text-[var(--muted)]" @click="addApp()">+ Add an app…</button>
    </div>

    <div v-if="state.menu === 'new'" class="absolute top-10 z-30 w-72 rounded-xl bg-white surface-float p-1.5" :style="{ left: `${newLeft}px` }" @click.stop>
      <p class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">What should Tess test?</p>
      <button v-for="t in [...TARGETS, { kind: 'custom', label: 'Something else…', hint: 'a commit or range' }]" :key="t.label" class="menu-item" :disabled="disabledNew" @click="startTest(t)">
        <span class="flex-1 whitespace-nowrap">{{ t.label }}</span><span class="text-[12px] text-[var(--muted)] text-end">{{ t.hint }}</span>
      </button>
      <div class="my-1 border-t border-[var(--line)]" />
      <button class="menu-item text-[var(--muted)]" @click="state.menu = null; show('setup')">Setup: how Tess tests this app</button>
    </div>
  </header>
  <p v-if="state.flash" class="px-5 py-2 text-[12px] bg-[var(--accent-soft)] text-[var(--bad)] border-b border-[var(--line)]" role="alert">{{ state.flash }}</p>
</template>
