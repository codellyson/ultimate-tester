<script setup lang="ts">
import { PhCheckCircle as CheckCircleIcon, PhCheck as CheckIcon, PhWarningCircle as ExclamationTriangleIcon, PhPlus as PlusIcon, PhXCircle as XCircleIcon } from '@phosphor-icons/vue'
// First run for an app: welcome, Tess reads the repo, you check her plan, sign her in, choose when she tests, first test.
const { state, api, addApp, addSample, setupAction, startTest, show, selectApp, leaveDraft, tauri } = useTester()
const s = computed(() => state.setup)
const app = computed(() => state.apps.find((a) => a.id === state.appId))
const STEPS = ['Welcome', 'Read the app', 'Check the plan', 'Sign in', 'First test']
const step = ref(!state.appId ? 0 : !s.value?.profileReady ? 1 : 2)
const top = ref<HTMLElement>()
async function go(n: number) { if (!(await leaveDraft())) return; step.value = n; nextTick(() => top.value?.scrollTo({ top: 0 })) }

// 0 · Is this Mac ready?
type Preflight = { claude: { ok: boolean, installed?: boolean, plan: string | null, apiKey: boolean }, chrome: boolean, node: string }
const pre = ref<Preflight | null>(null)
onMounted(async () => { if (step.value === 0) pre.value = await api<Preflight>('/api/preflight').catch(() => null) })
const nodeOk = computed(() => Number(pre.value?.node.split('.')[0]) >= 20)
// Setup can't work without Claude Code signed in and Chrome; don't let someone start and fail minutes later.
const ready = computed(() => !!pre.value?.claude.ok && !!pre.value?.chrome)
async function recheck() { pre.value = await api<Preflight>('/api/preflight').catch(() => null) }
// Coming back from Terminal or a download re-checks by itself; "Check again" stays for anyone who looks first.
const onFocus = () => { if (step.value === 0 && pre.value && !ready.value) recheck() }
onMounted(() => window.addEventListener('focus', onFocus))
onBeforeUnmount(() => window.removeEventListener('focus', onFocus))
const plan = computed(() => {
  const c = pre.value?.claude
  if (!c?.ok) return ''
  return c.apiKey ? 'billed to your API key' : c.plan ? `${c.plan[0]!.toUpperCase()}${c.plan.slice(1)} plan, no extra charge` : ''
})

// 1 · Tess reads the repo; each file she opens shows up as she goes.
const job = computed(() => s.value?.job)
const drafting = computed(() => job.value?.kind === 'draft' && job.value.status === 'working')
const draftFailed = computed(() => job.value?.kind === 'draft' && job.value.status === 'error')
const finds = computed(() => (job.value?.kind === 'draft' ? job.value.steps ?? [] : []).slice(-6))
onMounted(() => { if (step.value === 1 && !drafting.value) setupAction('draft') })
watch(() => s.value?.profileReady && !drafting.value, (ready) => { if (ready && step.value === 1) go(2) })

