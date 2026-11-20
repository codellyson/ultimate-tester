<script setup lang="ts">
// The app's confirm/prompt sheet: a centred dialog like the others. Esc cancels, Enter confirms.
const box = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const { onTab } = useModalFocus(() => !!asking.open, box)
watch(() => asking.open, (a) => { if (a?.input) nextTick(() => input.value?.focus()) })
</script>

<template>
  <Transition name="fade">
    <div v-if="asking.open" class="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" @click.self="answer(false)" @keydown.esc="answer(false)">
      <Transition name="pop" appear>
        <form ref="box" class="w-[440px] max-w-full rounded-[18px] bg-[var(--surface)] shadow-[var(--lift-sheet)] p-6 flex flex-col gap-3" role="alertdialog" aria-modal="true" aria-labelledby="ask-title" :aria-describedby="asking.open.message ? 'ask-msg' : undefined" @keydown="onTab" @submit.prevent="answer(true)">
          <h2 id="ask-title" class="display text-[17px] font-medium">{{ asking.open.title }}</h2>
          <p v-if="asking.open.message" id="ask-msg" class="text-[var(--muted)] whitespace-pre-line">{{ asking.open.message }}</p>
          <input v-if="asking.open.input" ref="input" v-model="asking.value" class="field mono" :placeholder="asking.open.input.placeholder" spellcheck="false" autocapitalize="off">
          <div class="flex justify-end gap-2">
            <button v-if="!asking.open.single" type="button" class="btn" @click="answer(false)">Cancel</button>
            <button :class="asking.open.danger ? 'inline-flex items-center rounded-full px-4 py-1.5 text-[13px] font-medium bg-[var(--bad)] text-white' : 'btn-blue'" :disabled="!!asking.open.input && !asking.value.trim()">{{ asking.open.okLabel }}</button>
          </div>
        </form>
      </Transition>
    </div>
  </Transition>
</template>
