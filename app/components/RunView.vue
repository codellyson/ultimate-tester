<script setup lang="ts">
import { PhArrowClockwise, PhArrowRight, PhCopy, PhGlobeSimple, PhStop, PhXCircle, PhCircleDashed, PhSpeakerHigh, PhSpeakerSlash } from '@phosphor-icons/vue'
// A test: the verdict first, then what Tess saw (driven by the selected check), Tess's words, and the checks.
import type { PlanItem, Persona, Req } from '~/composables/useTester'
const { state, openSettings, rerun, stopTest, startTest, tauri } = useTester()
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
const isSetup = computed(() => r.value.change?.kind === 'setup')
const finished = computed(() => !live.value)
const count = (st: string) => plan.value.filter((p) => p.status === st).length
const pass = computed(() => count('pass'))
const fail = computed(() => count('fail'))
const unk = computed(() => count('unverified'))
const known = computed(() => count('known'))
const todo = computed(() => plan.value.length - pass.value - fail.value - unk.value - known.value - count('notrun'))

// Which persona a "can't check" is waiting on: its own, or one named in Tess's note ("needs Store owner with B2B").
function blockedBy(p: PlanItem): Persona | null {
  const ps = state.setup?.personas ?? []
  const text = `${p.note ?? ''} ${flows.value.find((f) => f.name === p.name)?.actual ?? ''}`.toLowerCase()
  return ps.find((x) => x.signIn && !x.savedAt && (x.key === p.persona || text.includes(x.key) || text.includes(x.label.toLowerCase())))
    ?? ps.find((x) => x.signIn && !x.savedAt && /\b(403|b2b)\b/.test(text) && /b2b/.test(`${x.key} ${x.label}`.toLowerCase()))
    ?? null
}
const blockers = computed(() => [...new Set(plan.value.filter((p) => p.status === 'unverified').map(blockedBy).filter(Boolean))] as Persona[])

