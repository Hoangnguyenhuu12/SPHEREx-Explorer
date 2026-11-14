import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './ui.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  /** Buttons row. Put the primary action last. */
  actions?: ReactNode
  /** Block closing (Esc, backdrop, ✕) while a request is running. */
  busy?: boolean
  /** Element to focus first; defaults to the first focusable element in the body. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * Accessible modal dialog: focus moves in, Tab is trapped, Esc closes, focus returns to the opener,
 * the page behind does not scroll.
 */
export function Dialog({ open, title, description, onClose, children, actions, busy = false, initialFocusRef }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first =
      initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(`.dialog__body ${FOCUSABLE}`) ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!busyRef.current) closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
      >
        <div className="dialog__head">
          <div>
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            {description && (
              <div id={descId} className="dialog__desc">
                {description}
              </div>
            )}
          </div>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Close" onClick={onClose} disabled={busy}>
            <X aria-hidden />
          </button>
        </div>
        {children && <div className="dialog__body">{children}</div>}
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
