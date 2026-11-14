import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, PencilLine } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { forumEditPath, forumPostPath, PATHS } from '../../app/config'
import { RequireAuth } from '../../features/auth/RequireAuth'
import { forumApi } from '../../features/forum/api'
import { ReasonText, WithdrawButton } from '../../features/forum/components/AuthorStatusPanel'
import { EmptyState, Skeleton, StatusBadge, TimeAgo } from '../../features/forum/components/bits'
import { ErrorNotice, ForumHeaderActions } from '../../features/forum/components/ForumChrome'
import { plural } from '../../features/forum/format'
import { forumKeys, useMyPosts, useNotifications } from '../../features/forum/queries'
import type { ForumNotification, MyPostGroup, MyPostSummary } from '../../features/forum/types'
import '../../features/forum/forum.css'
import { PageShell } from '../../shared/layout/Shell'
import { useDocumentTitle } from './useDocumentTitle'

const GROUPS: { key: MyPostGroup; title: string; empty: string }[] = [
  { key: 'action', title: 'Needs your action', empty: 'Nothing needs your attention.' },
  { key: 'review', title: 'In review', empty: 'Nothing is waiting for a moderator.' },
  { key: 'draft', title: 'Drafts', empty: 'No drafts.' },
  { key: 'published', title: 'Published', empty: 'Nothing published yet.' },
]

export default function MyPostsPage() {
  useDocumentTitle('My posts')
  return (
    <RequireAuth>
      <PageShell headerActions={<ForumHeaderActions />}>
        <MyPosts />
      </PageShell>
    </RequireAuth>
  )
}

function MyPosts() {
  const mine = useMyPosts()
  return (
    <div className="wrap forum my-posts">
      <header className="forum__head">
        <h1>My posts</h1>
        <p className="forum__lead">Follow your posts through review. Only you can see drafts and posts waiting for review.</p>
      </header>
      <Updates />
      {mine.isPending ? (
        <Skeleton lines={5} />
      ) : mine.isError ? (
        <ErrorNotice error={mine.error} onRetry={() => mine.refetch()} />
      ) : mine.data.length === 0 ? (
        <EmptyState
          title="You have not written a post yet"
          action={
            <Link className="btn btn-primary" to={PATHS.forumNew}>
              Write a post
            </Link>
          }
        >
          Ask about something you saw in The Eyes, or share a tip.
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const items = mine.data.filter((p) => p.group === g.key)
          if (items.length === 0 && (g.key === 'action' || g.key === 'draft')) return null
          return (
            <section key={g.key} id={g.key} className={`mine-group mine-group--${g.key}`} aria-labelledby={`${g.key}-title`}>
              <h2 id={`${g.key}-title`} className="mine-group__title">
                {g.title} <span className="mine-group__count num">{items.length}</span>
              </h2>
              {items.length === 0 ? (
                <p className="mine-group__empty caption">{g.empty}</p>
              ) : (
                <ul className="mine-list">
                  {items.map((p) => (
                    <MyPostRow key={p.id} post={p} />
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

function badgesFor(p: MyPostSummary) {
  const badges = []
  if (p.visibility === 'hidden') badges.push(<StatusBadge key="h" kind="hidden" />)
  else if (p.visibility === 'published') badges.push(<StatusBadge key="p" kind="published" />)
  if (p.working) {
    const isEdit = p.visibility !== 'unpublished'
    const label =
      p.working.state === 'pending' && isEdit
        ? 'Edit pending review'
        : p.working.state === 'rejected' && isEdit
          ? 'Edit not approved'
          : p.working.state === 'draft' && isEdit
            ? 'Unsent edit'
            : undefined
    badges.push(<StatusBadge key="w" kind={p.working.state} label={label} />)
  }
  return badges
}

function MyPostRow({ post: p }: { post: MyPostSummary }) {
  const isEdit = p.visibility !== 'unpublished'
  const w = p.working
  const reason = p.visibility === 'hidden' ? p.hiddenReason : w?.state === 'rejected' ? w.reason : null
  return (
    <li className="mine-row">
      <div className="mine-row__main">
        <h3 className="mine-row__title">
          <Link to={forumPostPath(p.id)}>{p.title}</Link>
        </h3>
        <div className="mine-row__badges">{badgesFor(p)}</div>
        {reason && (
          <p className="mine-row__reason">
            {p.visibility === 'hidden' ? 'Hidden: ' : 'Moderator feedback: '}
            <ReasonText reason={reason} />
          </p>
        )}
        <p className="mine-row__meta">
          <TimeAgo iso={p.updatedAt} prefix="Updated" />
          {p.visibility !== 'unpublished' && <span>{plural(p.commentCount, 'comment')}</span>}
        </p>
      </div>
      <div className="mine-row__actions">
        {w?.state === 'pending' ? (
          <WithdrawButton postId={p.id} revisionId={w.id} isEdit={isEdit} label="Withdraw" />
        ) : (
          (w || (p.visibility === 'published' && !w)) && (
            <Link to={forumEditPath(p.id)} className="btn btn-secondary btn-sm">
              <PencilLine aria-hidden />
              {w?.state === 'rejected' ? 'Edit and resubmit' : w ? 'Continue editing' : 'Suggest an edit'}
            </Link>
          )
        )}
      </div>
    </li>
  )
}

const NOTE_TEXT: Record<ForumNotification['kind'], string> = {
  approved: 'was approved and is now public',
  rejected: 'was not approved',
  hidden: 'was hidden by a moderator',
  restored: 'is visible again',
  comment_hidden: 'had one of your comments hidden',
}

/** In-app notifications for moderation results (FR-10). Opening this page marks them read. */
function Updates() {
  const notes = useNotifications()
  const qc = useQueryClient()
  const markRead = useMutation({
    mutationFn: () => forumApi.markNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: forumKeys.notifications }),
  })
  const unreadIds = useRef<Set<string> | null>(null)
  const items = notes.data ?? []
  if (notes.data && unreadIds.current === null) unreadIds.current = new Set(items.filter((n) => !n.read).map((n) => n.id))

  useEffect(() => {
    if (notes.data?.some((n) => !n.read) && !markRead.isPending) {
      const t = setTimeout(() => markRead.mutate(), 1500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.data])

  if (items.length === 0) return null
  return (
    <section className="updates" aria-labelledby="updates-title">
      <h2 id="updates-title" className="mine-group__title">
        <Bell aria-hidden /> Updates
      </h2>
      <ul className="updates__list">
        {items.slice(0, 5).map((n) => (
          <li key={n.id} className={unreadIds.current?.has(n.id) ? 'is-new' : undefined}>
            {unreadIds.current?.has(n.id) && <span className="updates__new">New</span>}
            <span>
              <Link to={forumPostPath(n.postId)}>{n.title || 'Your post'}</Link> {NOTE_TEXT[n.kind]}
              {n.reason && (
                <>
                  {' '}
                  (<ReasonText reason={n.reason} />)
                </>
              )}
              . <TimeAgo iso={n.createdAt} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
