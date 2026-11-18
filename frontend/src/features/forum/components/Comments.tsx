import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Flag } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useEnsureDisplayName } from '../../auth/DisplayNameDialog'
import { loginPath } from '../../auth/returnTo'
import { useSession } from '../../auth/session'
import { forumApi } from '../api'
import { LIMITS } from '../config'
import { ForumError } from '../errors'
import { plural } from '../format'
import { MarkdownView } from '../markdown'
import { forumKeys, useComments } from '../queries'
import type { Comment } from '../types'
import { charCount, validateComment } from '../validation'
import { EmptyState, Skeleton, TimeAgo } from './bits'
import { ErrorNotice } from './ForumChrome'
import { useLanguage } from '../../../shared/i18n/language'
import { demoComment, validationText } from '../translations'
import { StableLabel } from '../../../shared/i18n/StableLabel'
import { StableForumCopy } from './StableForumCopy'

const draftKey = (postId: string) => `spherex-forum-comment-draft:${postId}`

function readDraft(postId: string): string {
  try {
    return sessionStorage.getItem(draftKey(postId)) ?? ''
  } catch {
    return ''
  }
}
function writeDraft(postId: string, text: string) {
  try {
    if (text) sessionStorage.setItem(draftKey(postId), text)
    else sessionStorage.removeItem(draftKey(postId))
  } catch {
    // ignore
  }
}

interface CommentsProps {
  postId: string
  /** Only published posts take comments (AC08). */
  open: boolean
  onReport: (c: Comment) => void
  /** Admin actions (Round 2). */
  renderModeration?: (c: Comment) => React.ReactNode
}

