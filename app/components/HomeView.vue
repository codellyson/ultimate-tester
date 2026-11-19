<script setup lang="ts">
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
// Home: every app on this Mac, the ones that need you first. Click an app for its page, or test it in one click.
const { state, selectApp, startTest, addApp, removeApp, show, openSettings } = useTester()
type A = (typeof state.apps)[number]
const isRunning = (a: A) => a.running || a.last?.status === 'running'
const needsSetup = (a: A) => !a.profileReady || !a.signedIn || (!a.onboarded && !a.last)
// Needs you first: something broke, then setup, then what's testing now, then the rest.
const rank = (a: A) => (a.last?.status === 'fail' ? 0 : needsSetup(a) ? 1 : isRunning(a) ? 2 : 3)
const apps = computed(() => [...state.apps].sort((x, y) => rank(x) - rank(y)))
const running = computed(() => state.apps.filter(isRunning).length)
const attention = computed(() => state.apps.filter((a) => rank(a) < 2).length)

function status(a: A) {
  if (isRunning(a)) return { text: 'Testing now', cls: 'text-[var(--ink)]' }
  if (needsSetup(a)) return { text: !a.onboarded && !a.last ? 'Not set up yet' : !a.profileReady ? 'No test plan yet' : 'Needs a sign-in', cls: 'text-[var(--muted)]' }
  if (!a.last) return { text: 'No tests yet', cls: 'text-[var(--muted)]' }
  return { text: outcome(a.last), cls: 'text-[var(--muted)]' }
}
// One click: test the current changes and watch it live.
async function test(a: A) {
  await selectApp(a.id)
  await startTest({ kind: 'changes' })
  if (!state.flash) show('run')
}
async function finish(a: A) {
  await selectApp(a.id)
  if (!a.onboarded && !a.last) show('onboard'); else openSettings('app')
}
</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col gap-6">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h1 class="font-[family-name:var(--font-serif)] text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">{{ attention ? `${attention} ${attention === 1 ? 'app needs' : 'apps need'} you` : running ? `Testing ${running} ${running === 1 ? 'app' : 'apps'} now` : 'Your apps' }}</h1>
          <p class="mt-1 text-[12.5px] text-[var(--muted)]">{{ state.apps.length }} {{ state.apps.length === 1 ? 'app' : 'apps' }} on this Mac.</p>
        </div>
        <button class="btn" @click="addApp"><PhPlus class="size-4" aria-hidden="true" />Add an app</button>
      </div>

      <ul class="flex flex-col gap-2">
        <li v-for="a in apps" :key="a.id" class="flex items-center rounded-[10px] hover:bg-[var(--row-hover)]">
          <button class="flex-1 min-w-0 text-start flex items-center gap-2.5 p-2.5 rounded-[10px]" :aria-label="`Open ${a.name}`" @click="selectApp(a.id)">
            <span v-if="isRunning(a)" class="tess size-[17px] rounded-full breathe shrink-0" aria-hidden="true" />
            <component :is="statusOf(a.last.status).icon" v-else-if="a.last && !needsSetup(a)" :class="['size-[17px] shrink-0', statusOf(a.last.status).cls]" aria-hidden="true" />
            <span v-else class="size-[17px] shrink-0 rounded-full ring-1 ring-inset ring-[var(--line-strong)]" aria-hidden="true" />
            <span class="flex-1 min-w-0">
              <span class="block text-[14px] font-medium truncate">{{ a.name }}</span>
              <span class="block text-[12.5px] text-[var(--muted)] truncate">
                <template v-if="a.last">{{ short(a.last.title) }} · {{ when(a.last.id) }}</template>
                <template v-else>{{ a.root.replace(/^\/Users\/[^/]+/, '~') }}</template>
              </span>
            </span>
            <span :class="['text-[12.5px] shrink-0', status(a).cls]">{{ status(a).text }}</span>
          </button>
          <span class="px-2.5 shrink-0">
            <button v-if="needsSetup(a)" class="btn-blue" @click="finish(a)">Finish setup</button>
            <button v-else class="btn" :disabled="isRunning(a)" title="Test your current changes in this app" @click="test(a)">Test</button>
          </span>
          <button class="btn-plain me-1.5 size-8 justify-center text-[var(--muted)] hover:text-[var(--ink)]" :disabled="isRunning(a)" :aria-label="`Remove ${a.name}`" title="Remove from Ultimate Tester" @click="removeApp(a.id)"><PhTrash class="size-4" aria-hidden="true" /></button>
        </li>
      </ul>
    </div>
  </section>
</template>
