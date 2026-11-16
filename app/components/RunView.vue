<script setup lang="ts">
// A test: the verdict first, then what Tess saw (driven by the selected check), Tess's words, and the checks.
import type { PlanItem, Persona } from '~/composables/useTester'
const { state, show } = useTester()
const r = computed(() => state.detail!)
const plan = computed(() => state.plan)
const v = computed(() => r.value.verdict)
const flows = computed(() => v.value?.flows ?? [])
const live = computed(() => r.value.status === 'running')
const finished = computed(() => !live.value)
const count = (st: string) => plan.value.filter((p) => p.status === st).length
const pass = computed(() => count('pass'))
const fail = computed(() => count('fail'))
const unk = computed(() => count('unverified'))
const todo = computed(() => plan.value.length - pass.value - fail.value - unk.value)

// Which persona a "can't check" is waiting on: its own, or one named in Tess's note ("needs Store owner with B2B").
function blockedBy(p: PlanItem): Persona | null {
  const ps = state.setup?.personas ?? []
  const text = `${p.note ?? ''} ${flows.value.find((f) => f.name === p.name)?.actual ?? ''}`.toLowerCase()
  return ps.find((x) => x.signIn && !x.savedAt && (x.key === p.persona || text.includes(x.key) || text.includes(x.label.toLowerCase())))
    ?? ps.find((x) => x.signIn && !x.savedAt && /\b(403|b2b)\b/.test(text) && /b2b/.test(`${x.key} ${x.label}`.toLowerCase()))
    ?? null
}
const blockers = computed(() => [...new Set(plan.value.filter((p) => p.status === 'unverified').map(blockedBy).filter(Boolean))] as Persona[])

// The answer first. Unrun checks never get a plain yes: "safe to push what I could reach", in amber.
const verdict = computed(() => {
  const n = (x: number, w: string) => `${x} ${w}${plural(x)}`
  if (v.value?.status === 'pass') {
    const note = /\bnot checked\b|couldn't check|didn't check/i.test(v.value.summary ?? '')
    return { lead: 'Safe to push. ', em: `All ${pass.value} checks passed${note ? ', with one thing Tess left unchecked' : ''}.`, cls: 'text-[var(--ok)]' }
  }
  if (v.value?.status === 'fail') return { lead: "Don't push yet: ", em: `${n(fail.value, 'thing')} broke.`, cls: 'text-[var(--bad)]' }
  if (v.value && pass.value && !fail.value) {
    const who = blockers.value.length ? blockers.value.map((b) => `a ${shortLabel(b.label).replace(/^(a|an) /i, '')}`).join(' and ') : 'a look'
    return { lead: 'Safe to push what I could reach. ', em: `${n(unk.value, 'check')} still ${unk.value === 1 ? 'needs' : 'need'} ${who}.`, cls: 'text-[var(--warn)]' }
  }
  if (v.value) return { lead: "Can't say yet: ", em: `${unk.value ? n(unk.value, 'check') : 'some checks'} couldn't run.`, cls: 'text-[var(--warn)]' }
  if (r.value.status === 'stopped') return { lead: 'This test stopped before the end.', em: '', cls: '' }
  if (fail.value) return { lead: 'Not safe yet: ', em: `${n(fail.value, 'thing')} broke.`, cls: 'text-[var(--bad)]' }
  return { lead: pass.value ? 'Looking good so far.' : 'Tess is getting started.', em: '', cls: '' }
})
const now = ref(Date.now())
const sub = computed(() => {
  let s = short(r.value.title)
  if (live.value) {
    const left = r.value.typicalMs ? r.value.typicalMs - (now.value - started(r.value.id)) : null
    s += ` · Tess is still testing${left && left > 60000 ? ` · about ${Math.round(left / 60000)} minutes left` : left && left > 0 ? ' · almost done' : ''}`
  } else if (v.value) s += ` · ${when(r.value.id)} · ${Math.round((v.value.durationMs ?? 0) / 60000) || '<1'} min · ${v.value.usage ?? ''}`
  return s
})
const bar = computed(() => {
  const total = Math.max(plan.value.length, 1)
  return [
    { n: pass.value, color: 'var(--ok)', word: 'passed' }, { n: fail.value, color: 'var(--bad)', word: 'broke' },
    { n: unk.value, color: 'var(--warn)', word: "can't check" }, { n: todo.value, color: 'color-mix(in srgb, var(--accent) 35%, transparent)', word: 'to go' },
  ].map((x) => ({ ...x, width: `${(x.n / total) * 100}%` }))
})

