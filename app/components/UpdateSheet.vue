<script setup lang="ts">
// While an update downloads and installs: drops from the title bar like the other sheets, until the app relaunches.
const mb = (b: number) => (b / 1_000_000).toFixed(1)
const pct = computed(() => updating.total ? Math.min(100, Math.round(updating.got * 100 / updating.total)) : null)
const line = computed(() => updating.installing ? 'Installing. Ultimate Tester restarts in a moment.'
  : updating.total ? `Downloading: ${mb(updating.got)} of ${mb(updating.total)} MB`
  : updating.got ? `Downloading: ${mb(updating.got)} MB` : 'Starting the download…')
</script>

<template>
  <Transition name="fade">
    <div v-if="updating.open" class="fixed inset-0 top-11 z-50 bg-black/10">
      <Transition name="pop" appear>
        <div class="origin-top mx-auto w-[440px] max-w-[92vw] rounded-b-xl bg-[var(--surface)] surface-float p-5 flex flex-col gap-3" role="status" aria-live="polite">
          <h2 class="font-medium">Updating to {{ updating.version }}</h2>
          <p class="text-[var(--muted)] tabular-nums">{{ line }}</p>
          <div class="h-1.5 rounded-full bg-[var(--line)] overflow-hidden" role="progressbar" aria-label="Update progress" :aria-valuenow="updating.installing ? 100 : pct ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150" :class="pct === null && !updating.installing && 'w-1/3 animate-pulse'" :style="pct !== null || updating.installing ? { width: `${updating.installing ? 100 : pct}%` } : undefined" />
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
