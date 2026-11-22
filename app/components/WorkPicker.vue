<script setup lang="ts">
import { PhFolder, PhHouse, PhGitBranch, PhCaretDown } from '@phosphor-icons/vue'
import type { Checkout } from '~/composables/useTester'
import type { Target } from '~/utils/format'
// "Where's the work?": every checkout of the repo (main folder and worktrees, whoever made them), newest activity
// first, then what Tess should test from the chosen one. Reads only git, so it works with any agent or none.
const { state, startTest, fromFolder } = useTester()
const props = defineProps<{ disabled: boolean }>()
const all = ref(false)
const folders = computed(() => state.work?.folders ?? [])
const shown = computed(() => (all.value ? folders.value : folders.value.slice(0, 5)))
// Folder names repeat across machines' scratch areas, so a repeated name gets its parent too.
const name = (f: Checkout) => {
  if (f.main) return 'Main folder'
  const parts = f.path.split('/'), base = parts.at(-1)!
  return folders.value.filter((x) => !x.main && x.path.split('/').at(-1) === base).length > 1 ? parts.slice(-2).join('/') : base
}
const main = computed(() => folders.value.find((f) => f.main))
const newer = computed(() => (main.value ? folders.value.filter((f) => !f.main && f.activeAt > main.value!.activeAt).length : 0))
const f = computed(() => fromFolder())
const base = computed(() => state.work?.base ?? null)
const actions = computed(() => {
  const x = f.value
  if (!x) return []
  const list: (Target & { off?: boolean })[] = [
    { kind: 'changes', label: 'Its uncommitted changes', hint: x.uncommitted ? `${x.uncommitted} file${x.uncommitted === 1 ? '' : 's'}` : 'none', off: !x.uncommitted },
    { kind: 'commit', label: 'Its last commit', hint: x.lastCommitAt ? ago(x.lastCommitAt) : '' },
  ]
  const short = base.value?.replace(/^origin\//, '')
  if (base.value && x.branch && x.branch !== short) list.push({ kind: 'range', target: `${base.value}..HEAD`, label: `Everything not yet in ${short}`, hint: 'like a release' })
  for (const t of targetsFor(state.setup?.remotes)) if (t.kind === 'range' && t.target !== `${base.value}..HEAD`) list.push({ ...t })
  return list
})
</script>

<template>
  <div v-if="folders.length > 1">
    <p v-if="newer" class="mx-1.5 mb-1 rounded-[10px] bg-[var(--sand)] px-2.5 py-2 text-[12px] leading-[1.45] text-[var(--muted)]">
      <PhGitBranch class="inline size-3.5 -mt-0.5 me-1" aria-hidden="true" />Your main folder isn't where the newest work is: {{ newer }} other folder{{ newer === 1 ? ' has' : 's have' }} newer changes.
    </p>
    <p class="px-3 pt-1.5 pb-1 text-[12px] font-medium text-[var(--muted)]">Where's the work?</p>
    <div :class="all && 'max-h-64 overflow-y-auto'">
      <button
        v-for="x in shown" :key="x.path" role="menuitemradio" :aria-checked="x.path === state.from" class="menu-item w-full"
        :class="x.path === state.from && 'bg-[var(--sand)]'" :title="x.path" @click="state.from = x.path"
      >
        <component :is="x.main ? PhHouse : PhFolder" class="size-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
        <span class="flex-1 min-w-0 text-start">
          <span class="block truncate font-medium">{{ x.branch ?? 'no branch' }}</span>
          <span class="block truncate text-[12px] text-[var(--muted)]">{{ name(x) }} · {{ ago(x.activeAt) }}</span>
        </span>
        <span v-if="x.uncommitted" class="shrink-0 rounded-full px-2 py-0.5 text-[11px] bg-[var(--sand)] text-[var(--muted)]">{{ x.uncommitted }} uncommitted</span>
      </button>
    </div>
    <button v-if="folders.length > 5" role="menuitem" class="menu-item w-full text-[var(--muted)]" :aria-expanded="all" @click="all = !all">
      <PhCaretDown :class="['size-4 shrink-0 transition-transform', all && 'rotate-180']" aria-hidden="true" />{{ all ? 'Fewer folders' : `${folders.length - 5} more folders` }}
    </button>
    <div class="my-1 border-t border-[var(--line)]" />
    <p class="px-3 pt-1.5 pb-1 text-[12px] font-medium text-[var(--muted)]">What should Tess test from it?</p>
  </div>
  <p v-else class="px-3 pt-2 pb-1 text-[12px] font-medium text-[var(--muted)]">What should Tess test?</p>
  <button
    v-for="t in [...actions, { kind: 'custom', label: 'Something else…', hint: 'a commit or range' }]" :key="t.label" role="menuitem" class="menu-item w-full"
    :disabled="props.disabled || ('off' in t && t.off)" @click="startTest(t)"
  >
    <span class="flex-1 text-start truncate">{{ t.label }}</span><span class="text-[12px] text-[var(--muted)] text-end shrink-0">{{ t.hint }}</span>
  </button>
</template>