// Evidence: the selected check drives the screen. Screenshots no check claims sit in "Other screenshots".
const shotUrl = (x: string) => `/api/apps/${state.appId}/shots/${r.value.id}/${x}`
const evidenceOf = (name: string) => (flows.value.find((f) => f.name === name)?.evidence ?? []).map((e) => e.split('/').at(-1)!).filter((e) => r.value.shots.includes(e))
const others = computed(() => { const claimed = new Set(flows.value.flatMap((f) => evidenceOf(f.name))); return r.value.shots.filter((x) => !claimed.has(x)) })
const shotsFor = (name: string) => (name === OTHER ? others.value : evidenceOf(name))
const rank: Record<string, number> = { fail: 0, unverified: 1, running: 2, pending: 3, pass: 4 }
watchEffect(() => {
  if (!finished.value || !r.value.shots.length) return
  const order = [...plan.value].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)).map((p) => p.name).concat(others.value.length ? [OTHER] : [])
  if (state.sel.id === r.value.id && order.includes(state.sel.check!)) return
  const failed = flows.value.find((f) => f.status === 'fail' && evidenceOf(f.name).length)?.name
  state.sel = { id: r.value.id, check: failed ?? order.find((c) => shotsFor(c).length) ?? order[0] ?? null, shot: 0 }
})
const mine = computed(() => (state.sel.check ? shotsFor(state.sel.check) : []))
const what = computed(() => (state.sel.check === OTHER ? 'Other screenshots' : state.sel.check ?? ''))
const liveTick = ref(0)
const screen = computed(() => {
  if (finished.value && r.value.shots.length) {
    const shot = mine.value[Math.min(state.sel.shot, mine.value.length - 1)]
    return shot
      ? { src: shotUrl(shot), alt: `Evidence for: ${what.value}`, label: `Evidence · ${what.value}${mine.value.length > 1 ? ` · ${state.sel.shot + 1} of ${mine.value.length} (← →)` : ''}` }
      : { src: null, empty: `Tess didn't take a screenshot for “${what.value}”. Her note is in the checklist.`, label: `Evidence · ${what.value}` }
  }
  if (r.value.live) return { src: `/api/apps/${state.appId}/shots/${r.value.id}/live.jpg?t=${liveTick.value}`, alt: 'Live view of the app being tested', label: `${live.value ? 'Live' : 'Last screen'} · ${r.value.live.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` }
  return { src: null, empty: live.value ? 'Tess is reading the change. The app shows up here once she opens it.' : 'No screen was recorded for this test.', label: '' }
})
// Who she is testing as right now, from her last `as <persona>` command.
const asWho = computed(() => {
  const last = [...r.value.steps].reverse().find((s) => s.startsWith('do: Bash') && / as [a-z0-9-]+\s*$/.test(s))
  const key = last?.match(/ as ([a-z0-9-]+)\s*$/)?.[1]
  return key ? (state.setup?.personas.find((p) => p.key === key)?.label ?? key) : null
})
// What she just did, while she works; repeats collapse into one chip.
const chips = computed(() => (live.value ? r.value.steps.map(chipText).filter((c, i, a) => c && c !== a[i - 1]).slice(-4) as string[] : []))
const failing = computed(() => plan.value.find((p) => p.status === 'fail'))

const says = computed(() => r.value.steps.filter((s) => s.startsWith('say: ')).map((s) => s.slice(5)))
const bubble = computed(() => (v.value ? v.value.summary : says.value.at(-1) ?? 'Reading the change…'))
const bubbleLabel = computed(() => (v.value ? 'Tess · verdict' : fail.value ? 'Tess · caught one' : live.value ? 'Tess · testing' : 'Tess'))
const bubbleEdge = computed(() => (v.value && v.value.status !== 'pass' ? `inset 3px 0 0 ${v.value.status === 'fail' ? 'var(--bad)' : 'var(--warn)'}` : ''))

// Checks, by who Tess tested as: problems first with their one fix, passes folded.
const label = (k: string) => state.setup?.personas.find((x) => x.key === k)?.label ?? k
const groups = computed(() => [...new Set(plan.value.map((p) => p.persona ?? ''))].map((k) => {
  const all = plan.value.filter((p) => (p.persona ?? '') === k).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3))
  const byWho = new Map<Persona | null, number>()
  for (const p of all.filter((x) => x.status === 'unverified')) { const w = blockedBy(p); byWho.set(w, (byWho.get(w) ?? 0) + 1) }
  const passed = all.filter((p) => p.status === 'pass')
  const gk = `${r.value.id}:${k}`
  const open = state.unfolded.has(gk) || (finished.value && passed.some((p) => p.name === state.sel.check)) || (!byWho.size && !all.some((x) => x.status === 'fail'))
  return { k, gk, title: k ? label(k) : '', problems: all.filter((p) => p.status !== 'pass'), passed, open, fixes: [...byWho].map(([who, n]) => ({ who, n })), ok: passed.length, total: all.length }
}))
const toggleFold = (gk: string) => { state.unfolded.has(gk) ? state.unfolded.delete(gk) : state.unfolded.add(gk) }
const pick = (name: string) => { state.sel = { id: r.value.id, check: name, shot: 0 } }

