import { AlertCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { LIMITS, REASONS, type ReasonCode } from '../config'
import { describeForumError } from '../errors'
import { charCount, validateReason } from '../validation'
import type { ModerationReason } from '../types'

interface ReasonDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  /** Visual weight of the confirm button. */
  tone?: 'primary' | 'danger'
  noteLabel?: string
  onClose: () => void
  onSubmit: (reason: ModerationReason) => Promise<void>
}

/** One dialog for Report, Reject and Hide: pick a reason, optionally explain (required for "Other"). */
export function ReasonDialog({ open, title, description, confirmLabel, tone = 'primary', noteLabel = 'Details (optional)', onClose, onSubmit }: ReasonDialogProps) {
  const id = useId()
  const [code, setCode] = useState<ReasonCode | null>(null)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ code?: string; note?: string }>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<unknown>(null)

  const reset = () => {
    setCode(null)
    setNote('')
    setErrors({})
    setServerError(null)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateReason({ code: code ?? undefined, note })
    setErrors(found)
    if (found.code || found.note) {
      document.getElementById(found.code ? `${id}-r-${REASONS[0].code}` : `${id}-note`)?.focus()
      return
    }
    setBusy(true)
    setServerError(null)
    try {
      await onSubmit({ code: code!, note })
      setBusy(false)
      reset()
      onClose()
    } catch (err) {
      setBusy(false)
      setServerError(err)
    }
  }

  const n = charCount(note.trim())
  const copy = serverError ? describeForumError(serverError) : null

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={close}
      busy={busy}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Sending…' : confirmLabel}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} className="reason-form" onSubmit={submit} noValidate>
        {copy && (
          <div className="notice notice--error" role="alert">
            <AlertCircle aria-hidden />
            <span>
              <strong>{copy.title}.</strong> {copy.body}
            </span>
          </div>
        )}
        <fieldset className="reason-form__set" aria-describedby={errors.code ? `${id}-code-err` : undefined}>
          <legend className="field__label">Reason</legend>
          {REASONS.map((r) => (
            <label key={r.code} className="radio">
              <input
                id={`${id}-r-${r.code}`}
                type="radio"
                name={`${id}-reason`}
                value={r.code}
                checked={code === r.code}
                onChange={() => {
                  setCode(r.code)
                  setErrors((e) => ({ ...e, code: undefined }))
                }}
              />
              <span>{r.label}</span>
            </label>
          ))}
          {errors.code && (
            <p id={`${id}-code-err`} className="field__error">
              <AlertCircle aria-hidden /> {errors.code}
            </p>
          )}
        </fieldset>
        <div className="field">
          <div className="field__row">
            <label htmlFor={`${id}-note`} className="field__label">
              {code === 'other' ? 'Explain the reason' : noteLabel}
            </label>
            <span className={`field__count${n > LIMITS.reasonNoteMax ? ' field__count--over' : ''}`}>
              {n}/{LIMITS.reasonNoteMax}
            </span>
          </div>
          <textarea
            id={`${id}-note`}
            name="reason-note"
            autoComplete="off"
            className="textarea reason-form__note"
            value={note}
            rows={3}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? `${id}-note-err` : undefined}
            onChange={(e) => {
              setNote(e.target.value)
              if (errors.note) setErrors((x) => ({ ...x, note: validateReason({ code: code ?? undefined, note: e.target.value }).note }))
            }}
          />
          {errors.note && (
            <p id={`${id}-note-err`} className="field__error">
              <AlertCircle aria-hidden /> {errors.note}
            </p>
          )}
        </div>
      </form>
    </Dialog>
  )
}
