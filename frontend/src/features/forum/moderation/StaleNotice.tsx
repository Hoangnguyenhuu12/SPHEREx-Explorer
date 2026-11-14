import { RefreshCw } from 'lucide-react'
import { ForumError } from '../errors'

const STATE_TEXT: Record<string, string> = {
  approved: 'was already approved',
  rejected: 'was already declined',
  withdrawn: 'was withdrawn',
  hidden: 'is already hidden',
  visible: 'is already visible',
  published: 'is already visible',
  resolved: 'was already resolved',
  dismissed: 'was already dismissed',
}

/** AC07: a decision that lost the race explains what happened instead of overwriting it. */
export function StaleNotice({ error, onReload }: { error: ForumError; onReload: () => void }) {
  const state = error.details.state ?? ''
  const by = error.details.by
  return (
    <div className="notice notice--warn" role="alert">
      <RefreshCw aria-hidden />
      <div>
        <p>
          <strong>This changed while you were looking.</strong> It {STATE_TEXT[state] ?? 'has a new status'}
          {by ? ` by ${by}` : ''}. Nothing was overwritten.
        </p>
        <button type="button" className="btn btn-secondary btn-sm status-panel__actions" onClick={onReload}>
          Reload
        </button>
      </div>
    </div>
  )
}

// oxlint-disable-next-line react/only-export-components
export function isStale(err: unknown): err is ForumError {
  return err instanceof ForumError && err.code === 'CONFLICT' && err.details.reason === 'STALE_DECISION'
}
