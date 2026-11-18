// The app's own confirm and text prompt (never the browser's): one sheet at a time, answered with a promise.
type Ask = { title: string, message?: string, okLabel: string, danger?: boolean, input?: { placeholder?: string } }
export const asking = reactive<{ open: Ask | null, value: string, resolve: ((v: string | null) => void) | null }>({ open: null, value: '', resolve: null })

function open(a: Ask) {
  asking.resolve?.(null)
  asking.open = a
  asking.value = ''
  return new Promise<string | null>((resolve) => { asking.resolve = resolve })
}
// true when confirmed.
export const askConfirm = async (a: Omit<Ask, 'input'>) => (await open(a)) !== null
// The typed text, or null when cancelled.
export const askText = (a: Ask) => open({ ...a, input: a.input ?? {} })
export function answer(ok: boolean) {
  const r = asking.resolve
  const v = asking.value.trim()
  Object.assign(asking, { open: null, resolve: null })
  r?.(ok ? v : null)
}