// "Set this up": checks that couldn't run because something they need doesn't exist yet, grouped by what's missing.
const missing = computed(() => {
  if (!finished.value || isSetup.value) return []
  const by = new Map<string, { need: string, person: boolean, checks: string[] }>()
  for (const f of flows.value) {
    if (f.status !== 'unverified' || !f.needs) continue
    const m = by.get(f.needs) ?? { need: f.needs, person: f.setupBy === 'person', checks: [] }
    m.checks.push(f.name)
    by.set(f.needs, m)
  }
  return [...by.values()]
})
const blockedChecks = computed(() => missing.value.reduce((a, m) => a + m.checks.length, 0))
function setUp() { startTest({ kind: 'setup', target: r.value.id }) }
// After a setup run: the same test as before, told which checks to look at again.
function recheck() {
  const s = r.value.change?.source
  if (!s) return
  state.note = [`Re-check after setup: ${s.checks.join('; ')}`, s.note].filter(Boolean).join('. ')
  startTest({ kind: s.kind, target: s.target ?? undefined })
}
// The result as counts, never a judgement: what passed, what broke, what didn't run. Colour still says which.
const verdict = computed(() => {
  const n = (x: number, w: string) => `${x} ${w}${plural(x)}`
  const total = plan.value.length || pass.value + fail.value + unk.value
  // A setup run creates test data; its items are "set up" or "need you", not passed or broken.
  if (isSetup.value && v.value) return unk.value
    ? { lead: `${pass.value} of ${n(total, 'item')} set up.`, em: ` ${unk.value} ${unk.value === 1 ? 'needs' : 'need'} you.`, cls: 'text-[var(--warn)]' }
    : { lead: `${n(pass.value, 'item')} set up.`, em: '', cls: 'text-[var(--ok)]' }
  // The engine found the test setup broken before Tess began: nothing is known about the change.
  if (v.value?.setup === 'broken') return { lead: 'Setup broken.', em: ' Nothing was tested.', cls: 'text-[var(--warn)]' }
  // Stopped comes first: a stopped test is not a result, whatever was checked before it.
  if (r.value.status === 'stopped') return v.value?.summary === 'You stopped this test.'
    ? { lead: 'You stopped this test.', em: '', cls: '' }
    : { lead: 'This test stopped before the end.', em: '', cls: '' }
  // Green only when nothing is left unchecked, whatever the stored status says.
  if (v.value?.status === 'pass' && !unk.value) {
    const note = /\bnot checked\b|couldn't check|didn't check/i.test(v.value.summary ?? '')
    const before = known.value ? ` ${known.value} ${known.value === 1 ? 'was' : 'were'} already broken before this change.` : ''
    return { lead: `${n(pass.value, 'check')} passed.`, em: before || (note ? ' Tess lists something she didn\'t check.' : ''), cls: note || before ? 'text-[var(--warn)]' : 'text-[var(--ok)]' }
  }
  if (v.value?.status === 'fail' || (!v.value && fail.value)) return { lead: `${fail.value} of ${n(total, 'check')} broke.`, em: '', cls: 'text-[var(--bad)]' }
  // Tess never got evidence from the app and no missing sign-in explains it.
  if (v.value && !fail.value && !pass.value && unk.value && !blockers.value.length && !r.value.shots.length) {
    return { lead: 'No checks ran.', em: ' Tess couldn\'t reach the app.', cls: 'text-[var(--warn)]' }
  }
  // Every unrun check is waiting on a sign-in you can add: say which.
  const allBlockedBySignIn = plan.value.filter((p) => p.status === 'unverified').every((p) => !!blockedBy(p))
  if (v.value && pass.value && !fail.value && allBlockedBySignIn) {
    const need = `${unk.value === 1 ? 'needs' : 'need'} ${blockers.value.map((b) => `a ${shortLabel(b.label).replace(/^(a|an) /i, '')}`).join(' and ')}`
    return { lead: `${pass.value} of ${n(total, 'check')} passed.`, em: ` ${unk.value} ${need}.`, cls: 'text-[var(--warn)]' }
  }
  if (v.value) return { lead: `${pass.value} of ${n(total, 'check')} passed.`, em: ` ${unk.value || 'Some'} couldn't run.`, cls: 'text-[var(--warn)]' }
  return { lead: total ? `${pass.value + fail.value + unk.value} of ${n(total, 'check')} done.` : 'Starting.', em: '', cls: '' }
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
// The run's two questions, answered by the engine from its checks: did the change do its job, did it break anything.
const answerRows = computed(() => v.value?.answer ? [{ label: 'Your change', ...v.value.answer.change }, { label: 'Broke anything', ...v.value.answer.broke }] : null)
// Tess got no evidence and nothing broke: the environment, not the code, is the likely problem.
const retryFirst = computed(() => r.value.status === 'stopped' || (!!v.value && !fail.value && !r.value.shots.length))
async function copyReport() {
  if (!v.value) { state.flash = "This test isn't finished, so there's no report to copy yet."; return }
  const app = state.apps.find((a) => a.id === state.appId)
  const dir = app ? `${app.root}/.ultimate-tester/runs/${r.value.id}` : ''
  const lines = [`Ultimate Tester: ${verdict.value.lead}${verdict.value.em}`.trim(), tested.value, ...(answerRows.value ?? []).map((a) => `${a.label}: ${a.text}`), '', v.value.summary]
  for (const f of flows.value.filter((x) => x.status !== 'pass')) {
    lines.push('', `${statusOf(f.status).word.toUpperCase()}: ${f.name}`)
    if (f.steps?.length) lines.push(...f.steps.map((s, i) => `  ${i + 1}. ${s}`))
    if (f.expected) lines.push(`  Expected: ${f.expected}`)
    if (f.actual) lines.push(`  Actual: ${f.actual}`)
    if (f.tried) lines.push(`  Another way in: ${f.tried}`)
    for (const e of f.evidence ?? []) lines.push(`  Evidence: ${e.startsWith('/') || !dir ? e : `${dir}/${e.split('/').at(-1)}`}`)
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n').trim() + '\n')
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { state.flash = "Couldn't copy the report." }
}
watch(() => state.copyTick, () => copyReport())

// DESIGN.md header: a status pill, a meta line, the change's title as the heading.
const pill = computed(() => {
  if (live.value) return { kind: 'live', text: `${isSetup.value ? 'Setting up' : 'Testing'} · ${plan.value.length - todo.value} of ${plan.value.length || '…'}` }
  if (r.value.status === 'stopped') return { kind: 'stopped', text: 'Stopped' }
  if (isSetup.value && v.value) return unk.value ? { kind: 'unk', text: `${unk.value} need${unk.value === 1 ? 's' : ''} you · ${pass.value} set up` } : { kind: 'done', text: `${pass.value} set up` }
  if (v.value?.setup === 'broken') return { kind: 'unk', text: 'Setup broken' }
  if (fail.value) return { kind: 'fail', text: `${fail.value} broke · ${pass.value} passed` }
  if (unk.value) return { kind: 'unk', text: `${unk.value} couldn't run · ${pass.value} passed` }
  if (known.value) return { kind: 'unk', text: `${pass.value} passed · ${known.value} already broken` }
  if (v.value) return { kind: 'done', text: `${pass.value} of ${plan.value.length || pass.value} passed` }
  return { kind: 'live', text: 'Starting' }
})
const title = computed(() => {
  const c = r.value.change
  const first = c?.message.split('\n')[0] ?? ''
  if (!c || c.kind === 'changes' || first.startsWith('(not committed')) return isSetup.value ? 'Making test data' : "Changes you haven't committed"
  return first.replace(/^[0-9a-f]{7,40} /, '')
})
// With linked backends: each check's app as a tag, and the apps with their branches under the title.
const linkedApps = computed(() => ((r.value.apps?.length ?? 0) > 1 ? r.value.apps! : null))
const appTag = (p: PlanItem) => {
  if (!linkedApps.value) return undefined
  const app = p.app ?? flows.value.find((f) => f.name === p.name)?.app ?? 'app'
  return app === 'app' ? linkedApps.value[0]!.name : app
}
const appLine = (a: NonNullable<typeof linkedApps.value>[number]) => a.source === 'dev' ? 'dev backend' : a.source === 'missing' ? 'not available' : [a.branch, a.commit && `@ ${a.commit}`, a.dirty && '(uncommitted)'].filter(Boolean).join(' ')
const metaLine = computed(() => {
  const c = r.value.change
  const hash = c?.message.match(/^([0-9a-f]{7,40}) /)?.[1]?.slice(0, 7)
  const files = c?.files?.length ? `${c.files.length} file${plural(c.files.length)}` : ''
  const mins = v.value ? `${Math.round((v.value.durationMs ?? 0) / 60000) || '<1'} min` : ''
  // How much Tess was needed: checks replayed from saved steps (free) and checks she did this time.
  const flows = v.value?.flows ?? []
  const rep = flows.filter((f) => f.replayed).length
  const split = rep ? `${rep} replayed${flows.length - rep ? `, ${flows.length - rep} by Tess` : ', no Claude call'}` : ''
  return [hash, files, mins, split, when(r.value.id)].filter(Boolean).join(' · ')
})

const now = ref(Date.now())
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
const selFlow = computed(() => flows.value.find((f) => f.name === state.sel.check))
const selItem = computed(() => plan.value.find((p) => p.name === state.sel.check))
// What Tess saw, in her words: her note on the check, else what she reported seeing.
const saw = computed(() => selItem.value?.note || selFlow.value?.actual || '')
// Evidence that isn't a screenshot.
const textEvidence = computed(() => (finished.value ? (selFlow.value?.evidence ?? []).filter((e) => !/\.(png|jpe?g|webp|gif)$/i.test(e.trim())).map((raw) => ({ raw })) : []))
// Requests behind the selected check, as Tess recorded them.
const reqs = computed<Req[]>(() => (finished.value ? selFlow.value?.requests ?? [] : []))
// Evidence lines that aren't screenshots (command output, log lines), shown as they are.
const rawEvidence = computed(() => (reqs.value.length ? [] : textEvidence.value))
const reqProof = computed(() => reqs.value.some((r) => r.expected))
const apiBase = computed(() => state.setup?.start?.url?.match(/^https?:\/\/[^/]+/)?.[0] ?? null)
// The selected check's result in words, and for one that didn't run, who I'd need to sign in as.
const selStatus = computed(() => (finished.value && selItem.value ? statusOf(selItem.value.status) : null))
const selBlocker = computed(() => (selItem.value?.status === 'unverified' ? blockedBy(selItem.value) : null))
const liveTick = ref(0)
const screen = computed(() => {
  if (finished.value && r.value.shots.length) {
    const shot = mine.value[Math.min(state.sel.shot, mine.value.length - 1)]
    return shot
      ? { src: shotUrl(shot), file: shot, alt: `Evidence for: ${what.value}`, label: `Evidence · ${what.value}${mine.value.length > 1 ? ` · ${state.sel.shot + 1} of ${mine.value.length} (← →)` : ''}` }
      : { src: null, empty: (textEvidence.value.length || selFlow.value?.requests?.length) ? '' : selItem.value?.status === 'unverified' ? "This check didn't run, so there's no screenshot." : "I didn't take a screenshot for this one.", label: `Evidence · ${what.value}` }
  }
  // A browser that never left about:blank is not evidence of anything.
  if (r.value.live && r.value.live.url !== 'about:blank') return { src: `/api/apps/${state.appId}/shots/${r.value.id}/live.jpg?t=${liveTick.value}`, alt: 'Your app, live, as I test it', label: `${live.value ? 'Live' : 'Last screen'} · ${r.value.live.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` }
  return { src: null, empty: live.value ? (isSetup.value ? "I'm starting your app. You'll see it here once it's open." : /^- Browser:\s*not needed/im.test(state.setup?.profile ?? '') ? "I'm testing this one by sending it requests. What I send and get back shows on each check." : "I'm reading what you changed. You'll see your app here once I open it.") : (r.value.status === 'stopped' ? 'The test stopped before I took a screenshot.' : r.value.live ? "I couldn't reach your app, so there's nothing to show. My note on the checks says why." : (textEvidence.value.length || selFlow.value?.requests?.length) ? '' : "There's no screenshot for this test."), label: live.value ? '' : 'No screen' }
})

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
// Voice readout: each new line Tess says while testing, then her summary once the test ends.
const voice = useVoice()
watch(() => says.value.length, (n, was) => { if (live.value && n > (was ?? n)) voice.say(says.value.at(-1)!) })
watch(() => [r.value.id, r.value.status] as const, ([id, st], old) => {
  if (old && id === old[0] && old[1] === 'running' && st !== 'running' && v.value?.summary) voice.say(bubble.value, { interrupt: true })
})
onBeforeUnmount(() => voice.stop())
// Turning it on reads what's on screen now: her latest line while testing, her summary once done.
async function toggleVoice() {
  await voice.set(!voice.on.value)
  if (voice.on.value) voice.say(bubble.value, { interrupt: true })
}
// The headline is the verdict; the bubble is Tess explaining it. A verdict phrase opening her summary is
// dropped, so the two can never disagree ("4 checks still need a look" above, "Safe to push." below).
const VERDICT_LEAD = /^\s*(safe to push|don['’]t push yet|not safe yet|can['’]t say yet)[^.!?:]*[.!?:]\s*/i
// A stopped test explains how far Tess got, rather than replaying whatever she said last.
const stoppedNote = computed(() => {
  const done = plan.value.filter((p) => ['pass', 'fail', 'known', 'unverified'].includes(p.status)).length
  const last = says.value.at(-1)
  return `You stopped me ${done ? `after ${done} of ${plan.value.length} checks` : 'before I checked anything'}.${last ? ` I was at: “${last}”` : ''}`
})
const bubble = computed(() => (r.value.status === 'stopped' ? stoppedNote.value : v.value ? v.value.summary.replace(VERDICT_LEAD, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase()) || v.value.summary : says.value.at(-1) ?? (isSetup.value ? 'Starting your app…' : 'Reading what you changed…')))
// The summary shows two lines until you ask for more.
const sumOpen = ref(false)
const sumEl = ref<HTMLElement>()
const sumLong = ref(false)
const measure = () => { const el = sumEl.value; if (el && !sumOpen.value) sumLong.value = el.scrollHeight > el.clientHeight + 1 }
watch(bubble, () => { sumOpen.value = false; nextTick(measure) })
onMounted(() => nextTick(measure))

// Checks, by who Tess tested as: problems first with their one fix, passes folded.
const label = (k: string) => state.setup?.personas.find((x) => x.key === k)?.label ?? k
// Grouped as Tess planned them: what the change touches, then what must never break.
const SOURCES: Record<string, string> = { diff: 'What you changed', 'must-never-break': 'Must never break' }
const groups = computed(() => [...new Set(plan.value.map((p) => p.source ?? ''))].sort((a, b) => (a === 'diff' ? -1 : b === 'diff' ? 1 : 0)).map((k) => {
  const all = plan.value.filter((p) => (p.source ?? '') === k).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3))
  const byWho = new Map<Persona | null, number>()
  for (const p of all.filter((x) => x.status === 'unverified')) { const w = blockedBy(p); byWho.set(w, (byWho.get(w) ?? 0) + 1) }
  const passed = all.filter((p) => p.status === 'pass')
  const gk = `${r.value.id}:${k}`
  const open = state.unfolded.has(gk) || (finished.value && passed.some((p) => p.name === state.sel.check)) || (!byWho.size && !all.some((x) => x.status === 'fail'))
  return { k, gk, title: SOURCES[k] ?? (k ? label(k) : ''), problems: all.filter((p) => p.status !== 'pass'), passed, open, fixes: [...byWho].map(([who, n]) => ({ who, n })), ok: passed.length, total: all.length }
}))
// Why checks couldn't run when no sign-in is to blame: Tess's own note on the first one.
const blockerNote = (g: { problems: PlanItem[] }) => {
  const p = g.problems.find((x) => x.status === 'unverified' && !blockedBy(x))
  return p ? (p.note || flows.value.find((f) => f.name === p.name)?.actual || '') : ''
}
const pick = (name: string) => { state.sel = { id: r.value.id, check: name, shot: 0 } }
// Nothing ran and the browser never reached the app: Tess couldn't start it. Say why and what to do, up front.
const startFail = computed(() => {
  const all = plan.value
  if (!finished.value || r.value.status === 'stopped' || r.value.shots.length || !all.length || all.some((p) => p.status !== 'unverified')) return null
  if (r.value.live && r.value.live.url !== 'about:blank') return null
  const noteOf = (p: PlanItem) => p.note || flows.value.find((f) => f.name === p.name)?.actual || ''
  const why = noteOf(all.find((p) => !blockedBy(p) && noteOf(p)) ?? all[0]!) || v.value?.summary || ''
  const fix = /\block\b|already (running|in use)|EADDRINUSE|port \d* ?(is )?in use|PID \d+/i.test(why)
    ? "Your own copy of the app is running from this folder, and I couldn't start mine beside it. Stop yours for a moment (or the terminal running it), then test again."
    : /not found|ENOENT|command not found|missing|cannot find/i.test(why)
      ? 'Something your app needs to start is missing. Check how I start it in Settings, then test again.'
      : 'Start your app yourself once to see the error, or check how I start it in Settings, then test again.'
  return { why, fix }
})

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
    <header class="shrink-0 px-7 pt-7 pb-6 border-b border-[var(--line)] flex flex-wrap items-start gap-x-8 gap-y-4">
      <div class="flex-1 min-w-[320px]">
        <p class="sr-only" role="status">{{ finished && v ? `${verdict.lead}${verdict.em}` : '' }}</p>
        <div class="flex items-center gap-2.5 text-[12.5px] text-[var(--muted)] tabular-nums">
          <span :class="['pill', { 'bg-[var(--ink)] text-[var(--page)]': pill.kind === 'done' || pill.kind === 'fail', 'ring-1 ring-inset ring-[var(--line-strong)] text-[var(--ink)]': pill.kind === 'live' || pill.kind === 'unk', 'bg-[var(--code)] text-[var(--muted)]': pill.kind === 'stopped' }]">
            <span v-if="pill.kind === 'live'" class="tess size-3 rounded-full breathe" aria-hidden="true" />
            <PhXCircle v-else-if="pill.kind === 'fail'" weight="fill" class="size-[13px] text-[#ff8a80]" aria-hidden="true" />
            <PhCircleDashed v-else-if="pill.kind === 'unk'" class="size-[13px] text-[var(--faint)]" aria-hidden="true" />
            {{ pill.text }}
          </span>
          <span class="selectable truncate" :title="v?.usage">{{ metaLine }}</span>
        </div>
        <h1 class="selectable mt-3 font-[family-name:var(--font-serif)] text-[28px] leading-[1.15] font-semibold tracking-[-0.015em] text-balance">{{ title }}</h1>
        <p v-if="linkedApps" class="selectable mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--muted)]">
          <span v-for="a in linkedApps" :key="a.name" :title="a.why ?? undefined"><b class="font-medium text-[var(--ink)]">{{ a.name }}</b> · {{ appLine(a) }}</span>
        </p>
        <!-- The two answers first (counted by the engine), then Tess's account of how she got them. -->
        <dl v-if="finished && answerRows" class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 max-w-[46em] text-[14px] leading-[1.5]">
          <template v-for="row in answerRows" :key="row.label">
            <dt class="flex items-center gap-2 font-medium whitespace-nowrap"><component :is="statusOf(row.status).icon" :class="[statusOf(row.status).cls, 'size-4 shrink-0']" aria-hidden="true" />{{ row.label }}</dt>
            <dd class="selectable text-[var(--text-2)] text-pretty">{{ row.text }}</dd>
          </template>
        </dl>
        <!-- Tess, in her own words: the summary when she's done, her latest line while she works. -->
        <!-- Two lines of Tess by default, so the header stays calm; More shows the rest. -->
        <div class="mt-5 max-w-[46em] flex gap-3" aria-live="polite">
          <span :class="['tess size-[22px] rounded-full shrink-0 mt-0.5', live && 'breathe']" aria-hidden="true" />
          <div class="min-w-0">
            <p :key="bubble" ref="sumEl" :class="['selectable rise text-[15px] leading-[1.6] text-[var(--text-2)] text-pretty', !sumOpen && 'line-clamp-2']"><span class="sr-only">Tess: </span>{{ bubble }}</p>
            <button v-if="sumLong" class="mt-1 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--ink)]" :aria-expanded="sumOpen" @click="sumOpen = !sumOpen">{{ sumOpen ? 'Less' : 'More' }}</button>
            <p v-if="r.change?.note" class="mt-1.5 text-[12.5px] text-[var(--muted)]">Your note: <span class="text-[var(--ink)]">{{ r.change.note }}</span></p>
          </div>
        </div>
      </div>
      <div class="flex gap-2 shrink-0 pt-px">
        <span v-if="voice.unavailable.value" class="self-center max-w-56 text-[12px] leading-tight text-[var(--muted)] text-end" role="status">{{ voice.unavailable.value }}</span>
        <button
          v-if="voice.supported" class="btn size-8 px-0 justify-center" :aria-pressed="voice.on.value"
          :title="voice.on.value ? 'Stop reading Tess aloud' : 'Read Tess aloud'" :aria-label="voice.on.value ? 'Stop reading Tess aloud' : 'Read Tess aloud'"
          @click="toggleVoice"
        ><component :is="voice.on.value ? PhSpeakerHigh : PhSpeakerSlash" class="size-4" aria-hidden="true" /></button>
        <button v-if="live && state.setup?.running" class="btn" title="Stop this test (⌘.)" @click="stopTest()"><PhStop class="size-4" aria-hidden="true" />Stop</button>
        <template v-if="finished && r.change">
          <button class="btn-blue" title="Run this test again (⌘R)" :disabled="!!state.setup?.running" @click="rerun()"><PhArrowClockwise class="size-4" aria-hidden="true" />{{ isSetup ? 'Set up again' : 'Test again' }}</button>
          <button v-if="isSetup && v && pass && r.change?.source" class="btn" :disabled="!!state.setup?.running" @click="recheck">Run the checks again</button>
          <button v-if="!isSetup && v" class="btn" title="Copy a report you can paste into Claude Code (⇧⌘C)" @click="copyReport"><PhCopy class="size-4" aria-hidden="true" />{{ copied ? 'Copied' : 'Copy report' }}</button>
          <span class="sr-only" role="status">{{ copied ? 'Report copied' : '' }}</span>
        </template>
      </div>
    </header>
    <!-- Checks that couldn't run for lack of test data: Tess can create it, or it needs a person. -->
    <div v-if="missing.length" class="shrink-0 mx-7 mt-5 rounded-2xl surface px-5 py-4 flex flex-wrap items-start gap-x-6 gap-y-3">
      <div class="flex-1 min-w-[260px]">
        <h2 class="font-medium">I couldn't run {{ blockedChecks === 1 ? 'one check' : `${blockedChecks} checks` }} because some test data is missing</h2>
        <ul class="mt-1.5 flex flex-col gap-1 text-[13px]">
          <li v-for="m in missing" :key="m.need" class="selectable">{{ m.need }}<span class="text-[var(--muted)]"> · {{ m.person ? "you'll need to set this up" : 'I can make this' }} · for {{ m.checks.length === 1 ? m.checks[0] : `${m.checks.length} checks` }}</span></li>
        </ul>
      </div>
      <button v-if="missing.some((m) => !m.person)" class="btn-blue shrink-0" :disabled="!!state.setup?.running" title="Tess creates what's missing through the app, then you can run the checks again" @click="setUp">Make it for me</button>
    </div>

    <div class="flex-1 min-h-0 flex flex-col overflow-y-auto min-[880px]:flex-row min-[880px]:overflow-hidden">
      <aside class="w-full min-[880px]:w-[400px] shrink-0 border-b min-[880px]:border-b-0 min-[880px]:border-e border-[var(--line)] flex flex-col min-h-0" aria-label="Checks and log">
        <div v-show="state.rail === 'checks'" id="panel-checks" ref="rail" class="flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-6">
          <h2 class="sr-only">Checks</h2>
          <p v-if="!plan.length" class="pt-4 text-[var(--muted)]">{{ live ? (isSetup ? 'Working out what test data to make…' : 'Deciding what to check…') : 'This test has no checks.' }}</p>
          <div v-for="g in groups" :key="g.gk">
            <h3 v-if="g.title" class="mt-5 mb-1 px-2.5 text-[12px] text-[var(--faint)]">{{ g.title }}</h3>
            <TransitionGroup name="list" tag="ul" class="flex flex-col gap-2"><CheckRow v-for="p in [...g.problems, ...g.passed]" :key="p.name" :item="p" :finished="finished" :shots="shotsFor(p.name).length" :details="flows.find((f) => f.name === p.name)" :tag="appTag(p)" @pick="pick" /></TransitionGroup>
            <template v-for="f in g.fixes" :key="f.who?.key ?? '-'">
              <!-- A missing sign-in is fixed in Settings. -->
              <button v-if="f.who && !startFail" class="mt-2 w-full flex items-center gap-2 text-start rounded-[10px] surface px-3 py-2.5 text-[13px] font-medium hover:bg-[var(--row-hover)]" @click="openSettings()">
                <span class="flex-1 text-pretty">Sign in as {{ shortLabel(f.who.label) }} so I can check {{ f.n === 1 ? 'this' : `these ${f.n}` }}</span>
                <PhArrowRight class="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              </button>
              <p v-else-if="blockerNote(g)" class="mt-2 px-2.5 selectable text-[12.5px] text-[var(--muted)] text-pretty">{{ blockerNote(g) }}</p>
            </template>
          </div>
          <ul v-if="finished && others.length" class="mt-5 flex flex-col gap-2"><CheckRow :item="{ name: OTHER, status: 'pass' }" :label="`Other screenshots (${others.length})`" :finished="finished" :shots="others.length" @pick="pick" /></ul>
          <button v-if="r.steps.length" class="mt-5 ms-1 btn-plain h-7 text-[12.5px] text-[var(--muted)]" @click="state.rail = 'log'">See every step</button>
        </div>
        <div v-show="state.rail === 'log'" id="panel-log" class="selectable flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-6 text-[12px] leading-5">
          <button class="mb-2 -ms-1 btn-plain h-7 text-[12.5px] text-[var(--muted)]" @click="state.rail = 'checks'">Back to checks</button>
          <h2 class="sr-only">Log</h2>
          <p v-for="(s, i) in r.steps" :key="i" :class="s.startsWith('say: ') ? 'text-[var(--ink)] text-[13px] my-1.5' : 'text-[var(--muted)] break-all'">{{ s.startsWith('say: ') ? s.slice(5) : `·  ${s.slice(4)}` }}</p>
        </div>
      </aside>

      <main id="evidence" class="flex-1 min-w-0 min-h-0 overflow-y-auto px-7 py-5 flex flex-col gap-3" aria-label="What Tess saw">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-[family-name:var(--font-serif)] text-[20px] leading-tight font-semibold">{{ live ? 'Live' : startFail ? "I couldn't start your app" : (state.sel.check ? what : 'Evidence') }}</h2>
          <span v-if="live && r.live && r.live.url !== 'about:blank'" class="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)] truncate"><PhGlobeSimple class="size-4 shrink-0" aria-hidden="true" />{{ r.live.url.replace(/^https?:\/\/[^/]+/, '') || '/' }}</span>
          <span v-else-if="!live && selFlow?.url && screen.src" class="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)] truncate selectable"><PhGlobeSimple class="size-4 shrink-0" aria-hidden="true" />{{ selFlow.url }}</span>
        </div>
        <p v-if="selStatus && !startFail" class="-mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--muted)]"><component :is="selStatus.icon" :class="['size-4', selStatus.cls]" aria-hidden="true" />{{ selStatus.word.charAt(0).toUpperCase() + selStatus.word.slice(1) }}</p>
        <p v-if="live && (chips.length || asWho)" class="flex flex-wrap gap-2 text-[12.5px] text-[var(--muted)]">
          <span v-if="chips.length" class="flex items-center gap-1.5"><PhArrowClockwise class="size-3.5 spin-slow" aria-hidden="true" />{{ chips.at(-1) }}</span>
          <span v-if="asWho">as {{ asWho }}</span>
          <span v-if="failing" class="flex items-center gap-1.5 text-[var(--ink)]"><PhXCircle weight="fill" class="size-3.5 text-[var(--bad)]" aria-hidden="true" />{{ failing.note || failing.name }}</span>
        </p>
        <div v-if="startFail" class="rounded-2xl surface px-6 py-5 flex flex-col gap-3">
          <p class="flex items-start gap-3 text-[15px] leading-[1.55]"><span class="tess size-[22px] rounded-full shrink-0 mt-0.5" aria-hidden="true" /><span><span class="block text-[12.5px] text-[var(--muted)]">What happened</span><span class="selectable">{{ startFail.why }}</span></span></p>
          <p class="ms-[34px] text-[15px] leading-[1.55]"><span class="block text-[12.5px] text-[var(--muted)]">What to do</span>{{ startFail.fix }}</p>
          <p class="ms-[34px] text-[12.5px] text-[var(--muted)]">None of the checks ran, so they say nothing about your change yet.</p>
          <div class="ms-[34px] flex gap-2">
            <button class="btn-blue" :disabled="!!state.setup?.running" @click="rerun()"><PhArrowClockwise class="size-4" aria-hidden="true" />Test again</button>
            <button class="btn" @click="openSettings()">How I start it</button>
          </div>
        </div>
        <!-- The screenshot as a card: the whole page, lifted; crossfades between checks. -->
        <Transition v-else name="fade" mode="out-in">
          <figure v-if="screen.src" :key="live ? 'live' : screen.src" class="m-0 rounded-2xl overflow-hidden lifted bg-[var(--surface)] shrink-0">
            <img :src="screen.src" :alt="screen.alt" draggable="true" class="block w-full h-auto cursor-zoom-in" title="Click or press Space to enlarge" @click="zoomed = true" @contextmenu="evidenceMenu">
          </figure>
          <!-- No screenshot, but requests: they are the evidence, shown in the screenshot's place. -->
          <ApiEvidence v-else-if="!live && reqs.length && !startFail" key="requests" :reqs="reqs" :note="reqProof ? saw : ''" :base="apiBase" />
          <div v-else-if="!live && rawEvidence.length && !startFail" key="raw" class="rounded-2xl lifted bg-[var(--surface)] overflow-hidden divide-y divide-[var(--line)] shrink-0 selectable">
            <pre v-for="(e, i) in rawEvidence" :key="i" class="m-0 px-5 py-4 font-[inherit] text-[13px] leading-[1.55] whitespace-pre-wrap break-words text-[var(--text-2)]">{{ e.raw }}</pre>
          </div>
          <p v-else-if="screen.empty" key="empty" class="rounded-2xl surface px-6 py-10 text-center text-[var(--muted)] text-pretty">{{ screen.empty }}</p>
        </Transition>
        <p v-if="!live && mine.length > 1" class="text-[12.5px] text-[var(--muted)] tabular-nums">Screenshot {{ state.sel.shot + 1 }} of {{ mine.length }} · ← →</p>
        <div v-if="!live && selBlocker && !startFail" class="flex items-center gap-3 rounded-2xl surface px-4 py-3">
          <p class="flex-1 text-[14px] leading-[1.55]">I need to sign in as <b class="font-semibold">{{ selBlocker.label.split(/[;,(]| who | that /)[0]!.trim() }}</b> before I can check this.</p>
          <button class="btn-blue shrink-0" @click="openSettings()">Sign in</button>
        </div>
        <p v-else-if="!live && saw && !startFail && !reqProof" class="selectable text-[14px] leading-[1.55] text-[var(--text-2)] text-pretty"><b class="font-semibold text-[var(--ink)]">{{ selItem?.status === 'unverified' ? "Why it didn't run:" : 'What I saw:' }}</b> {{ saw }}</p>
        <p v-if="!live && selFlow?.tried" class="selectable text-[14px] leading-[1.55] text-[var(--text-2)] text-pretty"><b class="font-semibold text-[var(--ink)]">Another way in:</b> {{ selFlow.tried }}</p>
        <template v-if="!live && selFlow && selFlow.status !== 'pass'">
          <p v-if="selFlow.causeWhy" class="selectable text-[14px] leading-[1.55] text-[var(--text-2)] text-pretty"><b class="font-semibold text-[var(--ink)]">Before this change:</b> {{ selFlow.causeWhy }}</p>
          <p v-if="selFlow.expected && !reqProof" class="selectable text-[13px] text-[var(--muted)]">Expected: {{ selFlow.expected }}</p>
        </template>
      </main>
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
