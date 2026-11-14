import { ChevronLeft, ExternalLink, Flag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { PATHS } from '../../app/config'
import { useRequireLogin } from '../../features/auth/RequireAuth'
import { useSession } from '../../features/auth/session'
import { forumApi } from '../../features/forum/api'
import { AuthorStatusPanel } from '../../features/forum/components/AuthorStatusPanel'
import { ObservationLinkCard, Skeleton, TagChips, TimeAgo } from '../../features/forum/components/bits'
import { Comments } from '../../features/forum/components/Comments'
import { useFlash } from '../../features/forum/components/Flash'
import { ErrorNotice, ForumHeaderActions, ForumMessage } from '../../features/forum/components/ForumChrome'
import { ReasonDialog } from '../../features/forum/components/ReasonDialog'
import { COMMUNITY_NOTE } from '../../features/forum/config'
import { ForumError } from '../../features/forum/errors'
import { isEyesLink } from '../../features/forum/links'
import { MarkdownView } from '../../features/forum/markdown'
import { CommentModeration, PostModeration } from '../../features/forum/moderation/ModerationControls'
import { usePost } from '../../features/forum/queries'
import '../../features/forum/forum.css'
import { PageShell } from '../../shared/layout/Shell'
import { useDocumentTitle } from './useDocumentTitle'

type ReportTarget = { type: 'post' | 'comment'; id: string; label: string }

export default function PostPage() {
  const { id = '' } = useParams()
  const post = usePost(id)
  const { user } = useSession()
  const requireLogin = useRequireLogin()
  const flash = useFlash()
  const [report, setReport] = useState<ReportTarget | null>(null)
  const location = useLocation()
  const handoff = (location.state as { flash?: string } | null)?.flash
  useEffect(() => {
    if (handoff) flash.show(handoff)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const view = post.data
  // Authors see their unpublished draft/pending text; everyone else only sees the approved version.
  const content = view?.published ?? (view?.isMine ? view.working : null) ?? null
  useDocumentTitle(content?.title ?? null)

  if (post.isError && post.error instanceof ForumError && post.error.code === 'NOT_FOUND') {
    return (
      <PageShell headerActions={<ForumHeaderActions />}>
        <ForumMessage title="Post not found">This post does not exist, or it is not public.</ForumMessage>
      </PageShell>
    )
  }

  const openReport = (target: ReportTarget) => requireLogin(() => setReport(target))
  const eyesLinks = content?.links.filter(isEyesLink) ?? []
  const otherLinks = content?.links.filter((l) => !isEyesLink(l)) ?? []
  const isPublic = view?.visibility === 'published'

  return (
    <PageShell headerActions={<ForumHeaderActions />}>
      <div className="wrap forum post-page">
        <Link to={PATHS.forum} className="back-link">
          <ChevronLeft aria-hidden /> Forum
        </Link>

        {post.isPending ? (
          <div className="post-layout">
            <div>
              <Skeleton lines={6} />
            </div>
          </div>
        ) : post.isError ? (
          <ErrorNotice error={post.error} onRetry={() => post.refetch()} />
        ) : (
          view &&
          content && (
            <div className="post-layout">
              <article className="post" aria-labelledby="post-title">
                <AuthorStatusPanel post={view} />
                {user?.role === 'admin' && <PostModeration post={view} onDone={flash.show} />}
                <header className="post__head">
                  <h1 id="post-title" className="post__title">
                    {content.title || 'Untitled draft'}
                  </h1>
                  <p className="post__meta">
                    <span className="post__author">{view.author.displayName}</span>
                    {view.publishedAt ? <TimeAgo iso={view.publishedAt} prefix="Posted" /> : <span>Not published</span>}
                    {view.editedAt && <TimeAgo iso={view.editedAt} prefix="Edited" />}
                  </p>
                  <TagChips tags={content.tags} linked={isPublic} />
                </header>

                {eyesLinks.length > 0 && (
                  <div className="post__obs post__obs--inline">
                    {eyesLinks.map((l) => (
                      <ObservationLinkCard key={l} href={l} />
                    ))}
                  </div>
                )}

                <MarkdownView source={content.body} />

                {otherLinks.length > 0 && (
                  <div className="post__links">
                    <h2 className="post__subhead">Links</h2>
                    <ul>
                      {otherLinks.map((l) => (
                        <li key={l}>
                          <a href={l} target="_blank" rel="noopener noreferrer nofollow ugc">
                            {l}
                            <ExternalLink aria-hidden />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <footer className="post__foot">
                  <p className="caption">{COMMUNITY_NOTE}</p>
                  {isPublic && !view.isMine && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReport({ type: 'post', id: view.id, label: 'post' })}>
                      <Flag aria-hidden /> Report post
                    </button>
                  )}
                </footer>

                {(isPublic || view.commentCount > 0) && (
                  <Comments
                    postId={view.id}
                    open={isPublic}
                    onReport={(c) => openReport({ type: 'comment', id: c.id, label: 'comment' })}
                    renderModeration={(c) => <CommentModeration comment={c} postId={view.id} onDone={flash.show} />}
                  />
                )}
              </article>

              {eyesLinks.length > 0 && (
                <aside className="post-aside" aria-label="Observation">
                  <h2 className="post__subhead">Observation</h2>
                  {eyesLinks.map((l) => (
                    <ObservationLinkCard key={l} href={l} />
                  ))}
                  <p className="caption">Opens the same target and settings in The Eyes.</p>
                </aside>
              )}
            </div>
          )
        )}
      </div>

      <ReasonDialog
        open={report !== null}
        title={report?.type === 'comment' ? 'Report this comment' : 'Report this post'}
        description="A moderator will review it. The author is not told who reported it."
        confirmLabel="Send report"
        onClose={() => setReport(null)}
        onSubmit={async (reason) => {
          const res = await forumApi.report({ targetType: report!.type, targetId: report!.id, reason })
          flash.show(res.duplicate ? 'You already reported this. A moderator will look at it.' : 'Report sent. Thank you.')
        }}
      />
      {flash.node}
    </PageShell>
  )
}
