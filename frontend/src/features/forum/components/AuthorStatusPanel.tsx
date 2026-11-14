import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Clock, EyeOff, Info, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { forumEditPath } from '../../../app/config'
import { Dialog } from '../../../shared/ui/Dialog'
import { forumApi } from '../api'
import { reasonLabel } from '../config'
import { forumKeys } from '../queries'
import type { ModerationReason, PostView } from '../types'
import { TimeAgo } from './bits'
import { ErrorNotice } from './ForumChrome'

export function ReasonText({ reason }: { reason: ModerationReason }) {
  return (
    <>
      <strong>{reasonLabel(reason.code)}</strong>
      {reason.note ? `: ${reason.note}` : '.'}
    </>
  )
}

/** Withdraw a pending submission, with confirmation (FR-11). A stale state shows an error and refreshes. */
export function WithdrawButton({
  postId,
  revisionId,
  isEdit,
  label = 'Withdraw to make changes',
}: {
  postId: string
  revisionId: string
  isEdit: boolean
  label?: string
}) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const withdraw = useMutation({
    mutationFn: () => forumApi.withdraw(postId, revisionId),
    onSettled: () => {
      setConfirm(false)
      qc.invalidateQueries({ queryKey: forumKeys.post(postId) })
      qc.invalidateQueries({ queryKey: forumKeys.mine })
    },
  })
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>
        {label}
      </button>
      {withdraw.isError && <ErrorNotice error={withdraw.error} />}
      <Dialog
        open={confirm}
        title="Withdraw from review?"
        description={
          isEdit
            ? 'Your edit goes back to being a draft. The published version stays as it is.'
            : 'Your post goes back to being a draft. You can change it and send it again.'
        }
        onClose={() => setConfirm(false)}
        busy={withdraw.isPending}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={withdraw.isPending}>
              Keep in review
            </button>
            <button type="button" className="btn btn-primary" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
              {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </>
        }
      />
    </>
  )
}

/** What the author needs to know about their own post, and what they can do next (FR-04, FR-05, FR-11). */
export function AuthorStatusPanel({ post }: { post: PostView }) {
  const working = post.working
  const isEdit = Boolean(post.published)

  if (!post.isMine) return null

  const blocks = []

  if (post.visibility === 'hidden' && post.hiddenReason) {
    blocks.push(
      <div key="hidden" className="notice notice--error">
        <EyeOff aria-hidden />
        <div>
          <p>
            <strong>Hidden by a moderator.</strong> Readers cannot see this post. Reason: <ReasonText reason={post.hiddenReason} />
          </p>
        </div>
      </div>,
    )
  }

  if (working?.state === 'pending') {
    blocks.push(
      <div key="pending" className="notice notice--warn">
        <Clock aria-hidden />
        <div>
          <p>
            <strong>{isEdit ? 'Your edit is waiting for review.' : 'Waiting for review.'}</strong>{' '}
            {isEdit ? 'Readers keep seeing the published version until a moderator approves your edit.' : 'Only you can see this post until a moderator approves it.'}
          </p>
          <p className="caption">
            Sent <TimeAgo iso={working.submittedAt ?? working.updatedAt} />
          </p>
          <div className="status-panel__actions">
            <WithdrawButton postId={post.id} revisionId={working.id} isEdit={isEdit} />
          </div>
        </div>
      </div>,
    )
  } else if (working?.state === 'rejected') {
    blocks.push(
      <div key="rejected" className="notice notice--error">
        <AlertCircle aria-hidden />
        <div>
          <p>
            <strong>{isEdit ? 'Your edit was not approved.' : 'Not approved yet.'}</strong> {working.reason && <ReasonText reason={working.reason} />}
          </p>
          {isEdit && <p className="caption">The published version is unchanged.</p>}
          <div className="status-panel__actions">
            <Link to={forumEditPath(post.id)} className="btn btn-primary btn-sm">
              <PencilLine aria-hidden /> Edit and resubmit
            </Link>
          </div>
        </div>
      </div>,
    )
  } else if (working && (working.state === 'draft' || working.state === 'withdrawn')) {
    blocks.push(
      <div key="draft" className="notice notice--info">
        <Info aria-hidden />
        <div>
          <p>
            <strong>{working.state === 'withdrawn' ? 'You withdrew this submission.' : isEdit ? 'You have an unsent edit.' : 'This is a draft.'}</strong>{' '}
            {isEdit ? 'Readers see the published version.' : 'Only you can see it.'}
          </p>
          <div className="status-panel__actions">
            <Link to={forumEditPath(post.id)} className="btn btn-primary btn-sm">
              <PencilLine aria-hidden /> Continue editing
            </Link>
          </div>
        </div>
      </div>,
    )
  }

  return (
    <div className="status-panel">
      {blocks}
      {!working && post.published && post.visibility !== 'hidden' && (
        <Link to={forumEditPath(post.id)} className="btn btn-secondary btn-sm status-panel__edit">
          <PencilLine aria-hidden /> Suggest an edit
        </Link>
      )}
    </div>
  )
}
