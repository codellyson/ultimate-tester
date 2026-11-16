<script setup lang="ts">
// "Something else…": a sheet that drops from the title bar, in place of the browser's prompt().
const { state, startTest } = useTester()
const value = ref('')
const input = ref<HTMLInputElement>()
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
    <div v-if="state.sheet" class="fixed inset-0 top-11 z-40 bg-black/10" @click.self="state.sheet = false" @keydown.esc="state.sheet = false">
      <Transition name="pop" appear>
        <form class="origin-top mx-auto w-[460px] max-w-[92vw] rounded-b-xl bg-white surface-float p-5 flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="sheet-title" @submit.prevent="run">
          <h2 id="sheet-title" class="font-medium">Test a commit or a release</h2>
          <input ref="input" v-model="value" class="field mono" placeholder="abc1234  or  origin/prd..HEAD" aria-describedby="sheet-hint" spellcheck="false" autocapitalize="off">
          <p id="sheet-hint" class="text-[12px] text-[var(--muted)]">{{ value.trim() ? (kind === 'range' ? 'Tess tests everything in this range, like a release.' : 'Tess tests this one commit.') : 'A commit, a branch, or two refs joined by .. for a release.' }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn" @click="state.sheet = false">Cancel</button>
            <button class="btn-blue" :disabled="!value.trim()">Test it</button>
          </div>
        </form>
      </Transition>
    </div>
  </Transition>
</template>
