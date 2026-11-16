import { markRaw, type Component } from 'vue'
import { ArrowPathIcon, CheckCircleIcon, ClockIcon, MinusCircleIcon, QuestionMarkCircleIcon, StopCircleIcon, XCircleIcon } from '@heroicons/vue/20/solid'

export type Status = 'pass' | 'fail' | 'unverified' | 'running' | 'pending' | 'stopped' | 'notrun'

// One Heroicon per result; render with <component :is="statusOf(s).icon" class="size-4" />.
export const STATUS: Record<string, { icon: Component, cls: string, word: string }> = {
  pass: { icon: markRaw(CheckCircleIcon), cls: 'text-[var(--ok)]', word: 'passed' },
  fail: { icon: markRaw(XCircleIcon), cls: 'text-[var(--bad)]', word: 'broke' },
  unverified: { icon: markRaw(QuestionMarkCircleIcon), cls: 'text-[var(--warn)]', word: "can't check" },
  running: { icon: markRaw(ArrowPathIcon), cls: 'text-[var(--ink)] spin-slow', word: 'testing now' },
  pending: { icon: markRaw(ClockIcon), cls: 'text-[var(--muted)]', word: 'to go' },
  stopped: { icon: markRaw(StopCircleIcon), cls: 'text-[var(--muted)]', word: 'stopped' },
  notrun: { icon: markRaw(MinusCircleIcon), cls: 'text-[var(--muted)]', word: 'not checked' },
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
  { kind: 'commit', label: 'Last commit', hint: 'HEAD' },
  { kind: 'range', target: 'origin/prd..HEAD', label: 'Release to prd', hint: 'everything going to prd' },
  { kind: 'range', target: 'origin/main..HEAD', label: 'Release to main', hint: 'everything going to main' },
] as const
export type Target = { kind: string, target?: string, label?: string, hint?: string }

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
