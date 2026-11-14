import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { forumPostPath } from '../../../app/config'
import { forumApi, type QueueItem } from '../api'
import { EmptyState, Skeleton, StatusBadge, TimeAgo } from '../components/bits'
import { ErrorNotice } from '../components/ForumChrome'
import { ReasonDialog } from '../components/ReasonDialog'
import { forumKeys } from '../queries'
import { RevisionDiff, SubmissionPreview } from './RevisionDiff'
import { isStale, StaleNotice } from './StaleNotice'
import { useRefreshAfterModeration } from './useModerationAction'

interface QueueTabProps {
  selected: string | null
  onSelect: (revisionId: string | null) => void
  onDone: (message: string) => void
}

export function QueueTab({ selected, onSelect, onDone }: QueueTabProps) {
  const queue = useQuery({ queryKey: forumKeys.queue, queryFn: () => forumApi.queue() })
  const items = queue.data ?? []
  const current = selected ?? items[0]?.revisionId ?? null

  return (
    <div className={`master-detail${selected ? ' has-selection' : ''}`}>
      <section className="master" aria-labelledby="queue-title">
        <h2 id="queue-title" className="master__title">
          Waiting for review <span className="caption">Oldest first</span>
        </h2>
        {queue.isPending ? (
          <Skeleton lines={4} />
        ) : queue.isError ? (
          <ErrorNotice error={queue.error} onRetry={() => queue.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="Queue is clear">New posts and edits appear here when members send them for review.</EmptyState>
        ) : (
          <ul className="master__list">
            {items.map((q) => (
              <li key={q.revisionId}>
                <button type="button" className="master__item" aria-current={q.revisionId === current ? 'true' : undefined} onClick={() => onSelect(q.revisionId)}>
                  <span className="master__item-title">{q.title || 'Untitled'}</span>
                  <span className="master__item-meta">
                    <span className={`kind kind--${q.kind}`}>{q.kind === 'edit' ? 'Edit' : 'First post'}</span>
                    <span>{q.author.displayName}</span>
                    <TimeAgo iso={q.submittedAt} />
                    {q.inactiveTags.length > 0 && <span className="status status--warn">Retired topic</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="detail" aria-label="Review">
        {current ? (
          <Review key={current} revisionId={current} queue={items} onBack={() => onSelect(null)} onSelect={onSelect} onDone={onDone} />
        ) : (
          queue.isSuccess && <p className="detail__empty caption">Choose a submission to review.</p>
        )}
      </section>
    </div>
  )
}

function Review({
  revisionId,
  queue,
  onBack,
  onSelect,
  onDone,
}: {
  revisionId: string
  queue: QueueItem[]
  onBack: () => void
  onSelect: (id: string | null) => void
  onDone: (message: string) => void
}) {
  const sub = useQuery({ queryKey: forumKeys.submission(revisionId), queryFn: () => forumApi.getSubmission(revisionId), gcTime: 0 })
  const refresh = useRefreshAfterModeration()
  const [rejecting, setRejecting] = useState(false)
  const headRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headRef.current?.focus({ preventScroll: true })
  }, [revisionId])

  const next = () => {
    const i = queue.findIndex((q) => q.revisionId === revisionId)
    const following = queue[i + 1] ?? queue[i - 1]
    onSelect(following && following.revisionId !== revisionId ? following.revisionId : null)
  }

  const approve = useMutation({
    mutationFn: () => forumApi.approve(revisionId),
    onSuccess: () => {
      refresh(sub.data?.post.id)
      onDone(sub.data?.published ? 'Edit approved. The new version is public.' : 'Approved. The post is now public.')
      next()
    },
  })

  const reload = () => {
    approve.reset()
    refresh()
    sub.refetch()
  }

  if (sub.isPending) return <Skeleton lines={6} />
  if (sub.isError) return <ErrorNotice error={sub.error} onRetry={() => sub.refetch()} />

  const { revision, post, published } = sub.data
  const isEdit = Boolean(published)
  const inactive = revision.tags.filter((t) => !t.active)
  const decided = revision.state !== 'pending'
  const stale = isStale(approve.error) ? approve.error : null

  return (
    <article className="review" aria-labelledby="review-title">
      <button type="button" className="back-link review__back" onClick={onBack}>
        <ChevronLeft aria-hidden /> All submissions
      </button>
      <header className="review__head">
        <p className="review__kind">{isEdit ? 'Edit to a published post' : 'First post'}</p>
        <h2 id="review-title" ref={headRef} tabIndex={-1} className="review__title">
          {revision.title || 'Untitled'}
        </h2>
        <p className="review__meta">
          <span>{post.author.displayName}</span>
          {revision.submittedAt && <TimeAgo iso={revision.submittedAt} prefix="Sent" />}
          <span>Revision {revision.number}</span>
          {isEdit && (
            <Link to={forumPostPath(post.id)} target="_blank" rel="noopener">
              Open public post <ExternalLink aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          )}
        </p>
      </header>

      {post.visibility === 'hidden' && (
        <div className="notice notice--warn">
          <AlertTriangle aria-hidden />
          <p>
            <strong>This post is hidden.</strong> Approving the edit updates its text but does not make it visible again. Use Restore in Reports for that.
          </p>
        </div>
      )}
      {inactive.length > 0 && (
        <div className="notice notice--warn">
          <AlertTriangle aria-hidden />
          <p>
            <strong>Uses a retired topic</strong> ({inactive.map((t) => `#${t.slug}`).join(', ')}). It cannot be approved as it is. Decline with “Needs more context” and ask the author to pick another
            topic.
          </p>
        </div>
      )}
      {decided && <StatusBadge kind={revision.state} />}
      {stale && <StaleNotice error={stale} onReload={reload} />}
      {approve.isError && !stale && <ErrorNotice error={approve.error} />}

      <div className="review__body">{isEdit ? <RevisionDiff before={published!} after={revision} /> : <SubmissionPreview revision={revision} />}</div>

      <div className="review__bar">
        <p className="caption">Deciding on revision {revision.number} exactly as shown.</p>
        <button type="button" className="btn btn-danger" onClick={() => setRejecting(true)} disabled={decided || Boolean(stale) || approve.isPending}>
          Decline…
        </button>
        <button type="button" className="btn btn-primary" onClick={() => approve.mutate()} disabled={decided || Boolean(stale) || approve.isPending || inactive.length > 0}>
          {approve.isPending ? 'Approving…' : isEdit ? 'Approve edit' : 'Approve and publish'}
        </button>
      </div>

      <ReasonDialog
        open={rejecting}
        title={isEdit ? 'Decline this edit' : 'Decline this post'}
        description="The author sees the reason and can change the post and send it again. Other readers see nothing."
        confirmLabel="Decline"
        tone="danger"
        noteLabel="Message to the author (optional)"
        onClose={() => setRejecting(false)}
        onSubmit={async (reason) => {
          try {
            await forumApi.reject(revisionId, reason)
          } catch (err) {
            if (isStale(err)) {
              setRejecting(false)
              refresh()
              sub.refetch()
            }
            throw err
          }
          refresh(post.id)
          onDone(isEdit ? 'Edit declined. The published version is unchanged.' : 'Declined. The author can see your reason.')
          next()
        }}
      />
    </article>
  )
}
