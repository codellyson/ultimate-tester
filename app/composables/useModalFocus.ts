// A dialog that blocks the window keeps keyboard focus inside while open and gives it back on close.
export function useModalFocus(open: () => boolean, box: Ref<HTMLElement | undefined>) {
  let opener: HTMLElement | null = null
  const focusables = () => [...(box.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])') ?? [])]
  watch(open, (isOpen) => nextTick(() => {
    if (isOpen) {
      opener = document.activeElement as HTMLElement | null
      if (!box.value?.contains(document.activeElement)) (focusables()[0] ?? box.value)?.focus()
    } else if (opener?.isConnected) opener.focus()
  }))
  // Tab and Shift-Tab wrap around inside the dialog.
  function onTab(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const items = focusables()
    if (!items.length) { e.preventDefault(); return }
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1)
    e.preventDefault()
    items[next]!.focus()
  }
  return { onTab }
}