// 2 · Things to always keep in mind.
// Starts from the notes already in the profile, so 'Looks right' keeps them (it saves the whole section).
const existingNotes = () => {
  const sec = (s.value?.profile ?? '').split(/^## /m).find((p) => p.startsWith('Notes for Tess'))
  return (sec ?? '').split('\n').slice(1).map((l) => l.replace(/^\s*-\s*/, '').trim()).filter((l) => l && !/^\(.*\)$/.test(l)).join('\n')
}
const notes = ref(existingNotes())
const CHIPS = ['Check mobile width too', 'Payments run in test mode', 'Empty states are expected for new accounts', 'Skip the admin area']
const chips = computed(() => CHIPS.filter((c) => !notes.value.includes(c)))
const addChip = (c: string) => { notes.value = `${notes.value.trim() ? `${notes.value.trim()}\n` : ''}${c}` }
// Saves even when emptied, so clearing the box really clears the notes.
async function planOk() { if (notes.value.trim() === existingNotes().trim() || (await setupAction('notes', { text: notes.value }))) go(3) }
const canGoBack = (i: number) => i >= 2 && i < step.value

// 3 · Sign in.
const needs = computed(() => s.value?.personas.filter((p) => p.signIn && !p.savedAt) ?? [])

// 4 · When to test, then the first test.
const trigger = ref<'stop' | 'commit' | 'manual'>(s.value?.triggers.commit && !s.value.triggers.stop ? 'commit' : 'stop')
const targets = computed(() => targetsFor(s.value?.remotes).slice(0, 3))
// Nothing changed yet: start on the last commit so the first test has something to look at.
const target = ref(s.value?.changed === false ? Math.max(0, targets.value.findIndex((t) => t.kind === 'commit')) : 0)
const starting = ref(false)
async function begin() {
  starting.value = true
  // Automatic testing reports by notification: ask for permission now, while the person is here, not when a test ends.
  const n = tauri()?.notification
  if (trigger.value !== 'manual' && n && !(await n.isPermissionGranted())) await n.requestPermission().catch(() => {})
  const ok = (await setupAction('trigger', { mode: trigger.value })) && (await setupAction('onboarded'))
  if (ok) await startTest(targets.value[target.value]!)
  starting.value = false
}
async function skip() { if (state.appId && (await setupAction('onboarded'))) show('app') }
</script>

<template>
  <section ref="top" class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <nav class="sticky top-0 z-10 bg-[var(--page)]/95 backdrop-blur border-b border-[var(--line)] px-6 h-12 flex items-center gap-2" aria-label="Setup steps">
      <ol class="flex items-center gap-1.5 mx-auto min-w-0 overflow-x-auto">
        <li v-for="(name, i) in STEPS" :key="name" class="flex items-center gap-1.5 shrink-0">
          <span v-if="i" class="w-3.5 border-t border-[var(--line)]" aria-hidden="true" />
          <!-- Finished steps from "Check the plan" on can be revisited; reading the repo and the welcome can't. -->
          <component
            :is="canGoBack(i) ? 'button' : 'span'" :disabled="canGoBack(i) ? undefined : null"
            :class="['flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors duration-200', i === step ? 'bg-[var(--surface)] ring-1 ring-[var(--line)] text-[var(--ink)]' : 'text-[var(--muted)]', canGoBack(i) && 'hover:bg-[var(--hover)]']"
            :aria-current="i === step ? 'step' : undefined" :aria-label="canGoBack(i) ? `Back to ${name}` : undefined"
            @click="canGoBack(i) && go(i)"
          >
            <b :class="['transition-colors duration-200 size-[18px] rounded-full grid place-items-center text-[11px] font-semibold', i < step ? 'bg-[var(--ink)] text-white' : i === step ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface)] ring-1 ring-[var(--line)]']"><CheckIcon v-if="i < step" class="size-3" aria-hidden="true" /><template v-else>{{ i + 1 }}</template></b>
            <span class="hidden md:inline">{{ name }}</span>
          </component>
        </li>
      </ol>
      <!-- Reopened from Help ▸ Getting Started on an app that is set up: just go back. -->
      <button v-if="state.appId && s?.onboarded" class="link text-[12px] shrink-0" @click="selectApp(state.appId!)">Back to tests</button>
      <button v-else-if="state.appId && step > 1" class="link text-[12px] shrink-0" title="Finish the rest later in Settings (⌘,)" @click="skip">Skip the rest</button>
    </nav>

    <Transition name="step" mode="out-in">
    <div :key="step" class="max-w-[680px] mx-auto px-6 sm:px-8 py-12 flex flex-col gap-6">
      <!-- 0 · Welcome -->
      <template v-if="step === 0">
        <div class="tess size-[72px] rounded-full shadow-sm breathe" aria-hidden="true" />
        <h1 class="display text-[34px] leading-[1.15] font-medium text-balance">Hi, I'm Tess. I test your app the way a person would, every time it changes.</h1>
        <div class="grid sm:grid-cols-3 gap-3">
          <div class="rounded-2xl bg-[var(--surface)] surface p-4 flex flex-col gap-1.5"><b class="font-semibold">I run it</b><span class="text-[var(--muted)]">I start your app on my own port and click through it in a real browser.</span></div>
          <div class="rounded-2xl bg-[var(--surface)] surface p-4 flex flex-col gap-1.5"><b class="font-semibold">I sign in as your users</b><span class="text-[var(--muted)]">Owners, staff, shoppers. Each sees different things, so I test as each.</span></div>
          <div class="rounded-2xl bg-[var(--surface)] surface p-4 flex flex-col gap-1.5"><b class="font-semibold">You get one answer</b><span class="text-[var(--muted)]">Each check passed, broke, or couldn't run, with a screenshot.</span></div>
        </div>
        <ul class="rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)]" aria-label="Is this Mac ready">
          <li v-if="!pre" class="px-4 py-2.5 text-[var(--muted)]">Checking this Mac…</li>
          <template v-else>
            <li class="px-4 py-2.5 flex items-start gap-2">
              <span :class="['mt-[3px] shrink-0', pre.claude.ok ? 'text-[var(--ok)]' : 'text-[var(--bad)]']" aria-hidden="true"><component :is="pre.claude.ok ? CheckCircleIcon : XCircleIcon" class="size-4" /></span>
              <span v-if="pre.claude.ok">Claude Code is signed in</span>
              <span v-else-if="pre.claude.installed === false" class="selectable">Claude Code isn't installed. I run on it. In Terminal, run <code class="rounded-md bg-[#f3f3f3] px-1.5 py-0.5 text-[12.5px]">npm install -g @anthropic-ai/claude-code</code>, then <code class="rounded-md bg-[#f3f3f3] px-1.5 py-0.5 text-[12.5px]">claude</code> to sign in, and come back.</span>
              <span v-else class="selectable">Claude Code isn't signed in. In Terminal, run <code class="rounded-md bg-[#f3f3f3] px-1.5 py-0.5 text-[12.5px]">claude</code> and sign in, then come back.</span>
              <span v-if="plan" class="text-[11px] rounded-full bg-[var(--sand)] text-[var(--muted)] px-2 py-0.5">{{ plan }}</span>
            </li>
            <li class="px-4 py-2.5 flex items-start gap-2">
              <span :class="['mt-[3px] shrink-0', pre.chrome ? 'text-[var(--ok)]' : 'text-[var(--bad)]']" aria-hidden="true"><component :is="pre.chrome ? CheckCircleIcon : XCircleIcon" class="size-4" /></span>
              <span v-if="pre.chrome">Google Chrome found</span>
              <span v-else class="selectable">Google Chrome isn't installed. I test your app in Chrome. Get it from <b>google.com/chrome</b>, then come back.</span>
            </li>
            <li class="px-4 py-2.5 flex items-center gap-2">
              <span :class="nodeOk ? 'text-[var(--ok)]' : 'text-[var(--warn)]'" aria-hidden="true"><component :is="nodeOk ? CheckCircleIcon : ExclamationTriangleIcon" class="size-4" /></span>
              <span>Node {{ pre.node.split('.')[0] }}{{ nodeOk ? '' : ': I need Node 20 or newer. Get the LTS version from nodejs.org, then come back.' }}</span>
            </li>
          </template>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button class="btn-blue" :disabled="!ready" @click="addApp()">Choose your app's folder</button>
          <button class="btn" :disabled="!ready" @click="addSample()">Try it on a sample app first</button>
          <button v-if="pre && !ready" class="link text-[12px] self-center" @click="recheck">Check again</button>
        </div>
        <p class="text-[12px] text-[var(--muted)]">Tess works here on your Mac. What she sees goes to Claude through your own Claude Code, as when you use it yourself. I never see passwords.</p>
      </template>

      <!-- 1 · Read the app -->
      <template v-else-if="step === 1">
        <TessSays v-if="!draftFailed">Reading <b>{{ app?.name }}</b>. I'm working out how it starts, who uses it, and what they do most. About a minute.</TessSays>
        <TessSays v-else>
          I couldn't work out how to test {{ app?.name }} on my own. Want me to try again, or fill it in yourself?
          <template #actions>
            <div class="flex gap-2">
              <button class="btn-blue" @click="setupAction('draft')">Try again</button>
              <button class="btn" @click="skip">Fill it in myself</button>
            </div>
          </template>
        </TessSays>
        <TransitionGroup v-if="!draftFailed" name="list" tag="ul" class="ms-12 rounded-2xl bg-[var(--surface)] surface px-5 py-3 flex flex-col" aria-live="polite">
          <li v-for="(f, i) in finds" :key="f" class="py-1 flex items-baseline gap-2.5">
            <span :class="['size-1.5 rounded-full shrink-0 -translate-y-0.5', i === finds.length - 1 ? 'bg-[var(--accent)] pulse' : 'bg-[var(--ok)]']" aria-hidden="true" />
            <span class="truncate">{{ f }}</span>
          </li>
          <li v-if="!finds.length" class="py-1 flex items-baseline gap-2.5 text-[var(--muted)]">
            <span class="size-1.5 rounded-full shrink-0 -translate-y-0.5 bg-[var(--accent)] pulse" aria-hidden="true" />Opening the repo…
          </li>
        </TransitionGroup>
      </template>

      <!-- 2 · Check the plan -->
      <template v-else-if="step === 2 && s">
        <TessSays>Here's how I'll test {{ app?.name }}. Fix anything that's wrong; I'll follow it exactly.</TessSays>
        <div class="ms-12"><ProfileCard :profile="s.profile" basic /></div>
        <TessSays>Anything I should always keep in mind? Things to focus on, skip, or that look broken but aren't.</TessSays>
        <div class="ms-12 flex flex-col gap-3">
          <textarea v-model="notes" rows="3" maxlength="5000" class="field resize-none" placeholder="e.g. Payments run in test mode. The B2B pages need the B2B owner." aria-label="Things Tess should always keep in mind" />
          <TransitionGroup v-if="chips.length" name="fade" tag="div" class="flex flex-wrap gap-1.5">
            <button v-for="c in chips" :key="c" class="rounded-full bg-[var(--sand)] hover:bg-[var(--line)] px-2.5 py-1 text-[12px]" @click="addChip(c)"><PlusIcon class="size-3.5 inline -mt-0.5 me-0.5" aria-hidden="true" />{{ c }}</button>
          </TransitionGroup>
          <p class="text-[12px] text-[var(--muted)]">This goes into every test. You can change it later, and I add to it when you correct me.</p>
          <div class="flex gap-2"><button class="btn-blue" @click="planOk">Looks right</button></div>
        </div>
      </template>

      <!-- 3 · Sign in -->
      <template v-else-if="step === 3 && s">
        <TessSays>{{ needs.length ? `Sign me in once as the people who need it, with test accounts, your usual way. A Chrome window opens; I keep the session on this Mac.` : `Nobody here needs signing in. On to the last step.` }}</TessSays>
        <div class="ms-12 flex flex-col gap-3">
          <PersonaList />
          <div class="flex items-center gap-4">
            <button class="btn-blue" :disabled="!!s.signingIn" @click="go(4)">Continue</button>
            <button v-if="needs.length" class="link" @click="go(4)">Do the rest later</button>
          </div>
          <p v-if="needs.length" class="text-[12px] text-[var(--muted)]">Anyone you skip shows up as “couldn't run” in results, with a button to sign in.</p>
        </div>
      </template>

      <!-- 4 · When to test, and the first test -->
      <template v-else-if="step === 4 && s">
        <TessSays>When should I test? I'm most useful when nobody has to remember to ask.</TessSays>
        <TriggerPicker v-model="trigger" class="ms-12" />
        <TessSays>Let's do a first one now, so you see how it goes. What should I look at?</TessSays>
        <div class="ms-12 flex flex-col gap-3">
          <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to test" @keydown.left.right.prevent="target = (target + ($event.key === 'ArrowRight' ? 1 : targets.length - 1)) % targets.length; nextTick(() => ($event.currentTarget as HTMLElement | null)?.querySelectorAll<HTMLElement>('[role=radio]')[target]?.focus())">
            <button
              v-for="(t, i) in targets" :key="t.label" role="radio" :aria-checked="target === i" :tabindex="target === i ? 0 : -1"
              :class="['rounded-full px-3 py-1 text-[12px]', target === i ? 'bg-[var(--accent)] text-[var(--on-accent)] font-medium' : 'bg-[var(--sand)] hover:bg-[var(--line)]']"
              @click="target = i"
            >
              <CheckIcon v-if="target === i" class="size-3.5 inline -mt-0.5 me-0.5" aria-hidden="true" />{{ t.label }}</button>
          </div>
          <input v-model="state.note" type="text" maxlength="1000" class="field" placeholder="Anything to focus on? (optional)" aria-label="Note for this test">
          <div><button class="btn-blue" :disabled="starting || s.running" @click="begin">{{ starting ? 'Starting…' : 'Start my first test' }}</button></div>
          <p class="text-[12px] text-[var(--muted)]">Usually 3 to 10 minutes. You can watch me work, or carry on and come back.</p>
        </div>
      </template>
    </div>
    </Transition>
  </section>
</template>
