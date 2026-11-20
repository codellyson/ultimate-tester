<script setup lang="ts">
import { PhCheck, PhXCircle } from '@phosphor-icons/vue'
// A slow job, in place: every step named, the current one live (Tess's orb, seconds, the latest output line),
// what comes next greyed out, and Cancel. Used for signing in, drafting and converting (DESIGN.md · Working).
const props = defineProps<{ job: { status: string, message: string, since?: number, tail?: string, stages?: { label: string, state: 'done' | 'now' | 'todo' }[] } }>()
const emit = defineEmits<{ cancel: [] }>()
const now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(tick))
const seconds = computed(() => (props.job.since ? Math.max(0, Math.round((now.value - props.job.since) / 1000)) : 0))
const clock = computed(() => (seconds.value < 60 ? `${seconds.value}s` : `${Math.floor(seconds.value / 60)}m ${String(seconds.value % 60).padStart(2, '0')}s`))
const live = computed(() => ['working', 'waiting'].includes(props.job.status))
</script>

<template>
  <div class="flex items-start gap-4" role="status" aria-live="polite">
    <ol class="flex-1 min-w-0 flex flex-col gap-2">
      <li v-for="(s, i) in job.stages ?? []" :key="s.label" class="flex items-start gap-2.5">
        <span v-if="s.state === 'done'" class="size-[18px] shrink-0 rounded-full bg-[var(--accent)] text-[var(--on-accent)] grid place-items-center" aria-hidden="true"><PhCheck weight="bold" class="size-3" /></span>
        <PhXCircle v-else-if="s.state === 'now' && job.status === 'error'" weight="fill" class="size-[18px] shrink-0 text-[var(--bad)]" aria-hidden="true" />
        <span v-else-if="s.state === 'now' && live" class="tess breathe size-[18px] rounded-full shrink-0" aria-hidden="true" />
        <span v-else class="size-[18px] shrink-0 rounded-full ring-[1.5px] ring-inset ring-[var(--line-strong)] text-[10.5px] text-[var(--faint)] grid place-items-center tabular-nums" aria-hidden="true">{{ i + 1 }}</span>
        <div class="min-w-0 text-[13.5px] leading-[1.4]">
          <p :class="s.state === 'todo' ? 'text-[var(--faint)]' : s.state === 'now' ? 'font-medium' : ''">
            <span class="sr-only">{{ s.state === 'done' ? 'Done: ' : s.state === 'now' ? 'Now: ' : 'Next: ' }}</span>{{ s.label }}<span v-if="s.state === 'now' && live" class="font-normal text-[var(--muted)] tabular-nums"> · {{ clock }}</span>
          </p>
          <p v-if="s.state === 'now' && job.status === 'error'" class="mt-0.5 text-[13px] text-[var(--text-2)] selectable">{{ job.message }}</p>
          <p v-else-if="s.state === 'now' && job.status === 'waiting' && job.message" class="mt-0.5 text-[13px] text-[var(--text-2)]">{{ job.message }}</p>
          <p v-else-if="s.state === 'now' && live && job.tail" class="mt-0.5 text-[12px] text-[var(--faint)] truncate selectable" :title="job.tail">{{ job.tail }}</p>
        </div>
      </li>
    </ol>
    <button v-if="live" class="btn shrink-0" @click="emit('cancel')">Cancel</button>
  </div>
</template>
