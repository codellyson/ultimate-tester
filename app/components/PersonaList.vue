<script setup lang="ts">
import { CheckIcon } from '@heroicons/vue/16/solid'
// Who Tess tests as, with one sign-in button per person who needs it.
const { state, setupAction, loadApps } = useTester()
const s = computed(() => state.setup!)
const busy = computed(() => !!s.value.signingIn || (s.value.job.kind === 'signin' && s.value.job.status === 'working'))
const signinMsg = computed(() => s.value.job.kind === 'signin' && s.value.job.message && (busy.value || s.value.job.status === 'error') ? s.value.job : null)
const date = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
async function finish() { if (await setupAction('signin/finish')) loadApps() }
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="max-w-2xl rounded-[10px] bg-[var(--surface)] surface divide-y divide-[var(--line)]">
      <div v-for="p in s.personas" :key="p.key" :class="['px-5 py-3.5 flex items-center gap-4 transition-colors duration-200', s.signingIn === p.key && 'bg-[var(--accent-soft)]']">
        <div class="flex-1 min-w-0"><p class="font-medium">{{ p.signIn ? p.label : p.label.replace(/[,;]?\s*\(?(no sign-in|signed[- ]out|not signed in)\)?\.?\s*$/i, '') }}</p><p class="text-[12px] text-[var(--muted)] mono">{{ p.key }}</p></div>
        <div class="flex items-center gap-3 shrink-0">
          <span v-if="!p.signIn" class="text-[var(--muted)]">No sign-in needed</span>
          <template v-else-if="s.signingIn === p.key">
            <span class="text-[var(--muted)] hidden sm:inline">Waiting for you in Chrome…</span>
            <button class="btn-blue" @click="finish">I'm signed in</button>
          </template>
          <template v-else>
            <span v-if="p.savedAt" class="text-[var(--ok)] flex items-center gap-1"><CheckIcon class="size-4" aria-hidden="true" />Signed in · {{ date(p.savedAt) }}</span>
            <button
              :class="p.savedAt ? 'link text-[12px]' : 'btn'" :disabled="busy"
              :aria-label="`${p.savedAt ? 'Sign in again' : 'Sign in'} as ${p.label}`"
              @click="setupAction('signin/start', { persona: p.key })"
            >{{ p.savedAt ? 'Sign in again' : 'Sign in' }}</button>
          </template>
        </div>
      </div>
      <div class="px-5 py-3 text-[12px] text-[var(--muted)]">Add or rename people under Personas in the profile.</div>
    </div>
    <p v-if="signinMsg" :class="signinMsg.status === 'error' ? 'text-[var(--bad)]' : 'text-[var(--muted)]'" role="status">{{ signinMsg.message }}</p>
  </div>
</template>
