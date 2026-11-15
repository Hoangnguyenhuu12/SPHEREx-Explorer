/**
 * ForumApi on the real backend (forum-v1.1, /api/forum). The UI was built against the mock's
 * page-based, version-free interface, so this adapter:
 *  - walks cursor pages and slices locally (the forum is small; lists cap at MAX_PAGES × 50),
 *  - reads the current version right before each write and sends it as expected_version,
 *  - sends a fresh Idempotency-Key per user action (the editor's clientKey for creating a post),
 *  - derives what has no endpoint yet (moderation counts, hidden content) from existing ones.
 * Permissions are enforced by the backend; nothing here is a security boundary.
 */
import { getSessionUser } from '../../auth/session'
import type { ForumApi, HiddenItem, ModerationCounts, QueueItem, ReportItem, SaveResult, Submission } from '../api'
import { PAGE_SIZE } from '../config'
import { ForumError } from '../errors'
import { isEyesLink } from '../links'
import { excerpt } from '../markdown'
import type {
  Comment,
  EditorData,
  ForumNotification,
  ModerationReason,
  MyPostGroup,
  MyPostSummary,
  NotificationKind,
  PostContent,
  PostSummary,
  PostView,
  Tag,
  TagWithCount,
} from '../types'
import { hasErrors, validateDraft, validatePost, validateReason } from '../validation'
import { get, hasBackendReason, request } from './client'
import {
  decodeReason,
  encodeReason,
  fromReportCode,
  fromWireLink,
  hiddenReasonOf,
  rejectCode,
  reportCode,
  toAuthor,
  toPublished,
  toRevisionView,
  toTag,
  toWireLink,
  type WAdminReport,
  type WAuditEvent,
  type WComment,
  type WModeratedComment,
  type WNotification,
  type WPublicPost,
  type WReview,
  type WRevision,
  type WTag,
  type WWorkspace,
} from './wire'

const MAX_PAGES = 20
const LIMIT = 50

/** Every item of a cursor-paged list (newest pages first, as the endpoint orders them). */
async function all<T>(path: string, key: string, query: Record<string, string | boolean | undefined> = {}, auth = false): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await get<Record<string, unknown>>(path, { query: { ...query, limit: LIMIT, cursor }, auth })
    out.push(...((page[key] as T[]) ?? []))
    cursor = (page.next_cursor as string | null) ?? undefined
    if (!cursor) break
  }
  return out
}

const enc = encodeURIComponent
const me = () => getSessionUser()
const validationError = (fields: Record<string, string | undefined>) =>
  new ForumError('VALIDATION', 'Invalid input', { fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Record<string, string> })

// ------------------------------------------------------------- tag catalog

let tagCache: { at: number; tags: { tag: WTag; published_post_count: number }[] } | null = null

async function catalog(fresh = false) {
  if (!fresh && tagCache && Date.now() - tagCache.at < 15_000) return tagCache.tags
  const tags = await all<{ tag: WTag; published_post_count: number }>('/hashtags', 'hashtags')
  tagCache = { at: Date.now(), tags }
  return tags
}

async function tagMap(extra: WTag[] = []): Promise<Map<string, Tag>> {
  const map = new Map((await catalog()).map(({ tag }) => [tag.id, toTag(tag)]))
  for (const t of extra) map.set(t.id, toTag(t))
  return map
}

async function tagVersion(id: string): Promise<number> {
  const found = (await catalog(true)).find(({ tag }) => tag.id === id)
  if (!found) throw new ForumError('NOT_FOUND', 'Tag not found')
  return found.tag.version
}

// ----------------------------------------------------------- post helpers

const workspace = (postId: string) => get<{ workspace: WWorkspace }>(`/posts/${enc(postId)}/workspace`, { auth: true }).then((r) => r.workspace)
const publicPost = (postId: string) => get<{ post: WPublicPost }>(`/posts/${enc(postId)}`).then((r) => r.post)
const revision = (postId: string, revisionId: string) =>
  get<{ revision: WRevision }>(`/posts/${enc(postId)}/revisions/${enc(revisionId)}`, { auth: true }).then((r) => r.revision)

/** Newest revision by number. Rejected/withdrawn revisions are no longer the post's working revision. */
async function latestRevision(postId: string): Promise<WRevision | null> {
  const r = await get<{ revisions: WRevision[] }>(`/posts/${enc(postId)}/revisions`, { query: { limit: 1 }, auth: true })
  return r.revisions[0] ?? null
}