export function Comments({ postId, open, onReport, renderModeration }: CommentsProps) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const comments = useComments(postId)
  const { user } = useSession()
  const count = comments.data?.filter((c) => !c.hidden).length ?? 0

  return (
    <section className="comments" aria-labelledby="comments-title" id="comments">
      <h2 id="comments-title" className="comments__title">
        {comments.isSuccess ? (vi ? `${count} bình luận` : plural(count, 'comment')) : (vi ? 'Bình luận' : 'Comments')}
      </h2>
      {comments.isPending ? (
        <Skeleton lines={2} />
      ) : comments.isError ? (
        <ErrorNotice error={comments.error} onRetry={() => comments.refetch()} />
      ) : comments.data.length === 0 ? (
        <EmptyState title={vi ? 'Chưa có bình luận' : 'No comments yet'}>{open ? (vi ? 'Hãy là người đầu tiên trả lời.' : 'Be the first to reply.') : (vi ? 'Bài viết này không nhận bình luận.' : 'This post is not taking comments.')}</EmptyState>
      ) : (
        <ol className="comment-list">
          {comments.data.map((c) => (
            <li key={c.id} className={`comment${c.hidden ? ' comment--hidden' : ''}`} id={`comment-${c.id}`}>
              <div className="comment__head">
                <span className="comment__author">
                  {c.author.displayName}
                  {c.isMine && <span className="comment__you"> {vi ? '(bạn)' : '(you)'}</span>}
                </span>
                <TimeAgo iso={c.createdAt} />
                {c.hidden && <span className="status status--danger">{vi ? 'Đã ẩn' : 'Hidden'}</span>}
              </div>
              {demoComment(c.author.id, c.body, 'vi') !== c.body ? <div className="forum-bilingual-body"><MarkdownView source={demoComment(c.author.id, c.body, lang)} className="md md--compact" /><div aria-hidden="true"><MarkdownView source={demoComment(c.author.id, c.body, vi ? 'en' : 'vi')} className="md md--compact" /></div></div> : <MarkdownView source={c.body} className="md md--compact" />}
              <div className="comment__actions">
                {!c.isMine && !c.hidden && open && (
                  <button type="button" className="btn btn-ghost btn-sm comment__report" onClick={() => onReport(c)}>
                    <Flag aria-hidden />
                    {vi ? 'Báo cáo' : 'Report'}<span className="sr-only"> {vi ? 'bình luận của' : 'comment by'} {c.author.displayName}</span>
                  </button>
                )}
                {user?.role === 'admin' && renderModeration?.(c)}
              </div>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <CommentComposer postId={postId} />
      ) : (
        <p className="comments__closed caption">{vi ? 'Bình luận mới đã đóng vì bài viết không công khai.' : 'New comments are closed because this post is not public.'}</p>
      )}
    </section>
  )
}

function CommentComposer({ postId }: { postId: string }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const { user } = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { ensure, dialog } = useEnsureDisplayName()
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(() => readDraft(postId))
  const [error, setError] = useState<string>()
  const [announce, setAnnounce] = useState('')

  // Came back from Log in with a saved draft: put the cursor in the box.
  useEffect(() => {
    if (user && readDraft(postId) && location.hash === '#comment') ref.current?.focus()
  }, [user, postId, location.hash])

  const send = useMutation({
    mutationFn: (body: string) => forumApi.addComment(postId, body),
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(forumKeys.comments(postId), (prev) => [...(prev ?? []), comment])
      qc.invalidateQueries({ queryKey: forumKeys.post(postId) })
      qc.invalidateQueries({ queryKey: forumKeys.lists })
      setText('')
      writeDraft(postId, '')
      setAnnounce(vi ? 'Đã đăng bình luận.' : 'Comment posted.')
    },
    onError: (err) => {
      // A post hidden while the page was open: refresh so the page reflects it.
      if (err instanceof ForumError && (err.code === 'NOT_FOUND' || err.details.reason === 'POST_NOT_OPEN')) {
        qc.invalidateQueries({ queryKey: forumKeys.post(postId) })
      }
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (send.isPending) return
    const message = validateComment(text)
    setError(message)
    if (message) {
      ref.current?.focus()
      return
    }
    if (!user) {
      writeDraft(postId, text)
      navigate(loginPath(`${location.pathname}#comment`))
      return
    }
    ensure(() => send.mutate(text))
  }

  const n = charCount(text.trim())

  return (
    <form className="composer" onSubmit={submit} noValidate id="comment">
      <div className="field">
        <div className="field__row">
          <label htmlFor={`${id}-body`} className="field__label">
            {vi ? 'Thêm bình luận' : 'Add a comment'}
          </label>
          <span className={`field__count${n > LIMITS.commentMax ? ' field__count--over' : ''}`}>
            {n.toLocaleString('en')}/{LIMITS.commentMax.toLocaleString('en')}
          </span>
        </div>
        <textarea
          ref={ref}
          id={`${id}-body`}
          name="comment"
          autoComplete="off"
          className="textarea composer__input"
          rows={4}
          value={text}
          disabled={send.isPending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : `${id}-hint`}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(validateComment(e.target.value))
          }}
        />
        {error ? (
          <p id={`${id}-err`} className="field__error">
            <AlertCircle aria-hidden /> {validationText(error, lang)}
          </p>
        ) : (
          <p id={`${id}-hint`} className="field__hint">
            <StableForumCopy alternate={user ? (vi ? 'Comments appear right away. Be kind and stay on topic.' : 'Bình luận hiện ngay. Hãy trao đổi lịch sự và đúng chủ đề.') : (vi ? 'You will be asked to log in. Your comment is kept.' : 'Bạn sẽ được yêu cầu đăng nhập. Bình luận của bạn sẽ được giữ lại.')}>
              {user ? (vi ? 'Bình luận hiện ngay. Hãy trao đổi lịch sự và đúng chủ đề.' : 'Comments appear right away. Be kind and stay on topic.') : (vi ? 'Bạn sẽ được yêu cầu đăng nhập. Bình luận của bạn sẽ được giữ lại.' : 'You will be asked to log in. Your comment is kept.')}
            </StableForumCopy>
          </p>
        )}
      </div>
      {send.isError && <ErrorNotice error={send.error} onRetry={() => send.mutate(text)} />}
      <div className="composer__actions">
        <button type="submit" className="btn btn-primary" disabled={send.isPending}>
          <StableLabel
            text={send.isPending ? (vi ? 'Đang đăng…' : 'Posting…') : user ? (vi ? 'Đăng bình luận' : 'Post comment') : (vi ? 'Đăng nhập để bình luận' : 'Log in to comment')}
            alt={send.isPending ? (vi ? 'Posting…' : 'Đang đăng…') : user ? (vi ? 'Post comment' : 'Đăng bình luận') : (vi ? 'Log in to comment' : 'Đăng nhập để bình luận')}
          />
        </button>
      </div>
      <p className="sr-only" role="status">
        {announce}
      </p>
      {dialog}
    </form>
  )
}
