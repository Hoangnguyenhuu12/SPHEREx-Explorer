import { AlertCircle } from 'lucide-react'
import { useCallback, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Dialog } from '../../shared/ui/Dialog'
import { useSession } from './session'

export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 30

export function validateDisplayName(raw: string): string | undefined {
  const name = raw.trim()
  if (name.length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters.`
  if (name.length > DISPLAY_NAME_MAX) return `Use at most ${DISPLAY_NAME_MAX} characters.`
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) return 'Use letters, numbers, spaces, dots, dashes or underscores.'
  if (name.includes('@')) return 'Do not use your email address.'
  return undefined
}

/**
 * Ask for a public name once, before the first post or comment. Forum never shows email addresses.
 * Returns `ensure(action)` and the dialog element to render.
 */
export function useEnsureDisplayName(): { ensure: (action: () => void) => void; dialog: ReactNode } {
  const { user, setDisplayName } = useSession()
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const ensure = useCallback(
    (action: () => void) => {
      if (user?.displayName) action()
      else setPending(() => action)
    },
    [user?.displayName],
  )

  const close = () => {
    setPending(null)
    setError(undefined)
  }

  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const message = validateDisplayName(value)
    setError(message)
    if (message) {
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      // Live mode saves the name on the server (PATCH /me) before the post or comment goes out.
      await setDisplayName(value)
    } catch {
      setError('Could not save your name. Try again.')
      inputRef.current?.focus()
      return
    } finally {
      setSaving(false)
    }
    const action = pending
    close()
    action?.()
  }

  const dialog = (
    <Dialog
      open={pending !== null}
      title="Choose a display name"
      description="Other people see this name on your posts and comments. Your email stays private."
      onClose={close}
      initialFocusRef={inputRef}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} className="field" onSubmit={(e) => void save(e)} noValidate>
        <label htmlFor={`${id}-name`} className="field__label">
          Display name
        </label>
        <input
          ref={inputRef}
          id={`${id}-name`}
          name="display-name"
          className="input"
          value={value}
          maxLength={DISPLAY_NAME_MAX + 10}
          autoComplete="nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : `${id}-hint`}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(validateDisplayName(e.target.value))
          }}
        />
        {error ? (
          <p id={`${id}-err`} className="field__error">
            <AlertCircle aria-hidden /> {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className="field__hint">
            {DISPLAY_NAME_MIN}–{DISPLAY_NAME_MAX} characters.
          </p>
        )}
      </form>
    </Dialog>
  )

  return { ensure, dialog }
}
