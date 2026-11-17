import { AlertCircle, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PATHS } from '../../../app/config'
import { AuthActions } from '../../../shared/layout/Shell'
import { loginPath } from '../../auth/returnTo'
import { useSession } from '../../auth/session'
import { describeForumError } from '../errors'

/** Header actions on Forum pages: Write a post + account. */
export function ForumHeaderActions({ showWrite = true }: { showWrite?: boolean }) {
  const { user } = useSession()
  return (
    <>
      {showWrite && (
        <Link to={user ? PATHS.forumNew : loginPath(PATHS.forumNew)} className="btn btn-primary forum-write">
          <PenLine aria-hidden />
          <span className="forum-write__label">Write a post</span>
        </Link>
      )}
      <AuthActions compact />
    </>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const copy = describeForumError(error)
  return (
    <div className="notice notice--error forum-notice" role="alert">
      <AlertCircle aria-hidden />
      <div>
        <p>
          <strong>{copy.title}.</strong> {copy.body}
        </p>
        {copy.retry && onRetry && (
          <button type="button" className="btn btn-secondary btn-sm forum-notice__action" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Full-page message: post not found, no access. */
export function ForumMessage({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="wrap forum-message">
      <h1>{title}</h1>
      <p>{children}</p>
      <div className="forum-message__actions">
        {action ?? (
          <Link className="btn btn-primary" to={PATHS.forum}>
            Back to the Forum
          </Link>
        )}
      </div>
    </section>
  )
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? (
        <Link className="btn btn-secondary btn-sm" to={hrefFor(page - 1)} rel="prev">
          <ChevronLeft aria-hidden /> Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="pager__status num">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link className="btn btn-secondary btn-sm" to={hrefFor(page + 1)} rel="next">
          Older <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
