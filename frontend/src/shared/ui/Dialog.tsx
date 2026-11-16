import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { useModalDialog } from './useModalDialog'
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
 * Accessible modal dialog on the native <dialog> element (opened with showModal()):
 * the browser traps focus, makes the page inert, closes on Esc and returns focus to the opener.
 * A click on the backdrop also closes it.
 */
export function Dialog(props: DialogProps) {
  return props.open ? <ModalDialog {...props} /> : null
}

function ModalDialog({ title, description, onClose, children, actions, busy = false, initialFocusRef }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  const closedBy = useModalDialog(ref, onClose, {
    lightDismiss: true,
    busy,
    initialFocus: () =>
      initialFocusRef?.current ??
      ref.current?.querySelector<HTMLElement>(`.dialog__body ${FOCUSABLE}`) ??
      ref.current?.querySelector<HTMLElement>(FOCUSABLE),
  })

  return (
    <dialog
      ref={ref}
      className="dialog"
      {...({ closedby: closedBy } as Record<string, string>)}
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
    </dialog>
  )
}
