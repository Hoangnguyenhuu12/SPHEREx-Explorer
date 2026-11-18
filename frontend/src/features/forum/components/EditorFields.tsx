import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { LIMITS } from '../config'
import { checkLink, describeObservation } from '../links'
import type { TagWithCount } from '../types'
import { ObservationHint } from './bits'
import { useLanguage } from '../../../shared/i18n/language'
import { validationText } from '../translations'

export function FieldError({ id, message }: { id: string; message?: string }) {
  const { lang } = useLanguage()
  if (!message) return null
  return (
    <p id={id} className="field__error">
      <AlertCircle aria-hidden /> {validationText(message, lang)}
    </p>
  )
}

/** Topics come only from the admin-managed list (D04). Retired topics already on the post can be removed. */
export function TagPicker({
  tags,
  value,
  onToggle,
  error,
  disabled,
}: {
  tags: TagWithCount[]
  value: string[]
  /** Toggle one topic. The parent applies it to its latest state (no stale closures on fast clicks). */
  onToggle: (id: string) => void
  error?: string
  disabled?: boolean
}) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const id = useId()
  const full = value.length >= LIMITS.tagsMax
  const selectable = tags.filter((t) => t.active || value.includes(t.id))
  return (
    <fieldset className="field tag-picker" aria-describedby={`${id}-hint${error ? ` ${id}-err` : ''}`} disabled={disabled}>
      <legend className="field__label">{vi ? 'Chủ đề' : 'Topics'}</legend>
      <p id={`${id}-hint`} className="field__hint">
        {vi ? 'Chọn' : 'Choose'} {LIMITS.tagsMin}–{LIMITS.tagsMax}. {value.length > 0 && (vi ? `Đã chọn ${value.length}.` : `${value.length} selected.`)}
      </p>
      <ul className="chip-list" id={`${id}-list`} tabIndex={-1}>
        {selectable.map((t) => {
          const on = value.includes(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                className="chip"
                aria-pressed={on}
                disabled={!on && (full || !t.active)}
                onClick={() => onToggle(t.id)}
              >
                #{t.slug}
                {!t.active && <span className="tag-picker__retired"> {vi ? '(đã ngừng, hãy xóa)' : '(retired, remove)'}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <FieldError id={`${id}-err`} message={error} />
    </fieldset>
  )
}

export function LinkFields({
  links,
  onChange,
  errors,
  disabled,
}: {
  links: string[]
  onChange: (links: string[]) => void
  errors?: (string | undefined)[]
  disabled?: boolean
}) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const id = useId()
  const set = (i: number, v: string) => onChange(links.map((l, j) => (j === i ? v : l)))
  return (
    <fieldset className="field link-fields" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="field__label">{vi ? 'Liên kết (không bắt buộc)' : 'Links (optional)'}</legend>
      <p id={`${id}-hint`} className="field__hint">
        {vi ? 'Dán liên kết từ Đôi mắt để hiển thị quan sát, hoặc một liên kết https:// bất kỳ. Tối đa' : 'Paste a link copied from The Eyes to show the observation, or any https:// link. Up to'} {LIMITS.linksMax}.
      </p>
      {links.map((l, i) => {
        const err = errors?.[i]
        const check = l.trim() ? checkLink(l) : null
        const obs = check?.ok && check.kind === 'eyes' ? describeObservation(check.href) : null
        return (
          <div key={i} className="link-fields__row">
            <div className="link-fields__control">
              <label htmlFor={`${id}-${i}`} className="sr-only">
                {vi ? 'Liên kết' : 'Link'} {i + 1}
              </label>
              <input
                id={`${id}-${i}`}
                name={`link-${i + 1}`}
                autoComplete="off"
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://… or /the-eyes?q=barnard&det=6"
                value={l}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `${id}-${i}-err` : undefined}
                onChange={(e) => set(i, e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`${vi ? 'Xóa liên kết' : 'Remove link'} ${i + 1}`}
                onClick={() => onChange(links.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </button>
            </div>
            <FieldError id={`${id}-${i}-err`} message={err} />
            {obs && <ObservationHint href={obs.href} />}
          </div>
        )
      })}
      {links.length < LIMITS.linksMax && (
        <button type="button" className="btn btn-ghost btn-sm link-fields__add" onClick={() => onChange([...links, ''])}>
          <Plus aria-hidden /> {vi ? 'Thêm liên kết' : 'Add a link'}
        </button>
      )}
    </fieldset>
  )
}
