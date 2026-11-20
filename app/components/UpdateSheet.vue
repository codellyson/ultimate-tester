<script setup lang="ts">
// While an update downloads and installs: a centred dialog like the others, until the app relaunches.
const mb = (b: number) => (b / 1_000_000).toFixed(1)
const pct = computed(() => updating.total ? Math.min(100, Math.round(updating.got * 100 / updating.total)) : null)
const line = computed(() => updating.installing ? 'Installing. Ultimate Tester restarts in a moment.'
  : updating.total ? `Downloading: ${mb(updating.got)} of ${mb(updating.total)} MB`
  : updating.got ? `Downloading: ${mb(updating.got)} MB` : 'Starting the download…')
</script>

<template>
  <Transition name="fade">
    <div v-if="updating.open" class="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40">
      <Transition name="pop" appear>
        <div class="w-[440px] max-w-full rounded-[18px] bg-[var(--surface)] shadow-[var(--lift-sheet)] p-6 flex flex-col gap-3" role="status" aria-live="polite">
          <h2 class="display text-[17px] font-medium">Updating to {{ updating.version }}</h2>
          <p class="text-[var(--muted)] tabular-nums">{{ line }}</p>
          <div class="h-1.5 rounded-full bg-[var(--line)] overflow-hidden" role="progressbar" aria-label="Update progress" :aria-valuenow="updating.installing ? 100 : pct ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150" :class="pct === null && !updating.installing && 'w-1/3 animate-pulse'" :style="pct !== null || updating.installing ? { width: `${updating.installing ? 100 : pct}%` } : undefined" />
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
