<script setup lang="ts">
// Settings for Ultimate Tester itself, the same for every app on this Mac.
const { state, saveGeneral } = useTester()
const g = computed(() => state.general)
const LIMITS = [8, 12, 20, 30, 45]
</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col divide-y divide-[var(--line)]">
      <label class="flex items-center justify-between gap-6 pb-6">
        <span>
          <span class="block font-medium">Notifications</span>
          <span class="block text-[12px] text-[var(--muted)]">A notification when a test finishes while you're in another app. The Dock badge shows either way.</span>
        </span>
        <input type="checkbox" class="size-4 accent-[var(--accent)]" :checked="g.notifications" @change="saveGeneral({ notifications: ($event.target as HTMLInputElement).checked })">
      </label>

      <div class="flex items-center justify-between gap-6 py-6">
        <div>
          <h2 class="font-medium">Model</h2>
          <p class="text-[12px] text-[var(--muted)]">Which Claude model Tess runs on. Opus is more thorough; Sonnet is faster.</p>
        </div>
        <div class="inline-flex p-0.5 rounded-full bg-[var(--sand)]" role="radiogroup" aria-label="Model">
          <label v-for="m in (['opus', 'sonnet'] as const)" :key="m" :class="['px-3.5 py-1 rounded-full cursor-default capitalize transition-[background-color,color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]', g.model === m ? 'bg-[var(--surface)] surface text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]']">
            <input type="radio" name="model" class="sr-only" :checked="g.model === m" @change="saveGeneral({ model: m })">
            {{ m }}
          </label>
        </div>
      </div>

      <div class="flex items-center justify-between gap-6 pt-6">
        <div>
          <h2 class="font-medium">Time limit per test</h2>
          <p class="text-[12px] text-[var(--muted)]">Tess stops and reports what she finished when a test runs this long. A release gets at least 25 minutes.</p>
        </div>
        <select class="field w-auto py-1" :value="g.timeoutMin" aria-label="Time limit per test" @change="saveGeneral({ timeoutMin: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="m in LIMITS" :key="m" :value="m">{{ m }} minutes</option>
        </select>
      </div>
    </div>
  </section>
</template>
