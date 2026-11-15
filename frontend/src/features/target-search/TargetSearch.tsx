import { Search, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { TARGETS, type TargetKey } from '../../shared/config/targets'
import { looksLikeCoordinates, parseCoordinates } from './coordinates'
import './search.css'

interface Props {
  value: string
  selectedKey: TargetKey | null
  busy?: boolean
  onSubmit: (q: string) => void
  onPreset: (key: TargetKey) => void
}

export function TargetSearch({ value, selectedKey, busy, onSubmit, onPreset }: Props) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const errId = useId()
  const focusInput = () => document.getElementById('target-search')?.focus()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = draft.trim()
    if (!q) {
      setError('Type a star name or coordinates.')
      focusInput()
      return
    }
    if (looksLikeCoordinates(q)) {
      const r = parseCoordinates(q)
      if (!r.ok) {
        setError(r.error)
        focusInput()
        return
      }
    }
    setError(null)
    onSubmit(q)
  }

  return (
    <div className="search" data-tour="targets">
      <form className="search__form" role="search" onSubmit={submit} noValidate>
        <label htmlFor="target-search" className="sr-only">
          Search a star name or RA/Dec
        </label>
        <div className={`search__field${error ? ' has-error' : ''}`}>
          <Search aria-hidden className="search__icon" />
          <input
            id="target-search"
            className="input search__input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            name="q"
            placeholder="Star name or RA/Dec, e.g. 269.452 +4.693…"
            value={draft}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
          />
          {draft && (
            <button type="button" className="icon-btn icon-btn--sm search__clear" aria-label="Clear search" onClick={() => setDraft('')}>
              <X aria-hidden />
            </button>
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Go
        </button>
        {error && (
          <p id={errId} className="search__error" role="alert">
            {error}
          </p>
        )}
      </form>
      <ul className="presets" aria-label="Featured targets">
        {TARGETS.map((t) => (
          <li key={t.key}>
            <button type="button" className="preset" aria-pressed={selectedKey === t.key} title={`${t.name} — ${t.kind}`} onClick={() => onPreset(t.key)}>
              {t.shortName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
