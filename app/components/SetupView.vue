<script setup lang="ts">
// Getting ready: Tess asks one thing at a time.
const { state, setupAction, loadApps, startTest } = useTester()
const s = computed(() => state.setup!)
const app = computed(() => state.apps.find((a) => a.id === state.appId)!)
const drafting = computed(() => s.value.job.kind === 'draft' && s.value.job.status === 'working')
const needs = computed(() => s.value.personas.filter((p) => p.signIn && !p.savedAt))
const busy = computed(() => !!s.value.signingIn || (s.value.job.kind === 'signin' && s.value.job.status === 'working'))
const signinMsg = computed(() => s.value.job.kind === 'signin' && s.value.job.message && (busy.value || s.value.job.status === 'error') ? s.value.job : null)
const date = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })

async function draft() { if (await setupAction('draft')) state.confirmJustDrafted = true }
async function finish() { if (await setupAction('signin/finish')) loadApps() }
</script>

<template>
  <section class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col gap-6">
      <h1 class="serif text-[26px] leading-tight text-balance">Setting up {{ app.name }}</h1>

      <template v-if="!s.profileReady || drafting">
        <TessSays v-if="drafting">Reading {{ app.name }}… I'm looking at how it starts, what it talks to, who uses it and what they do most.</TessSays>
        <TessSays v-else>
          I haven't met {{ app.name }} yet. Let me read the repo and work out how to test it. You'll get to check everything before I touch anything.
          <template #actions>
            <button class="btn-blue self-start" @click="draft">Read my repo</button>
            <p v-if="s.job.kind === 'draft' && s.job.status === 'error'" class="text-[var(--bad)]">{{ s.job.message }}</p>
          </template>
        </TessSays>
      </template>

      <template v-else>
        <TessSays>{{ state.confirmJustDrafted ? `I read ${app.name}. Here's how I'll test it. Fix anything that's wrong; I'll follow this exactly.` : `Here's how I test ${app.name}. Change anything, any time.` }}</TessSays>
        <div class="ms-12 flex flex-col gap-3">
          <h2 class="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">How I test this app</h2>
          <ProfileCard :profile="s.profile" />
          <button v-if="state.confirmJustDrafted" class="btn-blue self-start" @click="state.confirmJustDrafted = false">Looks right</button>
        </div>

        <template v-if="!state.confirmJustDrafted">
          <TessSays>{{ needs.length ? `Different people see different things in ${app.name}, so I test as each of these. Sign me in once as the ones that need it, with test accounts, your usual way. I keep each session on this Mac and never see a password.` : `These are the people I test as. Everyone's ready.` }}</TessSays>
          <div class="ms-12 flex flex-col gap-3">
            <h2 class="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Who I test as</h2>
            <div class="max-w-2xl rounded-2xl bg-white surface divide-y divide-[var(--line)]">
              <div v-for="p in s.personas" :key="p.key" :class="['px-5 py-3.5 flex items-center gap-4', s.signingIn === p.key && 'bg-[var(--accent-soft)]']">
                <div class="flex-1 min-w-0"><p class="font-medium">{{ p.label }}</p><p class="text-[12px] text-[var(--muted)] mono">{{ p.key }}</p></div>
                <div class="flex items-center gap-3 shrink-0">
                  <span v-if="!p.signIn" class="text-[var(--muted)]">No sign-in needed</span>
                  <button v-else-if="s.signingIn === p.key" class="btn-blue" @click="finish">I'm signed in</button>
                  <template v-else>
                    <span v-if="p.savedAt" class="text-[var(--ok)]">✓ Signed in · {{ date(p.savedAt) }}</span>
                    <button
                      :class="p.savedAt ? 'link text-[12px]' : 'btn-blue'" :disabled="busy"
                      :aria-label="`${p.savedAt ? 'Sign in again' : 'Sign in'} as ${p.label}`"
                      @click="setupAction('signin/start', { persona: p.key })"
                    >{{ p.savedAt ? 'Sign in again' : 'Sign in' }}</button>
                  </template>
                </div>
              </div>
              <div class="px-5 py-3 text-[12px] text-[var(--muted)]">Add or rename people under Personas in the profile above.</div>
            </div>
            <p v-if="signinMsg" :class="signinMsg.status === 'error' ? 'text-[var(--bad)]' : 'text-[var(--muted)]'">{{ signinMsg.message }}</p>
          </div>
          <TessSays v-if="!needs.length">
            All set. What should I test?
            <template #actions>
              <div class="flex flex-wrap gap-2">
                <button v-for="t in TARGETS.slice(0, 3)" :key="t.label" class="btn" :disabled="s.running" @click="startTest(t)">{{ t.label }}</button>
              </div>
            </template>
          </TessSays>
        </template>
      </template>
    </div>
  </section>
</template>
