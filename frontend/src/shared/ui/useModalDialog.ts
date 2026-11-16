import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

interface Options {
  /** Click on the backdrop closes the dialog (`closedby="any"`). */
  lightDismiss?: boolean
  /** While true, Esc and backdrop clicks do not close it. */
  busy?: boolean
  /** Element to focus after opening; otherwise the browser focuses the first focusable element. */
  initialFocus?: () => HTMLElement | null | undefined
}

const hasClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype

/**
 * Opens a native <dialog> as a modal while it is mounted. The browser provides the top layer,
 * the inert page, focus containment, Esc / back-gesture dismissal and focus return.
 * `onClose` runs only when the user dismissed the dialog (Esc, backdrop, form method="dialog").
 */
export function useModalDialog(ref: RefObject<HTMLDialogElement | null>, onClose: () => void, opts: Options = {}) {
  const { lightDismiss = false, busy = false, initialFocus } = opts
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const focusRef = useRef(initialFocus)
  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
    focusRef.current = initialFocus
  })

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal()
    focusRef.current?.()?.focus()

    // `close` is dispatched asynchronously: a late event from an earlier close() (for example a
    // remount) can arrive after the dialog was reopened. Only a dialog that is really closed counts.
    const onCloseEvent = () => {
      if (!dialog.open) closeRef.current()
    }
    // Esc / close requests: refuse while a request is running.
    const onCancel = (e: Event) => {
      if (busyRef.current) e.preventDefault()
    }
    // Keep Esc inside: page-level shortcuts and open menus behind the dialog must not react too.
    // (stopPropagation does not block the browser's own close request.)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation()
    }
    dialog.addEventListener('close', onCloseEvent)
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('keydown', onKey)

    // Light dismiss where `closedby` is missing (Safari): press and release both outside the box.
    let pressedOutside = false
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    const onDown = (e: PointerEvent) => {
      pressedOutside = outside(e)
    }
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && outside(e) && !busyRef.current) dialog.close()
    }
    const fallback = lightDismiss && !hasClosedBy
    if (fallback) {
      dialog.addEventListener('pointerdown', onDown)
      dialog.addEventListener('pointerup', onUp)
    }

    return () => {
      dialog.removeEventListener('close', onCloseEvent)
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('keydown', onKey)
      if (fallback) {
        dialog.removeEventListener('pointerdown', onDown)
        dialog.removeEventListener('pointerup', onUp)
      }
      // Closed by the parent: close quietly (the listener is gone) so focus returns to the opener.
      if (dialog.open) dialog.close()
    }
  }, [ref, lightDismiss])

  /** `closedby` value to spread on the <dialog>. */
  return busy ? 'none' : lightDismiss ? 'any' : 'closerequest'
}
