import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Info } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { forumEditPath, forumPostPath, PATHS } from '../../app/config'
import { useEnsureDisplayName } from '../../features/auth/DisplayNameDialog'
import { RequireAuth } from '../../features/auth/RequireAuth'
import { forumApi } from '../../features/forum/api'
import { ReasonText } from '../../features/forum/components/AuthorStatusPanel'
import { Skeleton, TimeAgo } from '../../features/forum/components/bits'
import { FieldError, LinkFields, TagPicker } from '../../features/forum/components/EditorFields'
import { useFlash } from '../../features/forum/components/Flash'
import { ErrorNotice, ForumHeaderActions, ForumMessage } from '../../features/forum/components/ForumChrome'
import { useLeaveGuard } from '../../features/forum/components/useLeaveGuard'
import { COMMUNITY_RULES, LIMITS } from '../../features/forum/config'
import { ForumError } from '../../features/forum/errors'
import { MarkdownView } from '../../features/forum/markdown'
import { forumKeys, useTags } from '../../features/forum/queries'
import type { EditorData, PostContent } from '../../features/forum/types'
import { charCount, hasErrors, validateDraft, validatePost, type PostErrors } from '../../features/forum/validation'
import { Dialog } from '../../shared/ui/Dialog'
import '../../features/forum/forum.css'
import { PageShell } from '../../shared/layout/Shell'
import { useDocumentTitle } from './useDocumentTitle'

const EMPTY: PostContent = { title: '', body: '', tagIds: [], links: [] }

export default function EditorPage() {
  return (
    <RequireAuth>
      <PageShell headerActions={<ForumHeaderActions showWrite={false} />}>
        <EditorRoute />
      </PageShell>
    </RequireAuth>
  )
}

function EditorRoute() {
  const { id } = useParams()
  const editor = useQuery({
    queryKey: forumKeys.editor(id ?? 'new'),
    queryFn: () => forumApi.getEditor(id!),
    enabled: Boolean(id),
    gcTime: 0,
  })
  if (!id) return <EditorForm key="new" data={null} />
  if (editor.isPending)
    return (
      <div className="wrap forum">
        <Skeleton lines={6} />
      </div>
    )
  if (editor.isError) {
    if (editor.error instanceof ForumError && editor.error.code === 'NOT_FOUND')
      return <ForumMessage title="Post not found">You can only edit your own posts.</ForumMessage>
    return (
      <div className="wrap forum">
        <ErrorNotice error={editor.error} onRetry={() => editor.refetch()} />
      </div>
    )
  }
  return <EditorForm key={id} data={editor.data} onReload={() => editor.refetch()} />
}

