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
const tone = computed(() => (props.item.status === 'pending' ? 'text-[var(--muted)]' : ''))
const showNote = computed(() => selected.value && props.item.name !== OTHER)
</script>

<template>
  <li>
    <component
      :is="canSelect ? 'button' : 'div'" :data-check="canSelect ? item.name : undefined"
      :aria-pressed="canSelect ? selected : undefined" :aria-controls="canSelect ? 'evidence' : undefined"
      :class="['w-full text-start p-2.5 flex items-start gap-2.5 rounded-[10px] text-[14px] font-medium leading-snug', selected ? 'bg-[var(--sand)]' : canSelect && 'hover:bg-[var(--row-hover)]', tone]"
      @click="canSelect && $emit('pick', item.name)"
    >
      <component :is="st.icon" :class="['size-[17px] shrink-0 mt-px', st.cls]" aria-hidden="true" />
      <span class="sr-only">{{ st.word }}: </span>
      <span class="flex-1">{{ label ?? item.name }}</span>
      <span v-if="shots > 1" class="text-[12px] font-normal text-[var(--faint)] shrink-0 tabular-nums">{{ shots }}</span>
    </component>
    <Transition name="reveal"><div v-if="showNote" class="selectable ms-[37px] me-2.5 mt-1 mb-1 flex flex-col gap-1.5 text-[12.5px] text-[var(--muted)]">
      
      <Transition name="reveal" mode="out-in">
      <p v-if="taught" key="taught" class="text-[var(--ink)]" role="status">Got it. I'll keep that in mind next time.</p>
      <form v-else-if="teaching" key="form" class="flex flex-col gap-2" @submit.prevent="teach">
        <textarea v-model="lesson" class="field min-h-16" maxlength="500" placeholder="An empty cart is normal for new merchants." aria-label="What should I know next time?" @keydown.meta.enter="lesson.trim() && teach()" />
        <div class="flex gap-2"><button class="btn-blue" :disabled="!lesson.trim()">Remember this</button><button type="button" class="btn" @click="teaching = false">Cancel</button></div>
      </form>
      <button v-else key="ask" class="link self-start text-[12px]" @click="teaching = true">Did I get this wrong?</button>
      </Transition>
    </div></Transition>
  </li>
</template>
