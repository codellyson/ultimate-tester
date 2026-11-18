<script setup lang="ts">
// "When should Tess test?" One answer: each choice says what it changes, and only on this Mac.
const model = defineModel<'stop' | 'commit' | 'manual'>({ required: true })
defineProps<{ disabled?: boolean }>()
const WHEN = TRIGGERS
</script>

<template>
  <div class="rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)] overflow-hidden" role="radiogroup" aria-label="When Tess tests">
    <label v-for="w in WHEN" :key="w.mode" :class="['flex gap-3 items-start px-5 py-3.5 transition-colors duration-150', model === w.mode && 'bg-[var(--accent-soft)]']">
      <input v-model="model" type="radio" name="trigger" :value="w.mode" :disabled="disabled" class="mt-1 accent-[var(--accent)]">
      <span>
        <b class="font-medium">{{ w.title }}</b>
        <span class="block text-[12px] text-[var(--muted)] mt-0.5">{{ w.hint }}</span>
        <span class="block text-[12px] text-[var(--muted)] mt-0.5">{{ w.file }}</span>
      </span>
    </label>
  </div>
</template>
