import { markRaw, h, type Component } from 'vue'
import { PhCheckCircle, PhXCircle, PhCircleDashed, PhArrowClockwise, PhCircle, PhStopCircle, PhMinusCircle } from '@phosphor-icons/vue'

// A Phosphor icon at a fixed weight, used like any icon component.
const ph = (c: Component, weight: 'regular' | 'fill' | 'bold' = 'regular') => markRaw({ inheritAttrs: true, render() { return h(c as any, { weight }) } }) as Component

export type Status = 'pass' | 'fail' | 'unverified' | 'running' | 'pending' | 'stopped' | 'notrun'

// One Phosphor icon per result (DESIGN.md: the only coloured icons); render with <component :is="statusOf(s).icon" class="size-4" />.
export const STATUS: Record<string, { icon: Component, cls: string, word: string }> = {
  pass: { icon: ph(PhCheckCircle), cls: 'text-[var(--ok)]', word: 'passed' },
  fail: { icon: ph(PhXCircle, 'fill'), cls: 'text-[var(--bad)]', word: 'broke' },
  unverified: { icon: ph(PhCircleDashed), cls: 'text-[var(--faint)]', word: "couldn't run" },
  running: { icon: ph(PhArrowClockwise), cls: 'text-[var(--ink)] spin-slow', word: 'testing now' },
  pending: { icon: ph(PhCircle), cls: 'text-[var(--line-strong)]', word: 'to go' },
  stopped: { icon: ph(PhStopCircle), cls: 'text-[var(--muted)]', word: 'stopped' },
  notrun: { icon: ph(PhMinusCircle), cls: 'text-[var(--faint)]', word: 'not checked' },
}
export const statusOf = (s?: string) => STATUS[s ?? ''] ?? STATUS.pending!

export const started = (id: string) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'))
export const when = (id: string) => {
  const d = new Date(started(id))
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
export const short = (t?: string) => (t || 'Test')
  .replace(/^\(not committed yet\)$/, 'My changes')
  .replace(/^[0-9a-f]{7,} /, '')
  .replace(/^Release origin\/(\w+)\.\.HEAD.*/, 'Release to $1')
  .slice(0, 40)

export const TARGETS = [
  { kind: 'changes', label: 'My changes', hint: 'everything not committed' },
  { kind: 'commit', label: 'Last commit', hint: 'your latest commit' },
  { kind: 'range', target: 'origin/prd..HEAD', label: 'Release to prd', hint: 'everything going to prd' },
  { kind: 'range', target: 'origin/main..HEAD', label: 'Release to main', hint: 'everything going to main' },
] as const
export type Target = { kind: string, target?: string, label?: string, hint?: string, replayFrom?: string }

// Release choices only for branches the repo actually has (no origin/prd, no "Release to prd").
export const targetsFor = (remotes: string[] = []) =>
  TARGETS.filter((t) => t.kind !== 'range' || remotes.includes(t.target.split('..')[0]!))

// Raw tester actions as short human chips: "opened /customers", "clicked Save".
export function chipText(step: string) {
  const m = step.match(/^do: browser (\w+)\s*(.*)$/)
  if (!m) return null
  const [, verb, rest = ''] = m
  const what = rest.replace(/^https?:\/\/[^/]+/, '') || 'the page'
  const map: Record<string, string> = {
    navigate: `opened ${what}`, click: `clicked ${rest}`, type: `typed in ${rest}`, take_screenshot: 'took a screenshot',
    select_option: `chose ${rest}`, press_key: `pressed ${rest}`, resize: 'resized the window', wait_for: 'waited for the page',
  }
  return map[verb!] ?? null
}

export const shortLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, '')
export const plural = (n: number) => (n === 1 ? '' : 's')

// When Tess tests: what each choice does and what it changes, only on this Mac. Used by onboarding and Settings.
export const TRIGGERS = [
  { mode: 'stop', title: 'When Claude Code finishes a task', hint: "If something broke, Tess tells Claude Code what she saw and it fixes it. Claude Code waits for her each time, usually 3 to 10 minutes, and she'll send it back at most 3 times.", file: "Adds a setting to this project on your Mac only. Nothing gets shared or committed." },
  { mode: 'commit', title: 'After every commit', hint: "Tess tests in the background and the result shows up here. You don't have to wait for it.", file: "Adds a setting to this project on your Mac only. Nothing gets shared or committed." },
  { mode: 'manual', title: 'Only when I ask', hint: 'Press New test, ⌘N or ⌘K whenever you want one.', file: 'Turns off any automatic testing Ultimate Tester set up.' },
] as const

// A finished test in a few words, from its counts: "1 of 3 broke", "4 of 5 passed, 1 couldn't run", "3 passed".
export function outcome(r: { status: string, counts?: { pass: number, fail: number, unk: number } }) {
  if (r.status === 'running') return 'Testing now'
  if (r.status === 'stopped') return 'Stopped'
  const c = r.counts
  const total = c ? c.pass + c.fail + c.unk : 0
  if (!c || !total) return statusOf(r.status).word.replace(/^./, (x) => x.toUpperCase())
  if (c.fail) return `${c.fail} of ${total} broke`
  if (c.unk) return `${c.pass} of ${total} passed, ${c.unk} couldn't run`
  return `${c.pass} passed`
}
