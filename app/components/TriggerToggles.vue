<script setup lang="ts">
// Settings: each automatic trigger on or off by itself, showing what is really installed. Neither on: only when you ask.
const props = defineProps<{ stop: boolean, commit: boolean, disabled?: boolean }>()
const emit = defineEmits<{ toggle: [which: 'stop' | 'commit', on: boolean] }>()
const AUTO = TRIGGERS.filter((t) => t.mode !== 'manual')
</script>

<template>
  <div class="rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)] overflow-hidden">
    <label v-for="w in AUTO" :key="w.mode" class="flex gap-3 items-start px-5 py-3.5">
      <input type="checkbox" :checked="props[w.mode as 'stop' | 'commit']" :disabled="disabled" class="mt-1 accent-[var(--accent)]" @change="emit('toggle', w.mode as 'stop' | 'commit', ($event.target as HTMLInputElement).checked)">
      <span>
        <b class="font-medium">{{ w.title }}</b>
        <span class="block text-[12px] text-[var(--muted)] mt-0.5">{{ w.hint }}</span>
        <span class="block text-[12px] text-[var(--muted)] mt-0.5">{{ w.file }}</span>
      </span>
    </label>
    <p class="px-5 py-3 text-[12px] text-[var(--muted)]">{{ stop || commit ? 'You can always start a test yourself with New test, ⌘N or ⌘K.' : 'Both are off, so Tess only tests when you ask: New test, ⌘N or ⌘K.' }}</p>
  </div>
</template>
