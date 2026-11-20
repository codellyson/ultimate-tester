<script setup lang="ts">
import type { PlanQuestion } from '~/composables/useTester'
// What Tess couldn't work out from the repo, one card each. Her guess is already in the plan;
// answering replaces it, "Keep your guess" leaves it. Asked once: an answered question never comes back.
const { state, setupAction } = useTester()
const qs = computed(() => state.setup?.questions ?? [])

const drafts = reactive<Record<string, string>>({})
const asText = (q: PlanQuestion) => q.kind === 'lines'
  ? (Array.isArray(q.value) ? q.value.map((v) => (q.objects ? (v as { check?: string }).check ?? '' : String(v))).join('\n') : '')
  : String(q.value ?? '')
const text = (q: PlanQuestion) => drafts[q.field] ?? asText(q)
const valueOf = (q: PlanQuestion) => {
  const t = drafts[q.field] ?? asText(q)
  if (q.kind !== 'lines') return t.trim()
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  // A check kept as written keeps the "as" and "start at" from the guess.
  const was = Array.isArray(q.value) ? q.value as { check?: string }[] : []
  return q.objects ? lines.map((check) => was.find((w) => w.check === check) ?? { check }) : lines
}
const answer = (q: PlanQuestion, value: unknown) => setupAction('answer', { field: q.field, value })
const keep = (q: PlanQuestion) => setupAction('keep', { field: q.field })
</script>

<template>
  <div v-if="qs.length" class="flex flex-col gap-2">
    <TessSays>I couldn't work {{ qs.length === 1 ? 'this' : `these ${qs.length}` }} out from the repo. I've put in my best guess; change it or keep it.</TessSays>
    <div v-for="q in qs" :key="q.field" class="ms-12 rounded-2xl surface px-5 py-4 flex flex-col gap-3">
      <p class="text-[15px] leading-[1.5]">{{ q.question }}</p>
      <div v-if="q.kind === 'choice'" class="flex flex-wrap gap-2" role="group" :aria-label="q.question">
        <button
          v-for="o in q.options" :key="String(o.value)"
          :class="o.value === q.value ? 'btn-blue' : 'btn'"
          :aria-pressed="o.value === q.value"
          @click="answer(q, o.value)"
        >{{ o.label }}</button>
      </div>
      <template v-else>
        <textarea
          v-if="q.kind === 'lines'" :value="text(q)" rows="4" class="field text-[13px]"
          :aria-label="q.question" :placeholder="'One per line'"
          @input="drafts[q.field] = ($event.target as HTMLTextAreaElement).value"
        />
        <input
          v-else :value="text(q)" class="field" :aria-label="q.question"
          @input="drafts[q.field] = ($event.target as HTMLInputElement).value"
        >
        <div class="flex gap-2">
          <button class="btn-blue" @click="answer(q, valueOf(q))">Save</button>
          <button class="btn" @click="keep(q)">Keep your guess</button>
        </div>
      </template>
      <button v-if="q.kind === 'choice'" class="link-quiet text-[12px] self-start" @click="keep(q)">Keep your guess ({{ q.options?.find((o) => o.value === q.value)?.label ?? 'as drafted' }})</button>
    </div>
  </div>
</template>
