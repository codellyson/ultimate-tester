<script setup lang="ts">
import { ArrowPathIcon, ArrowRightIcon, XMarkIcon, ChevronDownIcon } from '@heroicons/vue/16/solid'
// A test: the verdict first, then what Tess saw (driven by the selected check), Tess's words, and the checks.
import type { PlanItem, Persona } from '~/composables/useTester'
const { state, openSettings, rerun, stopTest, tauri } = useTester()
const r = computed(() => state.detail!)
const v = computed(() => r.value.verdict)
const flows = computed(() => v.value?.flows ?? [])
// While Tess works, her own checklist (plan.json) is the live view. Once she's done, every status comes from the
// verdict, which the engine has checked for evidence: a check she never reported counts as not checked, never as passed.
// A stopped test's unfinished checks read "not checked".
const plan = computed<PlanItem[]>(() => {
  if (r.value.status === 'stopped') return state.plan.map((p) => (p.status === 'pending' || p.status === 'running' ? { ...p, status: 'notrun' } : p))
  if (!v.value) return state.plan
  const reported = new Map(flows.value.map((f) => [f.name, f]))
  const fromPlan = state.plan.map((p) => ({ ...p, status: reported.get(p.name)?.status ?? 'unverified', persona: p.persona ?? reported.get(p.name)?.persona }))
  const extra = flows.value.filter((f) => !state.plan.some((p) => p.name === f.name)).map((f) => ({ name: f.name, status: f.status, persona: f.persona }))
  return [...fromPlan, ...extra]
})
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
  // Stopped comes first: a stopped test is not a result, whatever was checked before it.
  if (r.value.status === 'stopped') return v.value?.summary === 'You stopped this test.'
    ? { lead: 'You stopped this test.', em: '', cls: '' }
    : { lead: 'This test stopped before the end.', em: '', cls: '' }
  // Green only when nothing is left unchecked, whatever the stored status says.
  if (v.value?.status === 'pass' && !unk.value) {
    const note = /\bnot checked\b|couldn't check|didn't check/i.test(v.value.summary ?? '')
    // Something left unchecked is never a plain green yes.
    return { lead: note ? 'Everything I tested passed. ' : 'Safe to push. ', em: `All ${pass.value} checks passed${note ? ', but Tess mentions something she didn\'t check' : ''}.`, cls: note ? 'text-[var(--warn)]' : 'text-[var(--ok)]' }
  }
  if (v.value?.status === 'fail') return { lead: "Don't push yet: ", em: `${n(fail.value, 'thing')} broke.`, cls: 'text-[var(--bad)]' }
  // Tess never got evidence from the app and no missing sign-in explains it: say so, never "safe".
  if (v.value && !fail.value && unk.value && !blockers.value.length && !r.value.shots.length) {
    return { lead: "Couldn't test this in the app. ", em: `${n(unk.value, 'check')} didn't run.`, cls: 'text-[var(--warn)]' }
  }
  // "Safe to push what I could reach" only when every unrun check is waiting on a sign-in you can add;
  // any other gap is an honest "can't say yet" (prompt.md: never call a run safe if a flow wasn't checked).
  const allBlockedBySignIn = plan.value.filter((p) => p.status === 'unverified').every((p) => !!blockedBy(p))
  if (v.value && pass.value && !fail.value && allBlockedBySignIn) {
    const need = `still ${unk.value === 1 ? 'needs' : 'need'} ${blockers.value.map((b) => `a ${shortLabel(b.label).replace(/^(a|an) /i, '')}`).join(' and ')}`
    return { lead: 'Safe to push what I could reach. ', em: `${n(unk.value, 'check')} ${need}.`, cls: 'text-[var(--warn)]' }
  }
  if (v.value) return { lead: "Can't say yet: ", em: `${unk.value ? n(unk.value, 'check') : 'some checks'} couldn't run.`, cls: 'text-[var(--warn)]' }
  if (fail.value) return { lead: 'Not safe yet: ', em: `${n(fail.value, 'thing')} broke.`, cls: 'text-[var(--bad)]' }
  return { lead: pass.value ? 'Looking good so far.' : 'Tess is getting started.', em: '', cls: '' }
})
const tested = computed(() => {
  const c = r.value.change
  if (!c) return ''
  const first = c.message.split('\n')[0] ?? ''
  const what = c.kind === 'changes' || first.startsWith('(not committed') ? 'Uncommitted changes' : first
  const files = c.files?.length ? `${c.files.length} file${plural(c.files.length)} changed` : ''
  return [what, files, when(r.value.id)].filter(Boolean).join(' · ')
})
// A plain-text report a coding agent can act on: verdict, what was tested, and each problem with its evidence.
const copied = ref(false)
async function copyReport() {
  if (!v.value) { state.flash = 'Open a finished test to copy its report.'; return }
  const app = state.apps.find((a) => a.id === state.appId)
  const dir = app ? `${app.root}/.ultimate-tester/runs/${r.value.id}` : ''
  const lines = [`Ultimate Tester: ${verdict.value.lead}${verdict.value.em}`.trim(), tested.value, '', v.value.summary]
  for (const f of flows.value.filter((x) => x.status !== 'pass')) {
    lines.push('', `${statusOf(f.status).word.toUpperCase()}: ${f.name}`)
    if (f.steps?.length) lines.push(...f.steps.map((s, i) => `  ${i + 1}. ${s}`))
    if (f.expected) lines.push(`  Expected: ${f.expected}`)
    if (f.actual) lines.push(`  Actual: ${f.actual}`)
    for (const e of f.evidence ?? []) lines.push(`  Evidence: ${e.startsWith('/') || !dir ? e : `${dir}/${e.split('/').at(-1)}`}`)
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n').trim() + '\n')
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { state.flash = "Couldn't copy the report." }
}
watch(() => state.copyTick, () => copyReport())

const now = ref(Date.now())
// Under the verdict: counts only when something isn't a pass; the test's name and time live in the title bar.
const meta = computed(() => {
  if (live.value) {
    const left = r.value.typicalMs ? r.value.typicalMs - (now.value - started(r.value.id)) : null
    return [{ text: 'Tess is still testing', cls: '' }, ...(left && left > 60000 ? [{ text: `about ${Math.round(left / 60000)} minutes left`, cls: '' }] : left && left > 0 ? [{ text: 'almost done', cls: '' }] : [])]
  }
  const out: { text: string, cls: string }[] = []
  if (fail.value || unk.value) {
    if (pass.value) out.push({ text: `${pass.value} passed`, cls: '' })
    if (fail.value) out.push({ text: `${fail.value} broke`, cls: 'text-[var(--bad)] font-medium' })
    if (unk.value) out.push({ text: `${unk.value} can't check`, cls: 'text-[var(--warn)] font-medium' })
  }
  if (v.value) out.push({ text: `${Math.round((v.value.durationMs ?? 0) / 60000) || '<1'} min`, cls: '' })
  if (finished.value && !r.value.shots.length) out.push({ text: 'no screenshots', cls: '' })
  return out
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
      ? { src: shotUrl(shot), file: shot, alt: `Evidence for: ${what.value}`, label: `Evidence · ${what.value}${mine.value.length > 1 ? ` · ${state.sel.shot + 1} of ${mine.value.length} (← →)` : ''}` }
      : { src: null, empty: `Tess didn't take a screenshot for “${what.value}”. Her note is in the checklist.`, label: `Evidence · ${what.value}` }
  }
  // A browser that never left about:blank is not evidence of anything.
  if (r.value.live && r.value.live.url !== 'about:blank') return { src: `/api/apps/${state.appId}/shots/${r.value.id}/live.jpg?t=${liveTick.value}`, alt: 'Live view of the app being tested', label: `${live.value ? 'Live' : 'Last screen'} · ${r.value.live.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` }
  return { src: null, empty: live.value ? 'Tess is reading the change. The app shows up here once she opens it.' : (r.value.status === 'stopped' ? 'The test was stopped before Tess took a screenshot.' : r.value.live ? "Tess never reached the app, so there's no screen to show. Her note in the checklist says why." : 'No screen was recorded for this test.'), label: live.value ? '' : 'No screen' }
})
// A finished test with nothing to show: the panel shrinks so Tess's words and the checks lead.
const noEvidence = computed(() => finished.value && !r.value.shots.length && !screen.value.src)

