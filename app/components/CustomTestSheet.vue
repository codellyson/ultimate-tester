<script setup lang="ts">
// "Something else…": a centred dialog, in place of the browser's prompt().
const { state, startTest } = useTester()
const value = ref('')
const input = ref<HTMLInputElement>()
const box = ref<HTMLElement>()
const { onTab } = useModalFocus(() => state.sheet, box)
watch(() => state.sheet, (open) => { if (open) { value.value = ''; nextTick(() => input.value?.focus()) } })
const kind = computed(() => (value.value.includes('..') ? 'range' : 'commit'))
async function run() {
  const v = value.value.trim()
  if (!v) return
  state.sheet = false
  await startTest({ kind: kind.value, target: v })
}
</script>

<template>
  <Transition name="fade">
    <div v-if="state.sheet" class="fixed inset-0 z-40 grid place-items-center p-4 bg-black/40" @click.self="state.sheet = false" @keydown.esc="state.sheet = false">
      <Transition name="pop" appear>
        <form class="w-[460px] max-w-full rounded-[18px] bg-[var(--surface)] shadow-[var(--lift-sheet)] p-6 flex flex-col gap-3" ref="box" @keydown="onTab" role="dialog" aria-modal="true" aria-labelledby="sheet-title" @submit.prevent="run">
          <h2 id="sheet-title" class="display text-[17px] font-medium">Test a commit or a release</h2>
          <input ref="input" v-model="value" class="field mono" placeholder="abc1234  or  origin/prd..HEAD" aria-describedby="sheet-hint" spellcheck="false" autocapitalize="off">
          <p id="sheet-hint" class="text-[12px] text-[var(--muted)]">{{ value.trim() ? (kind === 'range' ? 'Tess tests everything in this range, like a release.' : 'Tess tests this one commit.') : 'A commit or branch name. To test a release, use a range like main..my-branch.' }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn" @click="state.sheet = false">Cancel</button>
            <button class="btn-blue" :disabled="!value.trim()">Test it</button>
          </div>
        </form>
      </Transition>
    </div>
  </Transition>
</template>
