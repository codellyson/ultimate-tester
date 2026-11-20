<script setup lang="ts">
import { PhCheck as CheckIcon } from '@phosphor-icons/vue'
// Who Tess tests as, with one sign-in button per person who needs it. While a sign-in is under way, the row
// for that person says what is happening right now, with Tess's orb breathing, so nobody wonders if anything is.
const { state, setupAction, loadApps } = useTester()
const s = computed(() => state.setup!)
const job = computed(() => (s.value.job.kind === 'signin' ? s.value.job : null))
const busy = computed(() => !!s.value.signingIn || job.value?.status === 'working')
// The person this sign-in is for, as the engine reports it, so any window (or a reload) shows it.
const active = computed(() => s.value.signingIn ?? (job.value?.status === 'working' ? job.value.persona ?? null : null))
// A failed sign-in stays on its row with the reason, and the button comes back so it can be tried again.
const failed = computed(() => (job.value?.status === 'error' ? job.value.persona ?? null : null))
const date = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
function start(key: string) { setupAction('signin/start', { persona: key }) }
async function finish() { if (await setupAction('signin/finish')) loadApps() }
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="max-w-2xl rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)]">
      <div v-for="p in s.personas" :key="p.key" :class="['px-5 py-3.5 flex flex-col gap-3 transition-colors duration-200', (active === p.key || failed === p.key) && 'bg-[var(--sand)]']">
        <div class="flex items-center gap-4">
          <div class="flex-1 min-w-0"><p class="font-medium">{{ p.signIn ? p.label : p.label.replace(/[,;]?\s*\(?(no sign-in|signed[- ]out|not signed in)\)?\.?\s*$/i, '') }}</p><p class="text-[12px] text-[var(--muted)]">{{ p.key }}</p></div>
          <div class="flex items-center gap-3 shrink-0">
            <span v-if="!p.signIn" class="text-[var(--muted)]">No sign-in needed</span>
            <button v-else-if="s.signingIn === p.key" class="btn-blue" @click="finish">I'm signed in</button>
            <template v-else-if="active !== p.key">
              <span v-if="p.savedAt" class="text-[var(--muted)] flex items-center gap-1"><CheckIcon class="size-4" aria-hidden="true" />Signed in · {{ date(p.savedAt) }}</span>
              <button
                :class="p.savedAt ? 'link text-[12px]' : 'btn'" :disabled="busy"
                :aria-label="`${p.savedAt ? 'Sign in again' : 'Sign in'} as ${p.label}`"
                @click="start(p.key)"
              >{{ failed === p.key ? 'Try again' : p.savedAt ? 'Sign in again' : 'Sign in' }}</button>
            </template>
          </div>
        </div>
        <!-- What is happening for this person right now, step by step, with Cancel. -->
        <JobSteps v-if="job && (active === p.key || failed === p.key)" :job="job" @cancel="setupAction('cancel')" />
      </div>
      <div class="px-5 py-3 text-[12px] text-[var(--muted)]">Add or rename people under "Who I test as" in the test plan.</div>
    </div>
    <p v-if="job?.status === 'done' && job.message" class="flex items-center gap-1.5 text-[13px]" role="status"><CheckIcon class="size-4 text-[var(--ok)]" aria-hidden="true" />{{ job.message }}</p>
  </div>
</template>
