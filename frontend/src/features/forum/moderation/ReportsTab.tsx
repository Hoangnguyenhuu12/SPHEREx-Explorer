import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { forumPostPath } from '../../../app/config'
import { Dialog } from '../../../shared/ui/Dialog'
import { forumApi, type HiddenItem, type ReportItem } from '../api'
import { ReasonText } from '../components/AuthorStatusPanel'
import { EmptyState, Skeleton, TimeAgo } from '../components/bits'
import { ErrorNotice } from '../components/ForumChrome'
import { ReasonDialog } from '../components/ReasonDialog'
import { plural } from '../format'
import { forumKeys } from '../queries'
import { isStale, StaleNotice } from './StaleNotice'
import { useRefreshAfterModeration } from './useModerationAction'

/** Reports are handled one by one; content never disappears just because it was reported (AC13). */
export function ReportsTab({ onDone }: { onDone: (message: string) => void }) {
  const reports = useQuery({ queryKey: forumKeys.reports, queryFn: () => forumApi.reports() })
  const hidden = useQuery({ queryKey: forumKeys.hidden, queryFn: () => forumApi.hiddenContent() })
  return (
    <div className="reports">
      <section aria-labelledby="open-reports">
        <h2 id="open-reports" className="master__title">
          Open reports <span className="caption">Oldest first. Reporters stay anonymous.</span>
        </h2>
        {reports.isPending ? (
          <Skeleton lines={4} />
        ) : reports.isError ? (
          <ErrorNotice error={reports.error} onRetry={() => reports.refetch()} />
        ) : reports.data.length === 0 ? (
          <EmptyState title="No open reports">Reports from members appear here.</EmptyState>
        ) : (
          <ul className="report-list">
            {reports.data.map((r) => (
              <ReportCard key={r.id} report={r} onDone={onDone} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="hidden-title" className="reports__hidden">
        <h2 id="hidden-title" className="master__title">
          Hidden content
        </h2>
        {hidden.isPending ? (
          <Skeleton lines={2} />
        ) : hidden.isError ? (
          <ErrorNotice error={hidden.error} onRetry={() => hidden.refetch()} />
        ) : hidden.data.length === 0 ? (
          <p className="caption">Nothing is hidden.</p>
        ) : (
          <ul className="report-list">
            {hidden.data.map((h) => (
              <HiddenCard key={`${h.targetType}-${h.targetId}`} item={h} onDone={onDone} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ReportCard({ report: r, onDone }: { report: ReportItem; onDone: (m: string) => void }) {
  const refresh = useRefreshAfterModeration()
  const [hiding, setHiding] = useState(false)
  const close = useMutation({
    mutationFn: (outcome: 'resolved' | 'dismissed') => forumApi.resolveReport(r.id, outcome),
    onSuccess: (_, outcome) => {
      refresh(r.postId)
      onDone(outcome === 'dismissed' ? 'Report dismissed. The content stays visible.' : 'Report marked as handled.')
    },
  })
  const stale = isStale(close.error) ? close.error : null
  return (
    <li className="report">
      <div className="report__head">
        <span className="kind">{r.targetType === 'post' ? 'Post' : 'Comment'}</span>
        <Link to={r.targetType === 'comment' ? `${forumPostPath(r.postId)}#comment-${r.targetId}` : forumPostPath(r.postId)}>{r.postTitle}</Link>
        <TimeAgo iso={r.createdAt} />
        {r.openCount > 1 && <span className="status status--warn">{plural(r.openCount, 'open report')}</span>}
        {r.targetHidden && <span className="status status--danger">Already hidden</span>}
      </div>
      <blockquote className="report__quote">
        <p>{r.targetExcerpt}</p>
        <footer className="caption">by {r.targetAuthor.displayName}</footer>
      </blockquote>
      <p className="report__reason">
        Reported as <ReasonText reason={r.reason} />
      </p>
      {stale && <StaleNotice error={stale} onReload={() => refresh(r.postId)} />}
      {close.isError && !stale && <ErrorNotice error={close.error} />}
      <div className="report__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => close.mutate('dismissed')} disabled={close.isPending}>
          Dismiss
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => close.mutate('resolved')} disabled={close.isPending}>
          Mark handled
        </button>
        {!r.targetHidden && (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setHiding(true)} disabled={close.isPending}>
            Hide {r.targetType}…
          </button>
        )}
      </div>
      <ReasonDialog
        open={hiding}
        title={r.targetType === 'post' ? 'Hide this post' : 'Hide this comment'}
        description="Readers will no longer see it anywhere. The author is told the reason. You can restore it later."
        confirmLabel="Hide"
        tone="danger"
        onClose={() => setHiding(false)}
        onSubmit={async (reason) => {
          await forumApi.hide({ type: r.targetType, id: r.targetId }, reason)
          refresh(r.postId)
          onDone(r.targetType === 'post' ? 'Post hidden.' : 'Comment hidden.')
        }}
      />
    </li>
  )
}

function HiddenCard({ item: h, onDone }: { item: HiddenItem; onDone: (m: string) => void }) {
  const refresh = useRefreshAfterModeration()
  const [confirm, setConfirm] = useState(false)
  const restore = useMutation({
    mutationFn: () => forumApi.restore({ type: h.targetType, id: h.targetId }),
    onSuccess: () => {
      setConfirm(false)
      refresh(h.postId)
      onDone(h.targetType === 'post' ? 'Post restored. Readers can see it again.' : 'Comment restored.')
    },
    onError: () => setConfirm(false),
  })
  return (
    <li className="report report--hidden">
      <div className="report__head">
        <span className="kind">{h.targetType === 'post' ? 'Post' : 'Comment'}</span>
        <Link to={forumPostPath(h.postId)}>{h.title}</Link>
        <TimeAgo iso={h.hiddenAt} prefix="Hidden" />
      </div>
      <blockquote className="report__quote">
        <p>{h.excerpt}</p>
      </blockquote>
      <p className="report__reason">
        Reason: <ReasonText reason={h.reason} />
      </p>
      {restore.isError && <ErrorNotice error={restore.error} />}
      <div className="report__actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>
          Restore…
        </button>
      </div>
      <Dialog
        open={confirm}
        title={h.targetType === 'post' ? 'Restore this post?' : 'Restore this comment?'}
        description="It becomes visible to everyone again."
        onClose={() => setConfirm(false)}
        busy={restore.isPending}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={restore.isPending}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => restore.mutate()} disabled={restore.isPending}>
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </button>
          </>
        }
      />
    </li>
  )
}