// Evidence up close: click or Space for full size; drag it out; right-click to copy or find the file.
const zoomed = ref(false)
const zoomBox = ref<HTMLElement>()
const { onTab: zoomTab } = useModalFocus(() => zoomed.value, zoomBox)
watch(() => screen.value.src, (src) => { if (!src) zoomed.value = false })
const shotFile = computed(() => ('file' in screen.value ? (screen.value.file as string) : null))
async function copyImage() {
  const blob = await (await fetch(screen.value.src!)).blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}
async function evidenceMenu(e: MouseEvent) {
  const t = tauri()
  if (!t?.menu || !screen.value.src) return
  e.preventDefault()
  const app = state.apps.find((a) => a.id === state.appId)
  const path = app && shotFile.value ? `${app.root}/.ultimate-tester/runs/${r.value.id}/${shotFile.value}` : null
  const m = await t.menu.Menu.new({ items: [
    { text: zoomed.value ? 'Close' : 'Enlarge', action: () => { zoomed.value = !zoomed.value } },
    { text: 'Copy Image', enabled: !!shotFile.value?.endsWith('.png'), action: () => { copyImage().catch(() => { state.flash = "Couldn't copy the screenshot." }) } },
    { text: 'Show in Finder', enabled: !!path && !!t.opener, action: () => { if (path) t.opener?.revealItemInDir(path) } },
  ] })
  await m.popup()
}

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
// The headline is the verdict; the bubble is Tess explaining it. A verdict phrase opening her summary is
// dropped, so the two can never disagree ("4 checks still need a look" above, "Safe to push." below).
const VERDICT_LEAD = /^\s*(safe to push|don['’]t push yet|not safe yet|can['’]t say yet)[^.!?:]*[.!?:]\s*/i
// A stopped test explains how far Tess got, rather than replaying whatever she said last.
const stoppedNote = computed(() => {
  const done = plan.value.filter((p) => ['pass', 'fail', 'unverified'].includes(p.status)).length
  const last = says.value.at(-1)
  return `You stopped me ${done ? `after ${done} of ${plan.value.length} checks` : 'before I checked anything'}.${last ? ` I was at: “${last}”` : ''}`
})
const bubble = computed(() => (r.value.status === 'stopped' ? stoppedNote.value : v.value ? v.value.summary.replace(VERDICT_LEAD, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase()) || v.value.summary : says.value.at(-1) ?? 'Reading the change…'))
const bubbleLabel = computed(() => (r.value.status === 'stopped' ? 'Tess · stopped' : v.value ? 'Tess · what I found' : fail.value ? 'Tess · caught one' : live.value ? 'Tess · testing' : 'Tess'))
const bubbleEdge = computed(() => (v.value && v.value.status !== 'pass' && r.value.status !== 'stopped' ? `inset 3px 0 0 ${v.value.status === 'fail' ? 'var(--bad)' : 'var(--warn)'}` : ''))

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
// Why checks couldn't run when no sign-in is to blame: Tess's own note on the first one.
const blockerNote = (g: { problems: PlanItem[] }) => {
  const p = g.problems.find((x) => x.status === 'unverified' && !blockedBy(x))
  return p ? (p.note || flows.value.find((f) => f.name === p.name)?.actual || '') : ''
}
const toggleFold = (gk: string) => { state.unfolded.has(gk) ? state.unfolded.delete(gk) : state.unfolded.add(gk) }
const pick = (name: string) => { state.sel = { id: r.value.id, check: name, shot: 0 } }