function EditorForm({ data, onReload }: { data: EditorData | null; onReload?: () => void }) {
  const mode = data?.mode ?? 'new'
  useDocumentTitle(mode === 'edit' ? 'Edit post' : 'Write a post')
  const uid = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const tags = useTags()
  const flash = useFlash()
  const { ensure, dialog: nameDialog } = useEnsureDisplayName()
  const [clientKey] = useState(() => crypto.randomUUID())
  const [postId, setPostId] = useState<string | null>(data?.postId ?? null)
  const [content, setContent] = useState<PostContent>(data?.content ?? EMPTY)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [errors, setErrors] = useState<PostErrors>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [serverError, setServerError] = useState<unknown>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const locked = Boolean(data?.lockedBy)
  const guard = useLeaveGuard(dirty && busy === null)

  // A message handed over from the previous screen (e.g. "Draft saved" after the first save).
  const handoff = (location.state as { flash?: string } | null)?.flash
  useEffect(() => {
    if (handoff) flash.show(handoff)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeIds = useMemo(() => new Set(tags.data?.filter((t) => t.active).map((t) => t.id)), [tags.data])

  const update = <K extends keyof PostContent>(key: K, value: PostContent[K]) => {
    setContent((c) => ({ ...c, [key]: value }))
    setDirty(true)
    const errKey: keyof PostErrors = key === 'tagIds' ? 'tags' : (key as Exclude<keyof PostContent, 'tagIds'>)
    if (errors[errKey]) setErrors((e) => ({ ...e, [errKey]: undefined }))
  }

  const toggleTag = (id: string) => {
    setContent((c) => ({ ...c, tagIds: c.tagIds.includes(id) ? c.tagIds.filter((t) => t !== id) : [...c.tagIds, id] }))
    setDirty(true)
    if (errors.tags) setErrors((e) => ({ ...e, tags: undefined }))
  }

  const focusFirst = (e: PostErrors) => {
    if (e.title) titleRef.current?.focus()
    else if (e.body) {
      setTab('write')
      setTimeout(() => bodyRef.current?.focus())
    } else if (e.tags) document.getElementById(`${uid}-tags`)?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    else if (e.links) document.querySelector<HTMLElement>('.link-fields [aria-invalid="true"]')?.focus()
  }

  const applyServerError = (err: unknown) => {
    if (err instanceof ForumError && err.code === 'VALIDATION' && err.details.fields) {
      const f = err.details.fields
      const mapped: PostErrors = { title: f.title, body: f.body, tags: f.tags, links: f.links ? content.links.map(() => f.links) : undefined }
      setErrors(mapped)
      focusFirst(mapped)
      return
    }
    if (err instanceof ForumError && err.details.reason === 'PENDING_LOCK') onReload?.()
    setServerError(err)
  }

  const leaveTo = (path: string, message: string) => {
    flushSync(() => setDirty(false))
    navigate(path, { replace: true, state: { flash: message } })
  }

  const save = async () => {
    const found = validateDraft(content)
    setErrors(found)
    if (hasErrors(found)) return focusFirst(found)
    setBusy('save')
    setServerError(null)
    try {
      const res = await forumApi.saveDraft({ postId, content, clientKey })
      qc.invalidateQueries({ queryKey: forumKeys.mine })
      setBusy(null)
      if (!postId) {
        setPostId(res.postId)
        leaveTo(forumEditPath(res.postId), 'Draft saved. Only you can see it.')
        return
      }
      setDirty(false)
      setSavedAt(res.savedAt)
      flash.show('Draft saved. Only you can see it.')
    } catch (err) {
      setBusy(null)
      applyServerError(err)
    }
  }

  const askSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || locked) return
    const found = validatePost(content, tags.data ? activeIds : undefined)
    setErrors(found)
    if (hasErrors(found)) return focusFirst(found)
    ensure(() => setConfirm(true))
  }

  const submit = async () => {
    setBusy('submit')
    setServerError(null)
    try {
      const res = await forumApi.submit({ postId, content, clientKey })
      qc.invalidateQueries({ queryKey: forumKeys.mine })
      qc.removeQueries({ queryKey: forumKeys.post(res.postId) })
      setConfirm(false)
      setBusy(null)
      leaveTo(forumPostPath(res.postId), mode === 'edit' ? 'Edit sent for review. Readers still see the published version.' : 'Sent for review. Only you can see it until it is approved.')
    } catch (err) {
      setConfirm(false)
      setBusy(null)
      applyServerError(err)
    }
  }

  const titleN = charCount(content.title.trim())
  const bodyN = charCount(content.body.trim())
  const backHref = postId && data ? forumPostPath(postId) : PATHS.forum

  return (
    <div className="wrap forum editor-page">
      <Link to={backHref} className="back-link">
        <ChevronLeft aria-hidden /> {postId && data ? 'Back to post' : 'Forum'}
      </Link>
      <div className="editor-layout">
        <form className="editor" onSubmit={askSubmit} noValidate aria-labelledby={`${uid}-h`}>
          <h1 id={`${uid}-h`} className="editor__title">
            {mode === 'edit' ? 'Suggest an edit' : mode === 'draft' ? 'Edit draft' : 'Write a post'}
          </h1>

          {locked ? (
            <div className="notice notice--warn" role="status">
              <Info aria-hidden />
              <div>
                <p>
                  <strong>This version is waiting for review.</strong> Withdraw it from the post page before you change it.
                </p>
                <Link to={forumPostPath(data!.postId)} className="btn btn-secondary btn-sm editor__notice-action">
                  Go to the post
                </Link>
              </div>
            </div>
          ) : (
            <div className="notice notice--info">
              <Info aria-hidden />
              <div>
                <p>
                  {mode === 'edit' ? (
                    <>
                      <strong>Readers keep seeing the published version</strong> until a moderator approves your edit.
                    </>
                  ) : (
                    <>
                      <strong>A moderator checks every post</strong> before it appears in the Forum.
                    </>
                  )}
                </p>
                <ul className="editor__rules">
                  {COMMUNITY_RULES.slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {data?.lastRejection && (
            <div className="notice notice--error">
              <AlertCircle aria-hidden />
              <p>
                <strong>Moderator feedback on your last version.</strong> <ReasonText reason={data.lastRejection} />
              </p>
            </div>
          )}
          {serverError != null && <ErrorNotice error={serverError} />}

          <fieldset className="editor__fields" disabled={locked || busy !== null}>
            <div className="field">
              <div className="field__row">
                <label htmlFor={`${uid}-title`} className="field__label">
                  Title
                </label>
                <span className={`field__count${titleN > LIMITS.titleMax ? ' field__count--over' : ''}`}>
                  {titleN}/{LIMITS.titleMax}
                </span>
              </div>
              <input
                ref={titleRef}
                id={`${uid}-title`}
                name="title"
                autoComplete="off"
                className="input editor__title-input"
                value={content.title}
                placeholder="For example: Is this faint dot near WISE 0855 the brown dwarf…"
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? `${uid}-title-err` : undefined}
                onChange={(e) => update('title', e.target.value)}
              />
              <FieldError id={`${uid}-title-err`} message={errors.title} />
            </div>

            <div className="field">
              <div className="field__row">
                <span className="field__label" id={`${uid}-body-label`}>
                  Post
                </span>
                <div className="segmented segmented--sm" role="group" aria-label="Editor view">
                  <button type="button" aria-pressed={tab === 'write'} onClick={() => setTab('write')}>
                    Write
                  </button>
                  <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>
                    Preview
                  </button>
                </div>
              </div>
              {tab === 'write' ? (
                <>
                  <textarea
                    ref={bodyRef}
                    id={`${uid}-body`}
                    name="body"
                    autoComplete="off"
                    className="textarea editor__body"
                    rows={12}
                    value={content.body}
                    aria-labelledby={`${uid}-body-label`}
                    aria-invalid={errors.body ? true : undefined}
                    aria-describedby={`${uid}-body-hint${errors.body ? ` ${uid}-body-err` : ''}`}
                    placeholder="What did you look at (target, detector)? What did you see, and what would you like to know?"
                    onChange={(e) => update('body', e.target.value)}
                  />
                  <div className="field__row">
                    <p id={`${uid}-body-hint`} className="field__hint">
                      Formatting: **bold**, *italic*, lines starting with “- ” for a list, [text](https://link).
                    </p>
                    <span className={`field__count${bodyN > LIMITS.bodyMax ? ' field__count--over' : ''}`}>
                      {bodyN.toLocaleString('en')}/{LIMITS.bodyMax.toLocaleString('en')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="editor__preview" aria-live="polite">
                  {content.body.trim() ? <MarkdownView source={content.body} /> : <p className="field__hint">Nothing to preview yet.</p>}
                </div>
              )}
              <FieldError id={`${uid}-body-err`} message={errors.body} />
            </div>

            <div id={`${uid}-tags`}>
              {tags.data ? (
                <TagPicker tags={tags.data} value={content.tagIds} onToggle={toggleTag} error={errors.tags} />
              ) : tags.isError ? (
                <ErrorNotice error={tags.error} onRetry={() => tags.refetch()} />
              ) : (
                <Skeleton lines={1} />
              )}
            </div>

            <LinkFields links={content.links} onChange={(v) => update('links', v)} errors={errors.links} />
          </fieldset>

          <div className="editor__bar">
            <p className="editor__saved caption" aria-live="polite">
              {busy === 'save' ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? <TimeAgo iso={savedAt} prefix="Saved" /> : null}
            </p>
            <Link to={backHref} className="btn btn-ghost">
              Cancel
            </Link>
            <button type="button" className="btn btn-secondary" onClick={save} disabled={locked || busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={locked || busy !== null}>
              Submit for review
            </button>
          </div>
        </form>
      </div>

      <Dialog
        open={confirm}
        title="Send for review?"
        description={
          mode === 'edit'
            ? 'A moderator checks your edit. Until it is approved, readers see the current version.'
            : 'A moderator checks your post before it appears in the Forum. You can withdraw it while it waits.'
        }
        onClose={() => setConfirm(false)}
        busy={busy === 'submit'}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={busy === 'submit'}>
              Keep editing
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy === 'submit'}>
              {busy === 'submit' ? 'Sending…' : 'Send for review'}
            </button>
          </>
        }
      />
      {nameDialog}
      {guard}
      {flash.node}
    </div>
  )
}
