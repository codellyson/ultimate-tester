<script setup lang="ts">
// The Settings window's title bar: which app's settings these are.
const { state, selectApp } = useTester()
function pick(e: Event) { selectApp((e.target as HTMLSelectElement).value) }
</script>

<template>
  <header class="vibrant h-11 shrink-0 flex items-center gap-3 ps-[88px] pe-3 border-b border-[var(--line)] bg-[var(--sand)]" data-tauri-drag-region>
    <h1 class="font-medium" data-tauri-drag-region>Settings</h1>
    <label class="ms-auto flex items-center gap-2 text-[var(--muted)]">
      <span>App</span>
      <select :value="state.appId ?? ''" class="field w-auto py-1" @change="pick">
        <option v-for="a in state.apps" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </label>
  </header>
</template>
