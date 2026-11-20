<script setup lang="ts">
import { PhCheckCircle, PhCircle } from '@phosphor-icons/vue'
// Getting ready, as a short checklist: one line per step, the details only when you open a step.
const { state, setupAction, startTest } = useTester()
const s = computed(() => state.setup!)
const app = computed(() => state.apps.find((a) => a.id === state.appId)!)
const drafting = computed(() => s.value.job.kind === 'draft' && s.value.job.status === 'working')
const needs = computed(() => s.value.personas.filter((p) => p.signIn && !p.savedAt))
const signIns = computed(() => s.value.personas.filter((p) => p.signIn))

// Each trigger on or off by itself, from what is really installed; the box shows the change while it installs.
const saving = ref<'stop' | 'commit' | null>(null)
const want = reactive({ stop: false, commit: false })
watchEffect(() => { if (!saving.value) Object.assign(want, s.value.triggers) })
async function toggle(which: 'stop' | 'commit', on: boolean) {
  want[which] = on
  saving.value = which
  await setupAction('hook', { which, on })
  saving.value = null
}
async function draft() { if (await setupAction('draft')) { state.confirmJustDrafted = true; open.value = 'plan' } }

const mustCount = computed(() => (s.value.profile.split(/^## Must never break/m)[1]?.split(/^## /m)[0] ?? '').split('\n').filter((l) => /^\s*-\s+\S/.test(l)).length)
const steps = computed(() => [
  { key: 'plan', title: 'Test plan', done: s.value.profileReady && !state.confirmJustDrafted,
    line: state.confirmJustDrafted ? 'I drafted this from your repo. Check it before I test.' : [`${s.value.personas.length} ${s.value.personas.length === 1 ? 'person' : 'people'} to test as`, mustCount.value ? `${mustCount.value} things that must never break` : ''].filter(Boolean).join(' · '),
    action: 'Review' },
  { key: 'people', title: 'Sign in', done: !needs.value.length,
    line: !signIns.value.length ? 'Nobody needs signing in.' : needs.value.length ? `Signed in as ${signIns.value.length - needs.value.length} of ${signIns.value.length}. Sign in once per person, with a test account.` : `Signed in as all ${signIns.value.length}.`,
    action: needs.value.length ? 'Sign in' : 'View' },
  { key: 'when', title: 'When to test', done: true,
    line: [want.stop && 'When Claude Code finishes a task', want.commit && 'After every commit'].filter(Boolean).join(' and ') || 'Only when you ask',
    action: 'Change' },
])
// The first unfinished step starts open; everything else stays one line.
const open = ref<string | null>(null)
watchEffect(() => { if (open.value === null) open.value = steps.value.find((x) => !x.done)?.key ?? '' })
const left = computed(() => steps.value.filter((x) => !x.done).length)
</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <div class="max-w-2xl mx-auto px-10 py-10 flex flex-col gap-6">
      <div v-if="!state.inSettings">
        <h1 class="font-[family-name:var(--font-serif)] text-[34px] leading-[1.12] font-semibold tracking-[-0.015em] text-balance">{{ s.profileReady && !left ? `How I test ${app.name}` : `Setting up ${app.name}` }}</h1>
        <p v-if="s.profileReady" class="mt-1 text-[12.5px] text-[var(--muted)]">{{ left ? `${left} ${left === 1 ? 'thing' : 'things'} left before I can test everything` : 'Ready to test' }}</p>
      </div>

      <template v-if="!s.profileReady || drafting">
        <div v-if="s.planErrors?.length && !drafting" class="rounded-2xl surface px-6 py-5 flex flex-col gap-2">
          <p class="text-[15px] leading-relaxed">The test plan in <code class="rounded-md bg-[var(--code)] px-1.5 py-0.5 text-[12.5px]">.ultimate-tester.json</code> has {{ s.planErrors.length === 1 ? 'a problem' : `${s.planErrors.length} problems` }}, so I won't test until {{ s.planErrors.length === 1 ? "it's" : "they're" }} fixed.</p>
          <ul class="selectable text-[13px] text-[var(--text-2)] list-disc ps-5">
            <li v-for="e in s.planErrors.slice(0, 8)" :key="e">{{ e }}</li>
          </ul>
        </div>
        <TessSays v-else-if="drafting">I'm reading {{ app.name }}: how it starts, what it talks to, who uses it and what they do most.</TessSays>
        <div v-else-if="!s.planErrors?.length" class="rounded-2xl surface px-6 py-6 flex flex-col items-start gap-3">
          <p class="text-[15px] leading-relaxed text-[var(--text-2)] max-w-xl">I don't have a test plan for {{ app.name }} yet. I'll read your repo and draft one: how to start the app, who uses it, and what must never break. You check it before I run anything.</p>
          <button class="btn-blue" @click="draft">Read my repo</button>
          <p v-if="s.job.kind === 'draft' && s.job.status === 'error'" class="text-[13px] text-[var(--muted)]">{{ s.job.message }}</p>
        </div>
      </template>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="st in steps" :key="st.key" :class="['rounded-[10px]', open === st.key ? 'bg-[var(--sand)]' : 'hover:bg-[var(--row-hover)]']">
          <button class="w-full text-start flex items-center gap-2.5 p-3 rounded-[10px]" :aria-expanded="open === st.key" @click="open = open === st.key ? '' : st.key">
            <component :is="st.done ? PhCheckCircle : PhCircle" :class="['size-[18px] shrink-0', st.done ? 'text-[var(--ok)]' : 'text-[var(--line-strong)]']" aria-hidden="true" />
            <span class="sr-only">{{ st.done ? 'Done' : 'To do' }}: </span>
            <span class="flex-1 min-w-0">
              <span class="block text-[14px] font-medium">{{ st.title }}</span>
              <span class="block text-[12.5px] text-[var(--muted)] text-pretty">{{ st.line }}</span>
            </span>
            <span class="text-[12.5px] font-medium text-[var(--muted)] shrink-0">{{ open === st.key ? 'Close' : st.action }}</span>
          </button>
          <Transition name="reveal">
            <div v-if="open === st.key" class="px-3 pb-3 flex flex-col gap-3">
              <template v-if="st.key === 'plan'">
                <PlanQuestions />
                <ProfileCard :profile="s.profile" />
                <button v-if="state.confirmJustDrafted" class="btn-blue self-start" @click="state.confirmJustDrafted = false; open = steps.find((x) => !x.done)?.key ?? ''">Looks right</button>
              </template>
              <PersonaList v-else-if="st.key === 'people'" />
              <TriggerToggles v-else :stop="want.stop" :commit="want.commit" :disabled="!!saving" @toggle="toggle" />
            </div>
          </Transition>
        </li>
      </ul>

      <!-- Settings only configures; tests start from the main window (⌘N), so this window never turns into a test. -->
      <div v-if="s.profileReady && !state.confirmJustDrafted && !needs.length && !state.inSettings" class="flex flex-wrap items-center gap-2">
        <button v-for="(t, i) in targetsFor(s.remotes).slice(0, 3)" :key="t.label" :class="i === 0 ? 'btn-blue' : 'btn'" :disabled="s.running" @click="startTest(t)">Test {{ t.label.toLowerCase() }}</button>
      </div>
    </div>
  </section>
</template>
