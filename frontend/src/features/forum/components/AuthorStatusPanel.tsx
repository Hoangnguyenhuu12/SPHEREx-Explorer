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
import { useLanguage } from '../../../shared/i18n/language'

export function ReasonText({ reason }: { reason: ModerationReason }) {
  const { lang } = useLanguage()
  const vi = { off_topic: 'Không đúng chủ đề', spam: 'Thư rác hoặc quảng cáo', abusive: 'Xúc phạm hoặc công kích', personal_info: 'Chia sẻ thông tin cá nhân', needs_context: 'Cần thêm bối cảnh hoặc nguồn', other: 'Lý do khác' } as const
  return (
    <>
      <strong>{lang === 'vi' ? vi[reason.code] : reasonLabel(reason.code)}</strong>
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
  const { lang } = useLanguage()
  const vi = lang === 'vi'
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
        {vi && label === 'Withdraw to make changes' ? 'Rút lại để chỉnh sửa' : label}
      </button>
      {withdraw.isError && <ErrorNotice error={withdraw.error} />}
      <Dialog
        open={confirm}
        title={vi ? 'Rút khỏi kiểm duyệt?' : 'Withdraw from review?'}
        description={
          isEdit
            ? (vi ? 'Bản sửa sẽ trở lại bản nháp. Bản đã đăng không thay đổi.' : 'Your edit goes back to being a draft. The published version stays as it is.')
            : (vi ? 'Bài viết sẽ trở lại bản nháp. Bạn có thể chỉnh sửa và gửi lại.' : 'Your post goes back to being a draft. You can change it and send it again.')
        }
        onClose={() => setConfirm(false)}
        busy={withdraw.isPending}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={withdraw.isPending}>
              {vi ? 'Tiếp tục chờ duyệt' : 'Keep in review'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
              {withdraw.isPending ? (vi ? 'Đang rút lại…' : 'Withdrawing…') : (vi ? 'Rút lại' : 'Withdraw')}
            </button>
          </>
        }
      />
    </>
  )
}

/** What the author needs to know about their own post, and what they can do next (FR-04, FR-05, FR-11). */
export function AuthorStatusPanel({ post }: { post: PostView }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
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
            <strong>{vi ? 'Đã bị người kiểm duyệt ẩn.' : 'Hidden by a moderator.'}</strong> {vi ? 'Người đọc không thể xem bài này. Lý do:' : 'Readers cannot see this post. Reason:'} <ReasonText reason={post.hiddenReason} />
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
            <strong>{isEdit ? (vi ? 'Bản sửa của bạn đang chờ duyệt.' : 'Your edit is waiting for review.') : (vi ? 'Đang chờ kiểm duyệt.' : 'Waiting for review.')}</strong>{' '}
            {isEdit ? (vi ? 'Người đọc vẫn thấy bản đã đăng cho đến khi bản sửa được duyệt.' : 'Readers keep seeing the published version until a moderator approves your edit.') : (vi ? 'Chỉ bạn thấy bài viết cho đến khi được duyệt.' : 'Only you can see this post until a moderator approves it.')}
          </p>
          <p className="caption">
            {vi ? 'Đã gửi' : 'Sent'} <TimeAgo iso={working.submittedAt ?? working.updatedAt} />
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
            <strong>{isEdit ? (vi ? 'Bản sửa không được duyệt.' : 'Your edit was not approved.') : (vi ? 'Chưa được duyệt.' : 'Not approved yet.')}</strong> {working.reason && <ReasonText reason={working.reason} />}
          </p>
          {isEdit && <p className="caption">{vi ? 'Bản đã đăng không thay đổi.' : 'The published version is unchanged.'}</p>}
          <div className="status-panel__actions">
            <Link to={forumEditPath(post.id)} className="btn btn-primary btn-sm">
              <PencilLine aria-hidden /> {vi ? 'Sửa và gửi lại' : 'Edit and resubmit'}
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
            <strong>{working.state === 'withdrawn' ? (vi ? 'Bạn đã rút lại bài gửi.' : 'You withdrew this submission.') : isEdit ? (vi ? 'Bạn có bản sửa chưa gửi.' : 'You have an unsent edit.') : (vi ? 'Đây là bản nháp.' : 'This is a draft.')}</strong>{' '}
            {isEdit ? (vi ? 'Người đọc thấy bản đã đăng.' : 'Readers see the published version.') : (vi ? 'Chỉ bạn có thể xem.' : 'Only you can see it.')}
          </p>
          <div className="status-panel__actions">
            <Link to={forumEditPath(post.id)} className="btn btn-primary btn-sm">
              <PencilLine aria-hidden /> {vi ? 'Tiếp tục chỉnh sửa' : 'Continue editing'}
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
          <PencilLine aria-hidden /> {vi ? 'Đề xuất chỉnh sửa' : 'Suggest an edit'}
        </Link>
      )}
    </div>
  )
}
