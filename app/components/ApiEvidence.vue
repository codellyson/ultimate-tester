<script setup lang="ts">
import { PhCopy, PhCheck, PhXCircle } from '@phosphor-icons/vue'
import type { Req } from '~/composables/useTester'
// A check made with requests: when one proves a failure, what should have come back beside what did,
// the wrong fields marked; the requests that led there underneath, one numbered step each (DESIGN.md · API checks).
const props = defineProps<{ reqs: Req[], note?: string, base?: string | null }>()

const WORDS: Record<number, string> = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No content', 301: 'Moved', 302: 'Found', 304: 'Not modified', 400: 'Bad request', 401: 'Not signed in', 403: 'Forbidden', 404: 'Not found', 405: 'Not allowed', 409: 'Conflict', 422: "Couldn't process", 429: 'Too many requests', 500: 'Server error', 502: 'Bad gateway', 503: 'Unavailable' }
const word = (s: number) => WORDS[s] ?? ''

const parse = (s?: string) => { if (!s) return undefined; try { return JSON.parse(s) } catch { return undefined } }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
// One line per top-level field, so a wrong field can be marked on its own; anything else is shown as it came.
function lines(text: string | undefined, other?: string) {
  const v = parse(text), o = parse(other)
  if (!isObj(v)) return [{ text: v === undefined ? (text ?? '') : JSON.stringify(v, null, 2), off: other !== undefined && o !== undefined && JSON.stringify(v) !== JSON.stringify(o) }]
  const keys = Object.keys(v)
  return [{ text: '{', off: false }, ...keys.map((k, i) => ({
    text: `  ${JSON.stringify(k)}: ${JSON.stringify(v[k])}${i < keys.length - 1 ? ',' : ''}`,
    off: isObj(o) && JSON.stringify(v[k]) !== JSON.stringify(o[k]),
  })), { text: '}', off: false }]
}

const proof = computed(() => [...props.reqs].reverse().find((r) => r.expected))
const open = ref(false)
watch(() => props.reqs, () => { open.value = false })
const showSteps = computed(() => !proof.value || open.value)

const copied = ref(-1)
function curl(r: Req) {
  const url = `${(props.base ?? 'http://localhost').replace(/\/$/, '')}${r.path}`
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  return [`curl -sS -X ${r.method} ${q(url)}`, ...(r.sent ? [`-H 'content-type: application/json'`, `-d ${q(r.sent)}`] : [])].join(' ')
}
async function copy(r: Req, i: number) {
  try { await navigator.clipboard.writeText(curl(r)); copied.value = i; setTimeout(() => { if (copied.value === i) copied.value = -1 }, 1500) } catch {}
}
</script>

<template>
  <div class="rounded-2xl lifted bg-[var(--surface)] overflow-hidden shrink-0 selectable">
    <!-- The difference first: what should have come back, beside what did. -->
    <div v-if="proof" class="p-4 flex flex-col gap-3 border-b border-[var(--line)]">
      <div class="grid grid-cols-2 gap-2.5">
        <div class="rounded-[12px] ring-1 ring-inset ring-[var(--line)] p-3 min-w-0">
          <p class="text-[12.5px] text-[var(--muted)] mb-1.5">Expected</p>
          <pre class="api-pre"><span v-for="(l, i) in lines(proof.expected, proof.got)" :key="i" class="block">{{ l.text }}</span></pre>
        </div>
        <div class="rounded-[12px] ring-[1.5px] ring-inset ring-[var(--bad)] p-3 min-w-0">
          <p class="text-[12.5px] mb-1.5 flex items-center gap-1.5"><PhXCircle weight="fill" class="size-3.5 text-[var(--bad)]" aria-hidden="true" />Came back · {{ proof.status }} {{ word(proof.status) }}</p>
          <pre class="api-pre"><span v-for="(l, i) in lines(proof.got, proof.expected)" :key="i" :class="['block', l.off && 'api-off w-fit']">{{ l.text }}</span></pre>
        </div>
      </div>
      <p v-if="note" class="text-[14px] leading-[1.55]">{{ note }}</p>
    </div>

    <div v-if="proof" class="px-4 py-3 flex items-center gap-3">
      <p class="flex-1 text-[13px]"><b class="font-semibold">How I got there</b> <span class="text-[var(--muted)]">· {{ reqs.length }} {{ reqs.length === 1 ? 'request' : 'requests' }}</span></p>
      <button class="btn-plain h-7 text-[12.5px]" :aria-expanded="open" @click="open = !open">{{ open ? 'Hide' : 'Show' }}</button>
    </div>

    <ol v-if="showSteps" :class="['divide-y divide-[var(--line)]', proof && 'border-t border-[var(--line)]']">
      <li v-for="(r, i) in reqs" :key="i" class="px-4 py-3.5 flex flex-col gap-2 text-[13px] leading-[1.55]">
        <p class="flex items-center gap-2 min-w-0">
          <span class="size-5 shrink-0 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[11px] font-semibold grid place-items-center tabular-nums" aria-hidden="true">{{ i + 1 }}</span>
          <span class="shrink-0 rounded-md bg-[var(--code)] px-1.5 py-0.5 text-[11.5px] font-semibold tracking-wide">{{ r.method }}</span>
          <span class="font-medium break-all flex-1 min-w-0">{{ r.path }}</span>
          <button class="btn-plain h-7 text-[12px] shrink-0" :title="curl(r)" @click="copy(r, i)"><component :is="copied === i ? PhCheck : PhCopy" class="size-3.5" aria-hidden="true" />{{ copied === i ? 'Copied' : 'Copy as curl' }}</button>
        </p>
        <pre v-if="r.sent" class="api-pre api-box"><span v-for="(l, j) in lines(r.sent)" :key="j" class="block">{{ l.text }}</span></pre>
        <p class="flex items-center gap-2 text-[12.5px]">
          <span class="rounded-full bg-[var(--accent)] text-[var(--on-accent)] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums">{{ r.status }}</span>
          <span>{{ word(r.status) }}</span>
          <span v-if="r.ms != null" class="text-[var(--muted)] tabular-nums">· {{ Math.round(r.ms) }} ms</span>
        </p>
        <pre v-if="r.got" class="api-pre api-box max-h-64 overflow-auto"><span v-for="(l, j) in lines(r.got, r === proof ? r.expected : undefined)" :key="j" :class="['block', l.off && 'api-off w-fit']">{{ l.text }}</span></pre>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.api-pre { margin: 0; font: 12.5px/1.6 var(--font-sans, inherit); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-2); }
.api-box { border-radius: 10px; background: var(--box); padding: 8px 12px; }
/* The one place colour marks content: the field that proves a check broke (DESIGN.md · API checks). */
.api-off { background: var(--proof); border-radius: 4px; color: var(--ink); font-weight: 600; }
</style>
