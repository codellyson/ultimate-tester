<script setup lang="ts">
// Appearance: one segmented control, like the Mac's own. Applies at once in both windows.
const { mode, set } = useAppearance()
const OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Same as Mac' },
] as const
</script>

<template>
  <div class="inline-flex p-0.5 rounded-full bg-[var(--sand)]" role="radiogroup" aria-label="Appearance">
    <label v-for="o in OPTIONS" :key="o.value" :class="['px-3.5 py-1 rounded-full cursor-default transition-[background-color,color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]', mode === o.value ? 'bg-[var(--surface)] surface text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]']">
      <input type="radio" name="appearance" class="sr-only" :value="o.value" :checked="mode === o.value" @change="set(o.value)">
      {{ o.label }}
    </label>
  </div>
</template>
