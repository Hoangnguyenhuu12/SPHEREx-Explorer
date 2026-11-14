import { useMutation } from '@tanstack/react-query'
import { EyeOff, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PATHS } from '../../../app/config'
import { Dialog } from '../../../shared/ui/Dialog'
import { forumApi } from '../api'
import { ReasonText } from '../components/AuthorStatusPanel'
import { ErrorNotice } from '../components/ForumChrome'
import { ReasonDialog } from '../components/ReasonDialog'
import type { Comment, PostView } from '../types'
import { useRefreshAfterModeration } from './useModerationAction'

/** Moderator strip on a post page: status, Hide / Restore, link to the queue for pending versions. */
export function PostModeration({ post, onDone }: { post: PostView; onDone: (m: string) => void }) {
  const refresh = useRefreshAfterModeration()
  const [hiding, setHiding] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const restore = useMutation({
    mutationFn: () => forumApi.restore({ type: 'post', id: post.id }),
    onSuccess: () => {
      setRestoring(false)
      refresh(post.id)
      onDone('Post restored.')
    },
    onError: () => setRestoring(false),
  })

  return (
    <div className="mod-strip" role="region" aria-label="Moderator tools">
      <ShieldCheck aria-hidden />
      <div className="mod-strip__text">
        {post.visibility === 'hidden' ? (
          <p>
            <strong>Hidden from readers.</strong> {post.hiddenReason && <ReasonText reason={post.hiddenReason} />}
          </p>
        ) : post.visibility === 'unpublished' ? (
          <p>
            <strong>Not published yet.</strong> Readers cannot see it.
          </p>
        ) : (
          <p>Moderator tools</p>
        )}
        {post.working?.state === 'pending' && (
          <p className="caption">
            A version is waiting for review. <Link to={`${PATHS.adminForum}?item=${post.working.id}`}>Open in the queue</Link>
          </p>
        )}
      </div>
      {post.visibility === 'published' && (
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setHiding(true)}>
          <EyeOff aria-hidden /> Hide post…
        </button>
      )}
      {post.visibility === 'hidden' && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRestoring(true)}>
          Restore…
        </button>
      )}
      {restore.isError && <ErrorNotice error={restore.error} />}
      <ReasonDialog
        open={hiding}
        title="Hide this post"
        description="Readers will no longer see it in the Forum, search, topics or by link. The author is told the reason."
        confirmLabel="Hide"
        tone="danger"
        onClose={() => setHiding(false)}
        onSubmit={async (reason) => {
          await forumApi.hide({ type: 'post', id: post.id }, reason)
          refresh(post.id)
          onDone('Post hidden.')
        }}
      />
      <Dialog
        open={restoring}
        title="Restore this post?"
        description="It becomes visible to everyone again."
        onClose={() => setRestoring(false)}
        busy={restore.isPending}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRestoring(false)} disabled={restore.isPending}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => restore.mutate()} disabled={restore.isPending}>
              Restore
            </button>
          </>
        }
      />
    </div>
  )
}

export function CommentModeration({ comment, postId, onDone }: { comment: Comment; postId: string; onDone: (m: string) => void }) {
  const refresh = useRefreshAfterModeration()
  const [hiding, setHiding] = useState(false)
  const restore = useMutation({
    mutationFn: () => forumApi.restore({ type: 'comment', id: comment.id }),
    onSuccess: () => {
      refresh(postId)
      onDone('Comment restored.')
    },
  })
  return (
    <>
      {comment.hidden ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore.mutate()} disabled={restore.isPending}>
          Restore comment
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm comment__hide" onClick={() => setHiding(true)}>
          <EyeOff aria-hidden /> Hide<span className="sr-only"> comment by {comment.author.displayName}</span>
        </button>
      )}
      {restore.isError && <ErrorNotice error={restore.error} />}
      <ReasonDialog
        open={hiding}
        title="Hide this comment"
        description="Readers will no longer see it. The author is told the reason."
        confirmLabel="Hide"
        tone="danger"
        onClose={() => setHiding(false)}
        onSubmit={async (reason) => {
          await forumApi.hide({ type: 'comment', id: comment.id }, reason)
          refresh(postId)
          onDone('Comment hidden.')
        }}
      />
    </>
  )
}
