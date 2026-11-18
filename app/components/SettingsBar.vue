<script setup lang="ts">
// The Settings window's title bar: which app's settings these are.
const { state, selectApp, tauri } = useTester()
const TABS = [{ id: 'general', label: 'General' }, { id: 'app', label: 'Apps' }] as const
function tab(id: 'general' | 'app') {
  state.settingsTab = id
  try { localStorage.setItem('ut-settings-tab', id) } catch {}
}
function pick(e: Event) {
  const el = e.target as HTMLSelectElement
  if (state.draftDirty) { el.value = state.appId ?? ''; state.flash = 'Save or cancel your edit before switching apps.'; return }
  selectApp(el.value)
}
</script>

<template>
  <header :class="['h-11 shrink-0 flex items-center gap-3 pe-3 border-b border-[var(--line)] bg-[var(--page)]', tauri() ? 'ps-[88px]' : 'ps-3']" data-tauri-drag-region>
    <h1 class="font-medium" data-tauri-drag-region>Settings</h1>
    <!-- Two tabs: Ultimate Tester itself, and how Tess tests one app. -->
    <div class="inline-flex p-0.5 rounded-full bg-[var(--page)] ms-3" role="tablist" aria-label="Settings">
      <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="state.settingsTab === t.id" :class="['px-3 py-0.5 rounded-full text-[12px] transition-[background-color,color] duration-150', state.settingsTab === t.id ? 'bg-[var(--surface)] surface text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]']" @click="tab(t.id)">{{ t.label }}</button>
    </div>
    <label v-if="state.settingsTab === 'app'" class="ms-auto flex items-center gap-2 text-[var(--muted)]">
      <span>App</span>
      <select :value="state.appId ?? ''" class="field w-auto py-1" @change="pick">
        <option v-for="a in state.apps" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </label>
  </header>
</template>
