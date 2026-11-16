<script setup lang="ts">
// One check: selecting it puts its evidence on the screen and opens Tess's note under it.
import type { PlanItem, Flow } from '~/composables/useTester'
const props = defineProps<{ item: PlanItem, finished: boolean, shots: number, details?: Flow, label?: string }>()
defineEmits<{ pick: [name: string] }>()
const { state, setupAction } = useTester()
// "Tess got this wrong": the correction becomes a lesson in the profile.
const teaching = ref(false)
const lesson = ref('')
const taught = ref(false)
async function teach() {
  if (await setupAction('lesson', { text: lesson.value, check: props.item.name })) { taught.value = true; teaching.value = false; lesson.value = '' }
}
const st = computed(() => statusOf(props.item.status))
const selected = computed(() => props.finished && state.sel.check === props.item.name)
const canSelect = computed(() => props.finished && props.item.status !== 'pending')
const tone = computed(() => ({ fail: 'text-[var(--bad)] font-medium', running: 'font-medium', pending: 'text-[var(--muted)]' } as Record<string, string>)[props.item.status] ?? '')
const showNote = computed(() => selected.value && props.item.name !== OTHER)
</script>

<template>
  <li>
    <component
      :is="canSelect ? 'button' : 'div'" :data-check="canSelect ? item.name : undefined"
      :aria-pressed="canSelect ? selected : undefined" :aria-controls="canSelect ? 'panel-checks' : undefined"
      :class="['w-full text-start py-1.5 px-2 -mx-2 flex gap-2 rounded-lg', selected ? 'bg-[var(--sand)]' : canSelect && 'hover:bg-[var(--sand)]/60', tone]"
      @click="canSelect && $emit('pick', item.name)"
    >
      <span :class="['w-4 shrink-0 text-center', st.cls]" aria-hidden="true">{{ st.icon }}</span>
      <span class="sr-only">{{ st.word }}: </span>
      <span class="flex-1">{{ label ?? item.name }}</span>
      <span v-if="shots > 1" class="text-[12px] text-[var(--muted)] shrink-0">{{ shots }} shots</span>
    </component>
    <Transition name="reveal"><div v-if="showNote" class="ms-6 mb-2 mt-1 flex flex-col gap-1.5 text-[13px] text-[var(--muted)]">
      <p v-if="item.note" class="text-[var(--ink)] leading-snug">{{ item.note }}</p>
      <p v-if="details?.expected && item.status !== 'pass'">Expected: {{ details.expected }}</p>
      <p v-if="details?.actual && item.status !== 'pass'">Saw: {{ details.actual }}</p>
      <Transition name="reveal" mode="out-in">
      <p v-if="taught" key="taught" class="text-[var(--ok)]" role="status">Got it. I'll remember that on every run.</p>
      <form v-else-if="teaching" key="form" class="flex flex-col gap-2" @submit.prevent="teach">
        <textarea v-model="lesson" class="field min-h-16" maxlength="500" placeholder="What should I know next time? e.g. “The empty cart is expected for new merchants.”" aria-label="What Tess should know next time" @keydown.meta.enter="teach" />
        <div class="flex gap-2"><button class="btn-blue" :disabled="!lesson.trim()">Teach Tess</button><button type="button" class="btn" @click="teaching = false">Cancel</button></div>
      </form>
      <button v-else key="ask" class="link self-start text-[12px]" @click="teaching = true">Tess got this wrong?</button>
      </Transition>
    </div></Transition>
  </li>
</template>