/** The revision the author is working on: the working pointer, else a newer rejected/withdrawn one. */
async function openRevision(ws: WWorkspace): Promise<WRevision | null> {
  if (ws.working_revision) return ws.working_revision
  const latest = await latestRevision(ws.post.id)
  if (!latest || latest.id === ws.post.published_revision_id) return null
  return latest.status === 'rejected' || latest.status === 'withdrawn' ? latest : null
}

async function commentCount(postId: string): Promise<number> {
  try {
    return (await all<WComment>(`/posts/${enc(postId)}/comments`, 'comments')).length
  } catch (e) {
    if (e instanceof ForumError && e.code === 'NOT_FOUND') return 0
    throw e
  }
}

/** Author/admin workspace, or null when the caller may only see the public version. */
async function workspaceIfAllowed(postId: string): Promise<WWorkspace | null> {
  if (!me()) return null
  try {
    return await workspace(postId)
  } catch (e) {
    if (e instanceof ForumError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) return null
    throw e
  }
}

function groupOf(visibility: string, working: WRevision | null): MyPostGroup {
  if (visibility === 'hidden' || working?.status === 'rejected') return 'action'
  if (working?.status === 'pending') return 'review'
  if (working && (working.status === 'draft' || working.status === 'withdrawn')) return 'draft'
  return 'published'
}

function draftBody(c: PostContent) {
  return {
    title: c.title.trim(),
    body: c.body.replace(/\s+$/g, ''),
    hashtag_ids: [...new Set(c.tagIds)],
    links: c.links.map((l) => l.trim()).filter(Boolean).map((l) => toWireLink(l)),
  }
}

function sameContent(r: WRevision, c: PostContent): boolean {
  const b = draftBody(c)
  return r.title === b.title && r.body.trim() === b.body.trim() && JSON.stringify(r.hashtag_ids) === JSON.stringify(b.hashtag_ids) && JSON.stringify(r.links) === JSON.stringify(b.links)
}

/** Create or update the post's editable draft and return the resulting workspace. */
async function upsertDraft(postId: string | null, content: PostContent, clientKey: string): Promise<WWorkspace> {
  const body = draftBody(content)
  if (!postId) {
    // The editor keeps one clientKey per new post, so a double click or retry creates it once.
    const r = await request<{ workspace: WWorkspace }>('POST', '/posts', { body, key: clientKey, auth: true })
    return r.data.workspace
  }
  let ws = await workspace(postId)
  let draft = ws.working_revision
  if (draft?.status === 'pending') throw new ForumError('CONFLICT', 'Pending revision is locked', { reason: 'PENDING_LOCK' })
  if (!draft) {
    // Edit of a published post, or a fresh start after rejection/withdrawal: clone the newest snapshot.
    const base = (await latestRevision(postId)) ?? ws.published_revision
    if (!base) throw new ForumError('NOT_FOUND', 'Post not found')
    const r = await request<{ workspace: WWorkspace }>('POST', `/posts/${enc(postId)}/revisions`, {
      body: { base_revision_id: base.id, expected_post_version: ws.post.version },
      auth: true,
    })
    ws = r.data.workspace
    draft = ws.working_revision!
  }
  if (sameContent(draft, content)) return ws
  try {
    const r = await request<{ workspace: WWorkspace }>('PATCH', `/posts/${enc(postId)}/revisions/${enc(draft.id)}`, {
      body: { expected_version: draft.version, ...body },
      auth: true,
    })
    return r.data.workspace
  } catch (e) {
    if (hasBackendReason(e, 'NO_CHANGE')) return ws
    throw e
  }
}

const saved = (ws: WWorkspace): SaveResult => ({ postId: ws.post.id, revisionId: ws.working_revision!.id, savedAt: ws.working_revision!.updated_at })

// ----------------------------------------------------------- admin helpers

/** Queue items carry only a revision ID; this remembers which post each belongs to. */
const postOfRevision = new Map<string, string>()

async function reviews(): Promise<WReview[]> {
  const items = await all<WReview>('/admin/reviews', 'items', {}, true)
  for (const it of items) postOfRevision.set(it.submitted_revision.id, it.post.id)
  return items
}

async function postIdFor(revisionId: string): Promise<string> {
  if (!postOfRevision.has(revisionId)) await reviews()
  const id = postOfRevision.get(revisionId)
  if (!id) throw new ForumError('NOT_FOUND', 'Submission not found')
  return id
}

