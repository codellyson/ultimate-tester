<script setup lang="ts">
import { CheckIcon } from '@heroicons/vue/16/solid'
// The profile Markdown as a readable card: one row per section, each editable in place.
const props = defineProps<{ profile: string, basic?: boolean }>()
const { setupAction } = useTester()
const LABELS: [string, string][] = [['Start', 'Start the app'], ['Allowed URLs', 'Where I may go'], ['Test accounts', 'Signs in as'], ['Personas', 'Personas'], ['Must never break', 'Must never break'], ['Existing checks', 'Tests to run'], ['Notes for Tess', 'Always keep in mind'], ['Lessons', "What you've taught me"]]
// Shown even when missing, so there is always a place to tell Tess things.
const ALWAYS = new Set(['Notes for Tess', 'Lessons'])
const EMPTY: Record<string, string> = { 'Notes for Tess': 'Nothing yet. Tell me what to focus on, skip, or watch out for.', Lessons: 'Nothing yet. When I get a check wrong, tell me from the result and it lands here.' }

const sections = computed(() => {
  const out: Record<string, string> = {}
  for (const part of props.profile.split(/^## /m).slice(1)) { const [head, ...body] = part.split('\n'); out[head!.trim()] = body.join('\n').trim() }
  return out
})
const rows = computed(() => LABELS.filter(([h]) => !(props.basic && ALWAYS.has(h)) && (h in sections.value || ALWAYS.has(h))).map(([head, label]) => ({
  head, label, lines: (sections.value[head] ?? '').split('\n').filter((l) => l.trim()).map((l) => l.replace(/^\s*-\s*/, '').split(/(`[^`]+`)/)),
})))
function replaceSection(head: string, text: string) {
  if (!(head in sections.value)) return `${props.profile.trimEnd()}\n\n## ${head}\n${text.trim()}\n`
  return props.profile.split(/^(?=## )/m).map((p) => (p.startsWith(`## ${head}`) ? `## ${head}\n${text.trim()}\n\n` : p)).join('').trimEnd() + '\n'
}

const editing = ref<string | null>(null) // a section head, or '*' for the whole file
const draft = ref('')
function edit(head: string) { editing.value = head; draft.value = head === '*' ? props.profile : sections.value[head] ?? '- ' }
async function save() {
  const text = editing.value === '*' ? draft.value : replaceSection(editing.value!, draft.value)
  if (await setupAction('profile', { text })) editing.value = null
}
</script>

<template>
  <div class="max-w-2xl rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)]">
    <template v-if="editing === '*'">
      <div class="p-4"><textarea v-model="draft" class="field mono text-[12px] min-h-96" aria-label="Profile Markdown" /></div>
      <div class="flex gap-2 p-4"><button class="btn-blue" @click="save">Save</button><button class="btn" @click="editing = null">Cancel</button></div>
    </template>
    <template v-else>
      <div v-for="row in rows" :key="row.head" class="px-5 py-4 flex gap-4">
        <span class="w-32 shrink-0 text-[var(--muted)]">{{ row.label }}</span>
        <div class="selectable flex-1 min-w-0 flex flex-col gap-1">
          <template v-if="editing === row.head">
            <textarea v-model="draft" class="field mono text-[12px] min-h-28" :aria-label="`Edit ${row.label}`" />
            <div class="flex gap-2"><button class="btn-blue" @click="save">Save</button><button class="btn" @click="editing = null">Cancel</button></div>
          </template>
          <p v-else-if="!row.lines.length || /^\(.*\)$/.test(row.lines.flat().join('').trim())" class="text-[var(--muted)]">{{ EMPTY[row.head] ?? 'Nothing here yet.' }}</p>
          <p v-for="(bits, i) in row.lines" v-else :key="i" :class="row.head === 'Must never break' && 'flex gap-2'">
            <CheckIcon v-if="row.head === 'Must never break'" class="size-4 shrink-0 mt-0.5 text-[var(--ok)]" aria-hidden="true" />
            <template v-for="(bit, j) in bits" :key="j">
              <code v-if="bit.startsWith('`')" class="mono text-[12px] rounded bg-[var(--sand)] px-1.5 py-0.5">{{ bit.slice(1, -1) }}</code>
              <template v-else>{{ bit }}</template>
            </template>
          </p>
        </div>
        <button v-if="editing !== row.head" class="link-quiet text-[12px] self-start shrink-0" :aria-label="`Edit ${row.label}`" @click="edit(row.head)">{{ row.head in sections ? 'Edit' : 'Add' }}</button>
      </div>
      <div class="px-5 py-3 text-[12px] text-[var(--muted)] flex gap-3">
        <span>Saved as .ultimate-tester.md in the repo</span>
        <button class="link-quiet ms-auto" @click="edit('*')">Open as Markdown</button>
      </div>
    </template>
  </div>
</template>