// ↑ ↓ move between checks and the screen follows; ← → step through a check's screenshots (in reading direction).
const rail = ref<HTMLElement>()
function onKey(e: KeyboardEvent) {
  if (state.view !== 'run' || !finished.value || state.cmdk || state.menu || e.metaKey || e.ctrlKey || e.altKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName ?? '')) return
  const rows = [...(rail.value?.querySelectorAll<HTMLButtonElement>('button[data-check]') ?? [])]
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!rows.length) return
    e.preventDefault()
    const names = rows.map((b) => b.dataset.check!)
    const i = names.indexOf(state.sel.check!)
    const next = names[Math.max(0, Math.min(names.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]!
    pick(next)
    nextTick(() => rows[names.indexOf(next)]?.focus())
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const n = mine.value.length
    if (n < 2) return
    e.preventDefault()
    const forward = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl')
    state.sel.shot = (state.sel.shot + (forward ? 1 : n - 1)) % n
  }
}
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  window.addEventListener('keydown', onKey)
  timer = setInterval(() => { now.value = Date.now(); if (live.value) liveTick.value++ }, 1000)
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); clearInterval(timer) })
</script>

<template>
  <section class="flex-1 min-h-0 flex flex-col">
    <div class="shrink-0 px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)]">
      <div class="min-w-0">
        <h1 class="serif text-[26px] leading-tight font-normal text-balance">{{ verdict.lead }}<span v-if="verdict.em" :class="['italic', verdict.cls]">{{ verdict.em }}</span></h1>
        <p class="mt-0.5 text-[var(--muted)]">{{ sub }}</p>
      </div>
      <div class="w-full min-[880px]:w-[380px] min-[880px]:max-w-[45%] min-[880px]:ms-auto shrink-0">
        <div class="flex h-2.5 rounded-full overflow-hidden bg-[var(--sand)]">
          <span v-for="(b, i) in bar" :key="i" :class="i === 3 && live && 'pulse'" :style="{ width: b.width, background: b.color }" />
        </div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <template v-for="(b, i) in bar" :key="i">
            <span v-if="i < 3" :class="!b.n && 'text-[var(--muted)]'"><b :style="b.n ? { color: b.color } : {}">{{ b.n }}</b> {{ b.word }}</span>
            <span v-else-if="live" class="text-[var(--muted)]">{{ b.n }} to go</span>
          </template>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col overflow-y-auto min-[880px]:flex-row min-[880px]:overflow-visible">
      <main class="flex-1 min-w-0 p-4 flex flex-col gap-3" aria-label="What Tess saw">
        <div class="relative flex-1 min-h-[50vh] min-[880px]:min-h-0 rounded-2xl overflow-hidden bg-white text-zinc-900 surface flex flex-col">
          <div class="h-8 shrink-0 bg-[var(--sand)] border-b border-[var(--line)] flex items-center px-3 text-[12px] text-[var(--muted)] gap-2 min-w-0">
            <span v-if="live" class="size-1.5 rounded-full bg-rose-500 pulse shrink-0" />
            <span class="truncate">{{ screen.label }}</span>
            <span v-if="asWho" class="shrink-0 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 text-[11px] font-medium">as {{ asWho }}</span>
          </div>
          <div class="relative flex-1 min-h-0">
            <img v-if="screen.src" :src="screen.src" :alt="screen.alt" class="absolute inset-0 size-full object-contain object-top">
            <p v-else class="absolute inset-0 grid place-items-center text-[var(--muted)] px-6 text-center">{{ screen.empty }}</p>
            <div class="absolute end-4 top-4 flex flex-col items-end gap-1.5">
              <span
                v-for="(c, i) in chips" :key="`${i}${c}`"
                :class="['rounded-full px-3 py-1 text-[12px] shadow-sm', i === chips.length - 1 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-white/95 surface text-[var(--muted)]']"
              >{{ i === chips.length - 1 ? '◐' : '✓' }} {{ c }}</span>
              <span v-if="live && failing" class="rounded-full bg-[var(--bad)] text-white px-3 py-1 text-[12px] shadow">✕ {{ failing.note || failing.name }}</span>
            </div>
          </div>
        </div>
        <!-- Tess speaks under the screen, never over the evidence. -->
        <div class="shrink-0 flex items-end gap-3">
          <div class="tess breathe size-11 rounded-full shrink-0 shadow-md" aria-hidden="true" />
          <div :key="bubble" class="rise flex-1 min-w-0 rounded-2xl rounded-es-sm bg-[var(--bubble)] text-[var(--bubble-fg)] px-5 py-3 shadow-sm max-w-3xl max-h-[28vh] overflow-y-auto" :style="{ boxShadow: bubbleEdge }" aria-live="polite">
            <p class="text-[12px] text-[var(--bubble-muted)] mb-0.5">{{ bubbleLabel }}</p>
            <p class="serif text-[16px] leading-relaxed max-w-[68ch] text-pretty">{{ bubble }}</p>
          </div>
        </div>
      </main>

      <aside class="w-full border-t min-[880px]:w-72 min-[880px]:border-t-0 min-[880px]:border-s shrink-0 border-[var(--line)] flex flex-col min-h-0" aria-label="Checks and log">
        <div class="shrink-0 px-4 pt-3 flex gap-1 border-b border-[var(--line)]" role="tablist">
          <button
            v-for="t in (['checks', 'log'] as const)" :id="`tab-${t}`" :key="t" role="tab" :aria-selected="state.rail === t" :aria-controls="`panel-${t}`"
            :class="['px-2.5 py-1.5 -mb-px border-b-2', state.rail === t ? 'border-[var(--accent)] font-medium' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]']"
            @click="state.rail = t"
          >{{ t === 'checks' ? 'Checks' : 'Log' }}</button>
        </div>
        <div v-show="state.rail === 'checks'" id="panel-checks" ref="rail" role="tabpanel" aria-labelledby="tab-checks" class="flex-1 min-h-0 overflow-y-auto p-4">
          <h2 class="sr-only">Checks</h2>
          <p v-if="r.intro" class="pb-1 text-[13px] text-[var(--muted)] serif italic">"{{ r.intro }}"</p>
          <p v-if="!plan.length" class="text-[var(--muted)]">{{ live ? 'Tess is working out what to check…' : 'No checklist for this test.' }}</p>
          <div v-for="g in groups" :key="g.gk" class="flex flex-col gap-0.5">
            <div class="pt-3 pb-1 flex items-baseline justify-between gap-2">
              <h3 v-if="g.title" class="font-semibold leading-snug">{{ g.title }}</h3><span v-else />
              <span class="shrink-0 text-[var(--muted)]">{{ g.ok }} of {{ g.total }} passed</span>
            </div>
            <ul class="flex flex-col"><CheckRow v-for="p in g.problems" :key="p.name" :item="p" :finished="finished" :shots="shotsFor(p.name).length" :details="flows.find((f) => f.name === p.name)" @pick="pick" /></ul>
            <button
              v-for="f in g.fixes" :key="f.who?.key ?? '-'" class="mt-1.5 mb-1 self-start text-start rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] px-3 py-1.5 text-[13px] font-medium hover:brightness-[0.98]"
              @click="show('setup')"
            >
              {{ f.who ? `Sign in as ${shortLabel(f.who.label)} to check ${f.n === 1 ? 'this' : `these ${f.n}`}` : `${f.n} check${plural(f.n)} couldn't run. Fix in Setup` }}
              <span class="inline-block rtl:-scale-x-100">→</span>
            </button>
            <template v-if="g.passed.length">
              <button class="mt-1 py-1 text-start text-[13px] text-[var(--muted)] hover:text-[var(--ink)] flex gap-2" :aria-expanded="g.open" @click="toggleFold(g.gk)">{{ g.open ? '⌃' : '⌄' }} {{ g.passed.length }} passed</button>
              <ul v-if="g.open" class="flex flex-col"><CheckRow v-for="p in g.passed" :key="p.name" :item="p" :finished="finished" :shots="shotsFor(p.name).length" :details="flows.find((f) => f.name === p.name)" @pick="pick" /></ul>
            </template>
          </div>
          <ul v-if="finished && others.length" class="mt-3 flex flex-col"><CheckRow :item="{ name: OTHER, status: 'pass' }" :label="`Other screenshots (${others.length})`" :finished="finished" :shots="others.length" @pick="pick" /></ul>
        </div>
        <div v-show="state.rail === 'log'" id="panel-log" role="tabpanel" aria-labelledby="tab-log" class="flex-1 min-h-0 overflow-y-auto bg-[#1b241e] text-[#dfe8dc] p-4 mono text-[11px] leading-5">
          <h2 class="sr-only">Log</h2>
          <p v-for="(s, i) in r.steps" :key="i" :class="s.startsWith('say: ') ? 'text-[#cfe3d2] font-sans text-[13px] my-1' : 'text-[#dfe8dc]/70 break-all'">{{ s.startsWith('say: ') ? `Tess  ${s.slice(5)}` : `·  ${s.slice(4)}` }}</p>
        </div>
      </aside>
    </div>
  </section>
</template>