/** Throw the UI's "already decided" conflict, saying what the revision is now. */
function staleDecision(r: WRevision): never {
  throw new ForumError('CONFLICT', 'Already decided', { reason: 'STALE_DECISION', state: r.status, by: r.status === 'withdrawn' ? 'the author' : null })
}

async function decide(revisionId: string, decision: Record<string, string>): Promise<void> {
  const postId = await postIdFor(revisionId)
  const [ws, rev] = await Promise.all([workspace(postId), revision(postId, revisionId)])
  if (rev.status !== 'pending') staleDecision(rev)
  try {
    await request('POST', `/admin/posts/${enc(postId)}/revisions/${enc(revisionId)}/decision`, {
      body: { ...decision, expected_revision_version: rev.version, expected_post_version: ws.post.version },
      auth: true,
    })
  } catch (e) {
    if (e instanceof ForumError && e.code === 'CONFLICT' && e.details.reason === 'STALE_DECISION') {
      const now = await revision(postId, revisionId)
      if (now.status !== 'pending') staleDecision(now)
    }
    throw e
  }
}

const commentWorkspace = (id: string) => get<{ item: WModeratedComment }>(`/comments/${enc(id)}/workspace`, { auth: true }).then((r) => r.item)

const reportVersions = new Map<string, number>()

async function openReports(): Promise<WAdminReport[]> {
  const items = await all<WAdminReport>('/admin/reports', 'items', { status: 'open' }, true)
  for (const r of items) reportVersions.set(r.report.id, r.report.version)
  return items
}

async function setVisibility(target: { type: 'post' | 'comment'; id: string }, action: 'hide' | 'restore', reason: string): Promise<void> {
  let version: number
  if (target.type === 'post') {
    const ws = await workspace(target.id)
    const wanted = action === 'hide' ? 'published' : 'hidden'
    if (ws.post.visibility !== wanted) throw new ForumError('CONFLICT', 'Visibility changed', { reason: 'STALE_DECISION', state: ws.post.visibility })
    version = ws.post.version
  } else {
    const c = await commentWorkspace(target.id)
    if ((c.visibility === 'hidden') === (action === 'hide')) throw new ForumError('CONFLICT', 'Visibility changed', { reason: 'STALE_DECISION', state: c.visibility })
    version = c.comment.version
  }
  await request('POST', `/admin/${target.type === 'post' ? 'posts' : 'comments'}/${enc(target.id)}/visibility`, {
    body: { action, expected_version: version, reason },
    auth: true,
  })
}

async function closeReport(reportId: string, outcome: 'resolved' | 'dismissed', reason: string): Promise<void> {
  if (!reportVersions.has(reportId)) await openReports()
  const version = reportVersions.get(reportId)
  if (version === undefined) throw new ForumError('CONFLICT', 'Report already closed', { reason: 'STALE_DECISION', state: 'closed' })
  await request('POST', `/admin/reports/${enc(reportId)}/decision`, { body: { decision: outcome, expected_version: version, reason }, auth: true })
  reportVersions.delete(reportId)
}

const NOTIFICATION_KIND: Partial<Record<WNotification['type'], NotificationKind>> = {
  revision_approved: 'approved',
  revision_rejected: 'rejected',
  post_hidden: 'hidden',
  post_restored: 'restored',
  comment_hidden: 'comment_hidden',
}

// ------------------------------------------------------------- the adapter