// ↑ ↓ move between checks and the screen follows; ← → step through a check's screenshots (in reading direction).
const rail = ref<HTMLElement>()
function onKey(e: KeyboardEvent) {
  // ↑↓ belong to the checks only while they're showing; in the Log they scroll the log.
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (state.rail !== 'checks' || (document.activeElement as HTMLElement)?.closest?.('#panel-log'))) return
  if (zoomed.value && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); zoomed.value = false; return }
  if (state.view !== 'run' || !finished.value || state.cmdk || state.menu || e.metaKey || e.ctrlKey || e.altKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement)?.tagName ?? '')) return
  // Space enlarges the evidence, also with a check selected from the keyboard (Quick Look-style).
  const focused = document.activeElement as HTMLElement | null
  if (e.key === ' ' && screen.value.src && (focused?.dataset.check || !focused?.closest?.('button, a'))) { e.preventDefault(); zoomed.value = true; return }
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
  <section class="flex-1 min-w-0 min-h-0 flex flex-col">
    <div class="shrink-0 px-6 py-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-[var(--line)]">
      <p class="sr-only" role="status">{{ finished && v ? `${verdict.lead}${verdict.em}` : '' }}</p>
      <h1 class="display selectable text-[26px] leading-tight font-medium text-balance">{{ verdict.lead }}<span v-if="verdict.em" :class="['italic', verdict.cls]">{{ verdict.em }}</span></h1>
      <!-- What to do next: hand a problem to Claude Code, or run it again. -->
      <div v-if="finished && r.change" class="flex gap-2 self-center">
        <button v-if="v && v.status !== 'pass' && r.status !== 'stopped'" class="btn-blue" title="Copy the report for Claude Code (⇧⌘C)" @click="copyReport">{{ copied ? 'Copied' : 'Copy for Claude Code' }}</button>
        <button class="btn" title="Run this test again (⌘R)" :disabled="!!state.setup?.running" @click="rerun()">Run again</button>
      </div>
      <p class="text-[var(--muted)] flex flex-wrap gap-x-1.5" :title="v?.usage">
        <template v-for="(m, i) in meta" :key="m.text"><span v-if="i" aria-hidden="true">·</span><span :class="m.cls">{{ m.text }}</span></template>
      </p>
      <!-- What this test was of, so you never have to recall it from the sidebar. -->
      <p v-if="tested" class="basis-full -mt-2 text-[12px] text-[var(--muted)] selectable truncate" :title="tested">{{ tested }}</p>
      <!-- While Tess works, Stop is right here, not only in the Test menu (⌘.). -->
      <button v-if="live && state.setup?.running" class="btn self-center min-[880px]:order-last" title="Stop this test (⌘.)" @click="stopTest()">Stop</button>
      <div v-if="live" class="w-full min-[880px]:w-[320px] min-[880px]:ms-auto self-center">
        <div class="flex h-2 rounded-full overflow-hidden bg-[var(--sand)]">
          <span v-for="(b, i) in bar" :key="i" :class="['transition-[width] duration-300 ease-out', i === 3 && 'pulse']" :style="{ width: b.width, background: b.color }" />
        </div>
        <p class="mt-1.5 text-[12px] text-[var(--muted)]">{{ pass }} passed<template v-if="fail"> · <b class="text-[var(--bad)]">{{ fail }} broke</b></template><template v-if="unk"> · <b class="text-[var(--warn)]">{{ unk }} can't check</b></template> · {{ todo }} to go</p>
      </div>
      <p v-if="r.change?.note" class="basis-full text-[12px] text-[var(--muted)]">Your note: <span class="text-[var(--ink)]">{{ r.change.note }}</span></p>
    </div>

    <div class="flex-1 min-h-0 flex flex-col overflow-y-auto min-[880px]:flex-row min-[880px]:overflow-visible">
      <main id="evidence" class="flex-1 min-w-0 p-4 flex flex-col gap-3" aria-label="What Tess saw">
        <div v-if="!noEvidence" :class="['relative rounded-2xl overflow-hidden surface flex flex-col', noEvidence ? 'shrink-0 h-28 bg-[var(--surface)]' : 'flex-1 min-h-[50vh] min-[880px]:min-h-0 bg-[var(--canvas)] text-zinc-900']">
          <div class="h-8 shrink-0 bg-[var(--sand)] border-b border-[var(--line)] flex items-center px-3 text-[12px] text-[var(--muted)] gap-2 min-w-0">
            <span v-if="live" class="size-1.5 rounded-full bg-rose-500 pulse shrink-0" />
            <span class="truncate">{{ screen.label }}</span>
            <!-- What Tess is doing right now, in the strip above the screen, never over the evidence. -->
            <span v-if="live && chips.length" class="ms-auto shrink-0 flex items-center gap-1 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[var(--ink)]"><ArrowPathIcon class="size-3.5 spin-slow" aria-hidden="true" />{{ chips.at(-1) }}</span>
            <span v-if="live && failing" class="shrink-0 flex items-center gap-1 rounded-full bg-[var(--bad)] text-white px-2 py-0.5"><XMarkIcon class="size-3.5" aria-hidden="true" />{{ failing.note || failing.name }}</span>
            <span v-if="asWho" class="shrink-0 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 text-[11px] font-medium">as {{ asWho }}</span>
          </div>
          <div class="relative flex-1 min-h-0">
            <!-- Evidence crossfades between checks; the live screen swaps in place so it never flickers. -->
            <Transition name="fade">
              <img
                v-if="screen.src" :key="live ? 'live' : screen.src" :src="screen.src" :alt="screen.alt" draggable="true"
                class="absolute inset-0 size-full object-contain object-top cursor-zoom-in" title="Click or press Space to enlarge"
                @click="zoomed = true" @contextmenu="evidenceMenu"
              >
              <p v-else key="empty" :class="['absolute inset-0 grid place-items-center px-6 text-center text-pretty', noEvidence ? 'text-[var(--muted)]' : 'text-zinc-500']">{{ screen.empty }}</p>
            </Transition>
          </div>
        </div>
        <!-- Tess speaks under the screen, never over the evidence. -->
        <div class="shrink-0 flex items-end gap-3">
          <div class="tess breathe size-11 rounded-full shrink-0 shadow-md" aria-hidden="true" />
          <!-- One stable live region (so screen readers hear each new line); only its content re-animates. -->
          <div class="flex-1 min-w-0 rounded-2xl rounded-es-sm bg-[var(--bubble)] text-[var(--bubble-fg)] px-5 py-3 shadow-sm max-w-3xl max-h-[28vh] overflow-y-auto" :style="{ boxShadow: bubbleEdge }" aria-live="polite">
            <div :key="bubble" class="rise">
              <p class="text-[12px] text-[var(--bubble-muted)] mb-0.5">{{ bubbleLabel }}</p>
              <p class="display selectable text-[16px] leading-relaxed max-w-[68ch] text-pretty">{{ bubble }}</p>
            </div>
          </div>
        </div>
      </main>

      <aside class="w-full border-t min-[880px]:w-72 min-[880px]:border-t-0 min-[880px]:border-s shrink-0 border-[var(--line)] flex flex-col min-h-0" aria-label="Checks and log">
        <div class="shrink-0 px-4 pt-3 flex gap-1 border-b border-[var(--line)]" role="tablist" aria-label="Checks or log" @keydown.left.right.stop.prevent="state.rail = state.rail === 'checks' ? 'log' : 'checks'; nextTick(() => document.getElementById(`tab-${state.rail}`)?.focus())">
          <button
            v-for="t in (['checks', 'log'] as const)" :id="`tab-${t}`" :key="t" role="tab" :aria-selected="state.rail === t" :aria-controls="`panel-${t}`" :tabindex="state.rail === t ? 0 : -1"
            :class="['px-2.5 py-1.5 -mb-px border-b-2', state.rail === t ? 'border-[var(--accent)] font-medium' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]']"
            @click="state.rail = t"
          >{{ t === 'checks' ? 'Checks' : 'Log' }}</button>
        </div>
        <div v-show="state.rail === 'checks'" id="panel-checks" ref="rail" role="tabpanel" aria-labelledby="tab-checks" class="flex-1 min-h-0 overflow-y-auto p-4">
          <h2 class="sr-only">Checks</h2>
          <p v-if="r.intro" class="pb-1 text-[13px] text-[var(--muted)] display italic">"{{ r.intro }}"</p>
          <p v-if="!plan.length" class="text-[var(--muted)]">{{ live ? 'Tess is working out what to check…' : 'No checklist for this test.' }}</p>
          <div v-for="g in groups" :key="g.gk" class="flex flex-col gap-0.5">
            <div class="pt-3 pb-1 flex items-baseline justify-between gap-2">
              <h3 v-if="g.title" class="font-semibold leading-snug">{{ g.title }}</h3><span v-else />
              <span class="shrink-0 text-[var(--muted)]">{{ r.status === 'stopped' ? 'not checked' : `${g.ok} of ${g.total} passed` }}</span>
            </div>
            <TransitionGroup name="list" tag="ul" class="flex flex-col"><CheckRow v-for="p in g.problems" :key="p.name" :item="p" :finished="finished" :shots="shotsFor(p.name).length" :details="flows.find((f) => f.name === p.name)" @pick="pick" /></TransitionGroup>
            <template v-for="f in g.fixes" :key="f.who?.key ?? '-'">
              <!-- A missing sign-in is fixed in Settings; anything else gets Tess's own reason and a retry. -->
              <button
                v-if="f.who" class="mt-1.5 mb-1 self-stretch flex items-start gap-2 text-start rounded-lg bg-[var(--surface)] ring-1 ring-[var(--line)] text-[var(--ink)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--page)]"
                @click="openSettings()"
              >
                <span class="flex-1 text-pretty">Sign in as {{ shortLabel(f.who.label) }} to check {{ f.n === 1 ? 'this' : `these ${f.n}` }}</span>
                <ArrowRightIcon class="size-4 shrink-0 mt-[3px] rtl:-scale-x-100" aria-hidden="true" />
              </button>
              <div v-else class="mt-1.5 mb-1 rounded-lg bg-[var(--surface)] ring-1 ring-[var(--line)] px-3 py-2 flex flex-col gap-1.5">
                <p class="font-medium">{{ f.n }} check{{ plural(f.n) }} couldn't run</p>
                <p v-if="blockerNote(g)" class="selectable text-[12px] text-[var(--muted)] text-pretty">{{ blockerNote(g) }}</p>
                <button class="btn self-start" :disabled="!!state.setup?.running" @click="rerun()">Run again</button>
              </div>
            </template>
            <template v-if="g.passed.length">
              <button class="mt-1 py-1 text-start text-[13px] text-[var(--muted)] hover:text-[var(--ink)] flex gap-2" :aria-expanded="g.open" @click="toggleFold(g.gk)"><ChevronDownIcon :class="['size-4 mt-0.5 transition-[rotate] duration-150', g.open && 'rotate-180']" aria-hidden="true" /> {{ g.passed.length }} passed</button>
              <Transition name="reveal"><TransitionGroup v-if="g.open" name="list" tag="ul" class="flex flex-col"><CheckRow v-for="p in g.passed" :key="p.name" :item="p" :finished="finished" :shots="shotsFor(p.name).length" :details="flows.find((f) => f.name === p.name)" @pick="pick" /></TransitionGroup></Transition>
            </template>
          </div>
          <ul v-if="finished && others.length" class="mt-3 flex flex-col"><CheckRow :item="{ name: OTHER, status: 'pass' }" :label="`Other screenshots (${others.length})`" :finished="finished" :shots="others.length" @pick="pick" /></ul>
        </div>
        <div v-show="state.rail === 'log'" id="panel-log" role="tabpanel" aria-labelledby="tab-log" class="selectable flex-1 min-h-0 overflow-y-auto bg-[var(--log)] text-[var(--log-fg)] p-4 mono text-[11px] leading-5">
          <h2 class="sr-only">Log</h2>
          <p v-for="(s, i) in r.steps" :key="i" :class="s.startsWith('say: ') ? 'text-[var(--log-say)] font-sans text-[13px] my-1' : 'text-[var(--log-fg)]/70 break-all'">{{ s.startsWith('say: ') ? `Tess  ${s.slice(5)}` : `·  ${s.slice(4)}` }}</p>
        </div>
      </aside>
    </div>
    <!-- Full-size evidence: Space or Esc closes, ← → still step through the check's screenshots. -->
    <Transition name="fade">
      <div v-if="zoomed && screen.src" ref="zoomBox" tabindex="-1" @keydown="zoomTab" class="fixed inset-0 z-50 outline-none bg-black/80 flex flex-col items-center justify-center gap-3 p-8" role="dialog" aria-modal="true" :aria-label="screen.alt" @click.self="zoomed = false">
        <img :src="screen.src" :alt="screen.alt" draggable="true" class="max-w-full min-h-0 flex-1 object-contain rounded-lg shadow-2xl cursor-zoom-out" @click="zoomed = false" @contextmenu="evidenceMenu">
        <p class="text-[12px] text-white/70">{{ screen.label }} · Space or Esc to close</p>
        <button class="sr-only" @click="zoomed = false">Close</button>
      </div>
    </Transition>
  </section>
</template>
