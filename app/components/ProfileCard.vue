<script setup lang="ts">
// The profile Markdown as a readable card: one row per section, each editable in place.
const props = defineProps<{ profile: string, basic?: boolean }>()
const { state, setupAction } = useTester()
const LABELS: [string, string][] = [['Start', 'Starting your app'], ['Allowed URLs', 'Pages I may open'], ['Test accounts', 'Signing in'], ['Personas', 'Who I test as'], ['Must never break', 'Must always work'], ['Existing checks', 'Your own tests'], ['Notes for Tess', 'Notes for me'], ['Lessons', 'Corrections']]
// The file stays in the terse form Tess reads; the card says the same thing in plain words.
function plain(head: string, line: string) {
  if (head === 'Start') return line
    .replace(/^Command:\s*`?([^`]+?)`?\s*$/i, 'I start it with `$1`')
    .replace(/^Ready when:\s*(\S+)\s+returns 200\b\.?/i, 'Then I wait until $1 loads')
    .replace(/^Ready when:\s*/i, "It's ready when ")
    .replace(/^Seed:\s*none\b\s*/i, 'No test data to set up ')
    .replace(/^Seed:\s*/i, 'Test data: ')
  if (head === 'Personas') return line.replace(/^[\w-]+:\s*/, '')
  return line
}
// Shown even when missing, so there is always a place to tell Tess things.
const ALWAYS = new Set(['Notes for Tess', 'Lessons'])
const EMPTY: Record<string, string> = { 'Notes for Tess': 'None. Tell me what to focus on, skip or watch for.', Lessons: 'None. When I get a check wrong, correct me from the result and I keep it here.' }

const sections = computed(() => {
  const out: Record<string, string> = {}
  for (const part of props.profile.split(/^## /m).slice(1)) { const [head, ...body] = part.split('\n'); out[head!.trim()] = body.join('\n').trim() }
  return out
})
const rows = computed(() => LABELS.filter(([h]) => !(props.basic && ALWAYS.has(h)) && (h in sections.value || ALWAYS.has(h))).map(([head, label]) => ({
  head, label, lines: (sections.value[head] ?? '').split('\n').filter((l) => l.trim()).map((l) => plain(head, l.replace(/^\s*-\s*/, '')).split(/(`[^`]+`)/)),
})))
function replaceSection(head: string, text: string) {
  if (!(head in sections.value)) return `${props.profile.trimEnd()}\n\n## ${head}\n${text.trim()}\n`
  return props.profile.split(/^(?=## )/m).map((p) => (p.startsWith(`## ${head}`) ? `## ${head}\n${text.trim()}\n\n` : p)).join('').trimEnd() + '\n'
}

const editing = ref<string | null>(null) // a section head, or '*' for the whole file
const draft = ref('')
// What the edit started from, so a change on disk meanwhile (a lesson Tess learned, the other window) is caught.
const original = ref('')
const startHash = ref('')
const current = () => (editing.value === '*' ? props.profile : sections.value[editing.value!] ?? '- ')
const changedUnderneath = computed(() => !!editing.value && current() !== original.value)
const dirty = computed(() => !!editing.value && draft.value !== original.value)
watch(dirty, (d) => { state.draftDirty = d })
onBeforeUnmount(() => { state.draftDirty = false })
function edit(head: string) {
  editing.value = head
  draft.value = original.value = current()
  startHash.value = state.setup?.profileHash ?? ''
  escArmed.value = false
}
async function save() {
  if (changedUnderneath.value) return
  // A section is merged into the latest file, so only that section had to be unchanged (checked above);
  // the whole file is checked against the version the edit started from.
  const whole = editing.value === '*'
  const text = whole ? draft.value : replaceSection(editing.value!, draft.value)
  if (await setupAction('profile', { text, base: whole ? startHash.value : state.setup?.profileHash })) editing.value = null
}
// Esc on changed text asks first: the second Esc discards.
const escArmed = ref(false)
function cancel() {
  if (dirty.value && !escArmed.value) { escArmed.value = true; return }
  editing.value = null; escArmed.value = false
}
watch(draft, () => { escArmed.value = false })
</script>

<template>
  <div class="max-w-2xl rounded-2xl bg-[var(--surface)] surface divide-y divide-[var(--line)]">
    <template v-if="editing === '*'">
      <div class="p-4"><textarea v-model="draft" class="field mono text-[12px] min-h-96" aria-label="Profile Markdown" @keydown.meta.s.prevent="save" @keydown.esc.stop="cancel" /></div>
      <EditNotice :changed="changedUnderneath" :esc="escArmed" class="px-4" />
      <div class="flex gap-2 p-4"><button class="btn-blue" title="Save (⌘S)" :disabled="changedUnderneath" @click="save">Save</button><button class="btn" title="Cancel (Esc)" @click="cancel">Cancel</button></div>
    </template>
    <template v-else>
      <div v-for="row in rows" :key="row.head" class="px-5 py-4 flex gap-4">
        <span class="w-32 shrink-0 text-[var(--muted)]">{{ row.label }}</span>
        <div class="selectable flex-1 min-w-0 flex flex-col gap-1">
          <template v-if="editing === row.head">
            <textarea v-model="draft" class="field mono text-[12px] min-h-28" :aria-label="`Edit ${row.label}`" @keydown.meta.s.prevent="save" @keydown.esc.stop="cancel" />
            <EditNotice :changed="changedUnderneath" :esc="escArmed" />
            <div class="flex gap-2"><button class="btn-blue" title="Save (⌘S)" :disabled="changedUnderneath" @click="save">Save</button><button class="btn" title="Cancel (Esc)" @click="cancel">Cancel</button></div>
          </template>
          <p v-else-if="!row.lines.length || /^\(.*\)$/.test(row.lines.flat().join('').trim())" class="text-[var(--muted)]">{{ EMPTY[row.head] ?? 'Nothing here yet.' }}</p>
          <p v-for="(bits, i) in row.lines" v-else :key="i" :class="row.head === 'Must never break' && 'flex gap-2'">
            <span v-if="row.head === 'Must never break'" class="size-1.5 rounded-full bg-[var(--muted)] shrink-0 mt-[7px]" aria-hidden="true" />
            <span class="min-w-0"><template v-for="(bit, j) in bits" :key="j">
              <code v-if="bit.startsWith('`')" class="text-[12.5px] rounded-md bg-[#f3f3f3] px-1.5 py-0.5">{{ bit.slice(1, -1) }}</code>
              <template v-else>{{ bit }}</template>
            </template></span>
          </p>
        </div>
        <button v-if="editing === null" class="link-quiet text-[12px] self-start shrink-0" :aria-label="`Edit ${row.label}`" @click="edit(row.head)">{{ row.head in sections ? 'Edit' : 'Add' }}</button>
      </div>
      <div class="px-5 py-3 text-[12px] text-[var(--muted)] flex gap-3">
        <span>Saved as .ultimate-tester.md in the repo</span>
        <button v-if="editing === null" class="link-quiet ms-auto" @click="edit('*')">Open as Markdown</button>
      </div>
    </template>
  </div>
</template>