export const httpForumApi: ForumApi = {
  async listTags() {
    const tags = await catalog(true)
    return tags.map<TagWithCount>(({ tag, published_post_count }) => ({ ...toTag(tag), count: published_post_count })).filter((t) => t.active || t.count > 0)
  },

  async listPosts(query) {
    const rows = await all<WPublicPost>('/posts', 'posts', { q: query.q.trim() || undefined, hashtag: query.tag ?? undefined })
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    const page = Math.min(Math.max(1, query.page), pageCount)
    const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const counts = await Promise.all(slice.map((p) => commentCount(p.id)))
    const items = slice.map<PostSummary>((p, i) => {
      const links = p.links.map((l) => fromWireLink(l))
      return {
        id: p.id,
        author: toAuthor(p.author),
        title: p.title,
        excerpt: excerpt(p.body),
        tags: p.hashtags.map(toTag),
        observationLink: links.find(isEyesLink) ?? null,
        publishedAt: p.published_at,
        editedAt: p.edited_at,
        commentCount: counts[i],
      }
    })
    return { items, page, pageCount, total: rows.length }
  },

  async getPost(id) {
    const ws = await workspaceIfAllowed(id)
    if (!ws) {
      const p = await publicPost(id)
      const tags = new Map(p.hashtags.map((t) => [t.id, toTag(t)]))
      return {
        id: p.id,
        author: toAuthor(p.author),
        visibility: 'published',
        published: {
          revisionId: p.published_revision_id,
          title: p.title,
          body: p.body,
          tagIds: p.hashtags.map((t) => t.id),
          links: p.links.map((l) => fromWireLink(l)),
          tags: [...tags.values()],
        },
        publishedAt: p.published_at,
        editedAt: p.edited_at,
        commentCount: await commentCount(p.id),
        isMine: me()?.id === p.author.id,
        working: null,
        hiddenReason: null,
      } satisfies PostView
    }
    const [tags, working, comments] = await Promise.all([
      tagMap(ws.hashtags),
      openRevision(ws),
      ws.post.visibility === 'published' ? commentCount(id) : Promise.resolve(0),
    ])
    return {
      id: ws.post.id,
      author: toAuthor(ws.post.author),
      visibility: ws.post.visibility,
      published: ws.published_revision ? toPublished(ws.published_revision, tags) : null,
      publishedAt: ws.post.published_at,
      editedAt: ws.post.edited_at,
      commentCount: comments,
      isMine: me()?.id === ws.post.author.id,
      working: working ? toRevisionView(working, tags) : null,
      hiddenReason: hiddenReasonOf(ws.post),
    } satisfies PostView
  },

  async listComments(postId) {
    const rows = await all<WComment>(`/posts/${enc(postId)}/comments`, 'comments')
    const uid = me()?.id
    // The public list holds visible comments only; hidden ones are reached from reports.
    return rows.map<Comment>((c) => ({ id: c.id, postId: c.post_id, author: toAuthor(c.author), body: c.body, createdAt: c.created_at, isMine: c.author.id === uid, hidden: false }))
  },

  async addComment(postId, body) {
    const send = (observed: string) =>
      request<{ comment: WComment }>('POST', `/posts/${enc(postId)}/comments`, { body: { body: body.trim(), observed_revision_id: observed }, auth: true })
    let post: WPublicPost
    try {
      post = await publicPost(postId)
    } catch (e) {
      if (e instanceof ForumError && e.code === 'NOT_FOUND') throw new ForumError('CONFLICT', 'Post not open for comments', { reason: 'POST_NOT_OPEN' })
      throw e
    }
    let res
    try {
      res = await send(post.published_revision_id)
    } catch (e) {
      if (e instanceof ForumError && e.code === 'NOT_FOUND') throw new ForumError('CONFLICT', 'Post not open for comments', { reason: 'POST_NOT_OPEN' })
      // The post got a newer approved version while the page was open: comment on the current one.
      if (hasBackendReason(e, 'STALE_REVISION')) res = await send((await publicPost(postId)).published_revision_id)
      else throw e
    }
    const c = res.data.comment
    return { id: c.id, postId: c.post_id, author: toAuthor(c.author), body: c.body, createdAt: c.created_at, isMine: true, hidden: false }
  },

  async report(input) {
    const errs = validateReason(input.reason)
    if (errs.code || errs.note) throw validationError(errs)
    const note = input.reason.note.trim()
    const code = reportCode(input.reason.code)
    const res = await request('POST', '/reports', {
      body: { target_type: input.targetType, target_id: input.targetId, reason_code: code, description: code === 'other' ? encodeReason(input.reason) : note },
      auth: true,
    })
    // 201 = new report, 200 = this person already has an open report on it (AC13).
    return { duplicate: res.status === 200 }
  },

  async myPosts() {
    const items = await all<WWorkspace>('/me/posts', 'items', {}, true)
    const tags = await tagMap(items.flatMap((w) => w.hashtags))
    return Promise.all(
      items.map<Promise<MyPostSummary>>(async (ws) => {
        const [working, comments] = await Promise.all([openRevision(ws), ws.post.visibility === 'published' ? commentCount(ws.post.id) : Promise.resolve(0)])
        const open = working && working.status !== 'approved' ? working : null
        return {
          id: ws.post.id,
          title: (ws.published_revision ?? open)?.title || 'Untitled draft',
          visibility: ws.post.visibility,
          group: groupOf(ws.post.visibility, open),
          working: open ? toRevisionView(open, tags) : null,
          hiddenReason: hiddenReasonOf(ws.post),
          publishedAt: ws.post.published_at,
          updatedAt: [ws.post.updated_at, open?.updated_at].filter(Boolean).sort().at(-1)!,
          commentCount: comments,
        }
      }),
    )
  },

  async notifications() {
    const rows = (await get<{ notifications: WNotification[] }>('/me/notifications', { query: { limit: 20 }, auth: true })).notifications
    const shown = rows.filter((n) => NOTIFICATION_KIND[n.type])
    const titles = new Map<string, Promise<WWorkspace | null>>()
    const ws = (postId: string) => {
      if (!titles.has(postId)) titles.set(postId, workspace(postId).catch(() => null))
      return titles.get(postId)!
    }
    return Promise.all(
      shown.map<Promise<ForumNotification>>(async (n) => {
        const w = await ws(n.post_id)
        let reason: ModerationReason | null = null
        if (n.type === 'revision_rejected' && n.revision_id) reason = decodeReason((await revision(n.post_id, n.revision_id).catch(() => null))?.rejection_reason)
        else if (n.type === 'post_hidden' && w) reason = hiddenReasonOf(w.post)
        else if (n.type === 'comment_hidden' && n.comment_id) reason = decodeReason((await commentWorkspace(n.comment_id).catch(() => null))?.visibility_reason?.reason)
        return {
          id: n.id,
          kind: NOTIFICATION_KIND[n.type]!,
          postId: n.post_id,
          title: (w?.published_revision ?? w?.working_revision)?.title || 'Your post',
          reason,
          createdAt: n.created_at,
          read: n.read_at !== null,
        }
      }),
    )
  },

  async markNotificationsRead() {
    const unread = (await get<{ notifications: WNotification[] }>('/me/notifications', { query: { unread: true, limit: LIMIT }, auth: true })).notifications
    await Promise.all(unread.map((n) => request('PATCH', `/me/notifications/${enc(n.id)}`, { body: { read: true }, auth: true })))
  },

  async getEditor(postId) {
    const ws = await workspace(postId)
    if (ws.post.author.id !== me()?.id) throw new ForumError('NOT_FOUND', 'Post not found')
    const [tags, open] = await Promise.all([tagMap(ws.hashtags), openRevision(ws)])
    const source = open ?? ws.published_revision
    if (!source) throw new ForumError('NOT_FOUND', 'Post not found')
    const view = toRevisionView(source, tags)
    return {
      postId,
      mode: ws.published_revision ? 'edit' : 'draft',
      content: { title: view.title, body: view.body, tagIds: view.tagIds, links: view.links },
      lockedBy: open?.status === 'pending' ? view : null,
      hasPublishedVersion: Boolean(ws.published_revision),
      lastRejection: open?.status === 'rejected' ? view.reason : null,
    } satisfies EditorData
  },

  async saveDraft({ postId, content, clientKey }) {
    const errs = validateDraft(content)
    if (hasErrors(errs)) throw validationError({ title: errs.title, body: errs.body, tags: errs.tags, links: errs.links?.find(Boolean) })
    return saved(await upsertDraft(postId, content, clientKey))
  },

  async submit({ postId, content, clientKey }) {
    if (!me()?.displayName) throw new ForumError('VALIDATION', 'Display name required', { reason: 'NO_DISPLAY_NAME' })
    const active = new Set((await catalog(true)).filter(({ tag }) => tag.active).map(({ tag }) => tag.id))
    const errs = validatePost(content, active)
    if (hasErrors(errs)) {
      if (errs.tags && content.tagIds.some((id) => !active.has(id))) throw new ForumError('VALIDATION', 'Inactive tag', { reason: 'INACTIVE_TAG', fields: { tags: errs.tags } })
      throw validationError({ title: errs.title, body: errs.body, tags: errs.tags, links: errs.links?.find(Boolean) })
    }
    // Double click / retry: the same content already waiting counts as success (BA §7).
    if (postId) {
      const current = await workspace(postId)
      const w = current.working_revision
      if (w?.status === 'pending' && sameContent(w, content)) return saved(current)
    }
    const ws = await upsertDraft(postId, content, clientKey)
    const draft = ws.working_revision!
    const res = await request<{ workspace: WWorkspace }>('POST', `/posts/${enc(ws.post.id)}/revisions/${enc(draft.id)}/submission`, {
      body: { expected_revision_version: draft.version, expected_post_version: ws.post.version },
      auth: true,
    })
    return saved(res.data.workspace)
  },

  async withdraw(postId, revisionId) {
    const ws = await workspace(postId)
    const w = ws.working_revision
    if (!w || w.id !== revisionId || w.status !== 'pending') {
      const r = await revision(postId, revisionId)
      throw new ForumError('CONFLICT', 'Already decided', { reason: 'STALE_DECISION', state: r.status })
    }
    await request('POST', `/posts/${enc(postId)}/revisions/${enc(revisionId)}/withdrawal`, {
      body: { expected_revision_version: w.version, expected_post_version: ws.post.version },
      auth: true,
    })
  },

  // ----------------------------------------------------------- admin

  async moderationCounts() {
    const [queue, reports] = await Promise.all([reviews(), openReports()])
    return { queue: queue.length, reports: reports.length } satisfies ModerationCounts
  },

  async queue() {
    const items = await reviews()
    return items.map<QueueItem>((it) => {
      const r = it.submitted_revision
      const byId = new Map(it.hashtags.map((t) => [t.id, t]))
      return {
        revisionId: r.id,
        postId: it.post.id,
        title: r.title,
        author: toAuthor(it.post.author),
        kind: it.published_revision ? 'edit' : 'first',
        submittedAt: r.submitted_at!,
        postVisibility: it.post.visibility,
        inactiveTags: r.hashtag_ids.map((id) => byId.get(id)).filter((t): t is WTag => Boolean(t && !t.active)).map(toTag),
      }
    })
  },

  async getSubmission(revisionId) {
    const postId = await postIdFor(revisionId)
    const [ws, rev] = await Promise.all([workspace(postId), revision(postId, revisionId)])
    const tags = await tagMap(ws.hashtags)
    return {
      revision: toRevisionView(rev, tags),
      post: { id: ws.post.id, author: toAuthor(ws.post.author), visibility: ws.post.visibility, publishedAt: ws.post.published_at },
      published: ws.published_revision && ws.published_revision.id !== rev.id ? toPublished(ws.published_revision, tags) : null,
    } satisfies Submission
  },

  async approve(revisionId) {
    await decide(revisionId, { decision: 'approve' })
  },

  async reject(revisionId, reason) {
    const errs = validateReason(reason)
    if (errs.code || errs.note) throw validationError(errs)
    await decide(revisionId, { decision: 'reject', reason_code: rejectCode(reason.code), reason: encodeReason(reason) })
  },

  async reports() {
    const open = await openReports()
    const targets = new Map<string, Promise<{ postId: string; postTitle: string; excerpt: string; author: { id: string; displayName: string }; hidden: boolean } | null>>()
    const describe = (type: 'post' | 'comment', id: string) => {
      if (!targets.has(id)) {
        targets.set(
          id,
          (async () => {
            try {
              if (type === 'post') {
                const ws = await workspace(id)
                const r = ws.published_revision ?? ws.working_revision
                return { postId: id, postTitle: r?.title || 'Untitled', excerpt: excerpt(r?.body ?? '', 240), author: toAuthor(ws.post.author), hidden: ws.post.visibility === 'hidden' }
              }
              const c = await commentWorkspace(id)
              const ws = await workspace(c.comment.post_id).catch(() => null)
              return {
                postId: c.comment.post_id,
                postTitle: (ws?.published_revision ?? ws?.working_revision)?.title || 'Untitled',
                excerpt: excerpt(c.comment.body, 240),
                author: toAuthor(c.comment.author),
                hidden: c.visibility === 'hidden',
              }
            } catch (e) {
              if (e instanceof ForumError && e.code === 'NOT_FOUND') return null
              throw e
            }
          })(),
        )
      }
      return targets.get(id)!
    }
    const rows = await Promise.all(open.map(async (a) => ({ a, t: await describe(a.report.target_type, a.report.target_id) })))
    return rows.map<ReportItem>(({ a, t }) => {
      const r = a.report
      const code = fromReportCode(r.reason_code)
      const reason = code === 'other' ? (decodeReason(r.description) ?? { code, note: '' }) : { code, note: r.description }
      return {
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        postId: t?.postId ?? (r.target_type === 'post' ? r.target_id : ''),
        postTitle: t?.postTitle ?? 'Removed content',
        targetExcerpt: t?.excerpt ?? 'The author deleted this content.',
        targetAuthor: t?.author ?? { id: '', displayName: 'Unknown' },
        targetHidden: t?.hidden ?? true,
        reason,
        openCount: open.filter((x) => x.report.target_id === r.target_id).length,
        createdAt: r.created_at,
      }
    })
  },

  async hiddenContent() {
    // No list endpoint for hidden content: the newest hide/restore audit event per target decides.
    const events = await all<WAuditEvent>('/admin/audit-events', 'events', {}, true)
    const latest = new Map<string, WAuditEvent>()
    for (const e of events) {
      const key = e.action.startsWith('post.') ? `post:${e.post_id}` : e.action.startsWith('comment.') ? `comment:${e.comment_id}` : null
      if (key && /\.(hide|restore)$/.test(e.action) && !latest.has(key)) latest.set(key, e)
    }
    const hidden = [...latest.entries()].filter(([, e]) => e.action.endsWith('.hide'))
    const items = await Promise.all(
      hidden.map(async ([key, e]): Promise<HiddenItem | null> => {
        try {
          if (key.startsWith('post:')) {
            const ws = await workspace(e.post_id!)
            if (ws.post.visibility !== 'hidden') return null
            const r = ws.published_revision
            return { targetType: 'post', targetId: ws.post.id, postId: ws.post.id, title: r?.title || 'Untitled', excerpt: excerpt(r?.body ?? ''), reason: hiddenReasonOf(ws.post) ?? decodeReason(e.reason)!, hiddenAt: ws.post.visibility_reason?.at ?? e.created_at }
          }
          const c = await commentWorkspace(e.comment_id!)
          if (c.visibility !== 'hidden') return null
          const ws = await workspace(c.comment.post_id).catch(() => null)
          return {
            targetType: 'comment',
            targetId: c.comment.id,
            postId: c.comment.post_id,
            title: ws?.published_revision?.title || 'Untitled',
            excerpt: excerpt(c.comment.body),
            reason: decodeReason(c.visibility_reason?.reason ?? e.reason) ?? { code: 'other', note: '' },
            hiddenAt: c.visibility_reason?.at ?? e.created_at,
          }
        } catch (err) {
          if (err instanceof ForumError && err.code === 'NOT_FOUND') return null
          throw err
        }
      }),
    )
    return items.filter((x): x is HiddenItem => x !== null).sort((a, b) => b.hiddenAt.localeCompare(a.hiddenAt))
  },

  async resolveReport(reportId, outcome) {
    await closeReport(reportId, outcome, outcome === 'resolved' ? 'Handled by a moderator.' : 'Dismissed by a moderator: no rule broken.')
  },

  async hide(target, reason) {
    const errs = validateReason(reason)
    if (errs.code || errs.note) throw validationError(errs)
    await setVisibility(target, 'hide', encodeReason(reason))
    // Like the demo: hiding settles the open reports on that content (best effort).
    const open = (await openReports().catch(() => [])).filter((r) => r.report.target_id === target.id)
    await Promise.all(open.map((r) => closeReport(r.report.id, 'resolved', `Content hidden: ${encodeReason(reason)}`).catch(() => undefined)))
  },

  async restore(target) {
    await setVisibility(target, 'restore', 'Restored by a moderator.')
  },

  async allTags() {
    const tags = await catalog(true)
    return tags.map<TagWithCount>(({ tag, published_post_count }) => ({ ...toTag(tag), count: published_post_count }))
  },

  async createTag({ name, slug }) {
    const r = await request<{ hashtag: WTag }>('POST', '/admin/hashtags', { body: { slug: slug || name, display_name: name.trim() }, auth: true })
    tagCache = null
    return toTag(r.data.hashtag)
  },

  async updateTag(id, { name }) {
    const r = await request<{ hashtag: WTag }>('PATCH', `/admin/hashtags/${enc(id)}`, { body: { expected_version: await tagVersion(id), display_name: name.trim() }, auth: true })
    tagCache = null
    return toTag(r.data.hashtag)
  },

  async setTagActive(id, active) {
    const r = await request<{ hashtag: WTag }>('PATCH', `/admin/hashtags/${enc(id)}`, { body: { expected_version: await tagVersion(id), active }, auth: true })
    tagCache = null
    return toTag(r.data.hashtag)
  },
}
