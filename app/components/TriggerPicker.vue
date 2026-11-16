<script setup lang="ts">
// "When should Tess test?" One answer: each choice says what it changes, and only on this Mac.
const model = defineModel<'stop' | 'commit' | 'manual'>({ required: true })
defineProps<{ disabled?: boolean }>()
const WHEN = [
  { mode: 'stop', title: 'When Claude Code finishes a task', hint: 'If something broke, I tell Claude Code what, and it fixes it before you look.', file: 'Adds a hook to .claude/settings.local.json, which stays on this Mac.' },
  { mode: 'commit', title: 'After every commit', hint: 'I test in the background and the result shows up here.', file: "Adds a line to this repo's git post-commit hook, which stays on this Mac." },
  { mode: 'manual', title: 'Only when I ask', hint: 'From New Test, ⌘N or ⌘K.', file: 'Removes any hook I added.' },
] as const
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
