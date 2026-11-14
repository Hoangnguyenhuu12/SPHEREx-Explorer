/**
 * Mock Forum backend. It enforces the business rules from FORUM_BUSINESS_ANALYSIS.md the way the
 * real API must (permissions, revision states, stale decisions, idempotent submit), so the UI is
 * built against errors rather than hidden buttons. Identity comes from the demo session, standing in
 * for a session cookie. Append `?forumMock=slow|error|empty` to a page URL to test loading states.
 */
import { displayNameOf, getSessionUser, type SessionUser } from '../../auth/session'
import type {
  ForumApi,
  HiddenItem,
  ModerationCounts,
  QueueItem,
  ReportItem,
  SaveResult,
  Submission,
} from '../api'
import { PAGE_SIZE } from '../config'
import { ForumError } from '../errors'
import { checkLink, isEyesLink } from '../links'
import { excerpt } from '../markdown'
import type {
  Author,
  Comment,
  EditorData,
  ForumNotification,
  ModerationReason,
  MyPostGroup,
  MyPostSummary,
  PostContent,
  PostSummary,
  PostView,
  PublishedContent,
  RevisionView,
  Tag,
  TagWithCount,
} from '../types'
import { hasErrors, normalizeSlug, validateComment, validateDraft, validatePost, validateReason } from '../validation'
import { loadDb, nextId, saveDb, type ForumDb, type StoredComment, type StoredPost, type StoredRevision } from './store'

// ------------------------------------------------------------- plumbing

type MockMode = 'normal' | 'slow' | 'error' | 'empty'

function mode(): MockMode {
  if (typeof location === 'undefined') return 'normal'
  const m = new URLSearchParams(location.search).get('forumMock')
  return m === 'slow' || m === 'error' || m === 'empty' ? m : 'normal'
}

let baseDelayMs = 250

/** Tests set this to 0. */
export function setMockDelay(ms: number) {
  baseDelayMs = ms
}

async function respond<T>(fn: () => T): Promise<T> {
  const m = mode()
  await new Promise((r) => setTimeout(r, m === 'slow' ? 2500 : baseDelayMs))
  if (m === 'error') throw new ForumError('NETWORK', 'Simulated network failure')
  // Structured clone so callers can never mutate the "server" state.
  return structuredClone(fn())
}

const now = () => new Date().toISOString()

function viewer(): SessionUser | null {
  return getSessionUser()
}

function requireUser(): SessionUser {
  const u = viewer()
  if (!u) throw new ForumError('UNAUTHENTICATED', 'Login required')
  return u
}

function requireAdmin(): SessionUser {
  const u = requireUser()
  if (u.role !== 'admin') throw new ForumError('FORBIDDEN', 'Admin only')
  return u
}

function authorOf(db: ForumDb, userId: string): Author {
  return { id: userId, displayName: db.seedAuthors[userId] ?? displayNameOf(userId) ?? 'Member' }
}

function tagsFor(db: ForumDb, ids: string[]): Tag[] {
  return ids.map((id) => db.tags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t))
}

function rev(db: ForumDb, id: string | null): StoredRevision | null {
  return id ? (db.revisions.find((r) => r.id === id) ?? null) : null
}

function findPost(db: ForumDb, id: string): StoredPost | null {
  return db.posts.find((p) => p.id === id) ?? null
}

function canSee(p: StoredPost, u: SessionUser | null): boolean {
  if (p.visibility === 'published') return true
  return Boolean(u && (u.id === p.authorId || u.role === 'admin'))
}

/** Revisions that are not the approved public version. */
function workingRevision(db: ForumDb, p: StoredPost): StoredRevision | null {
  const r = rev(db, p.workingRevisionId)
  return r && r.state !== 'approved' ? r : null
}

function toRevisionView(db: ForumDb, r: StoredRevision): RevisionView {
  return {
    id: r.id,
    number: r.number,
    state: r.state,
    title: r.title,
    body: r.body,
    tagIds: r.tagIds,
    links: r.links,
    tags: tagsFor(db, r.tagIds),
    updatedAt: r.updatedAt,
    submittedAt: r.submittedAt,
    decidedAt: r.decidedAt,
    reason: r.reason,
  }
}

function toPublished(db: ForumDb, r: StoredRevision): PublishedContent {
  return { revisionId: r.id, title: r.title, body: r.body, tagIds: r.tagIds, links: r.links, tags: tagsFor(db, r.tagIds) }
}

function visibleComments(db: ForumDb, postId: string): StoredComment[] {
  return db.comments.filter((c) => c.postId === postId && !c.hidden)
}

function audit(db: ForumDb, e: { actorId: string; action: string; postId?: string | null; revisionId?: string | null; targetId?: string | null; reason?: ModerationReason | null; before?: string | null; after?: string | null }) {
  db.audit.push({
    id: nextId(db, 'aud'),
    at: now(),
    postId: null,
    revisionId: null,
    targetId: null,
    reason: null,
    before: null,
    after: null,
    ...e,
  })
}

function notify(db: ForumDb, userId: string, kind: ForumNotification['kind'], postId: string, title: string, reason: ModerationReason | null = null) {
  if (userId.startsWith('seed_')) return
  db.notifications.push({ id: nextId(db, 'ntf'), userId, kind, postId, title, reason, createdAt: now(), read: false })
}

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function cleanContent(c: PostContent): PostContent {
  return {
    title: c.title.trim(),
    body: c.body.replace(/\s+$/g, ''),
    tagIds: [...new Set(c.tagIds)],
    // Store links in canonical form: Eyes links become relative "/the-eyes?…" paths.
    links: c.links
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const r = checkLink(l)
        return r.ok ? r.href : l
      }),
  }
}

function sameContent(a: PostContent, b: PostContent): boolean {
  return JSON.stringify(cleanContent(a)) === JSON.stringify(cleanContent(b))
}

function validationError(fields: Record<string, string | undefined>): ForumError {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Record<string, string>
  return new ForumError('VALIDATION', 'Invalid input', { fields: clean })
}

// ------------------------------------------------------------- authoring helpers

function ownPost(db: ForumDb, postId: string, u: SessionUser): StoredPost {
  const p = findPost(db, postId)
  // Someone else's post looks the same as a missing one (AC11).
  if (!p || p.authorId !== u.id) throw new ForumError('NOT_FOUND', 'Post not found')
  return p
}

/** Create or update the editable draft for a post; returns the draft revision. */
function upsertDraft(db: ForumDb, u: SessionUser, postId: string | null, content: PostContent, clientKey: string): StoredRevision {
  const at = now()
  const c = cleanContent(content)
  let post: StoredPost | null = null
  if (postId) post = ownPost(db, postId, u)
  else post = db.posts.find((p) => p.clientKey === clientKey && p.authorId === u.id) ?? null

  if (!post) {
    post = {
      id: nextId(db, 'post'),
      authorId: u.id,
      visibility: 'unpublished',
      createdAt: at,
      updatedAt: at,
      publishedAt: null,
      editedAt: null,
      currentRevisionId: null,
      workingRevisionId: null,
      hidden: null,
      clientKey,
    }
    db.posts.push(post)
  }

  const working = workingRevision(db, post)
  if (working?.state === 'pending') throw new ForumError('CONFLICT', 'Pending revision is locked', { reason: 'PENDING_LOCK' })
  if (working?.state === 'draft') {
    Object.assign(working, c, { updatedAt: at })
    post.updatedAt = at
    return working
  }
  // No draft yet, or the last submission was rejected/withdrawn: keep that snapshot, start a new one.
  const number = Math.max(0, ...db.revisions.filter((r) => r.postId === post.id).map((r) => r.number)) + 1
  const draft: StoredRevision = {
    id: nextId(db, 'rev'),
    postId: post.id,
    number,
    state: 'draft',
    basedOnRevisionId: post.currentRevisionId,
    ...c,
    createdAt: at,
    updatedAt: at,
    submittedAt: null,
    decidedAt: null,
    decidedBy: null,
    reason: null,
  }
  db.revisions.push(draft)
  post.workingRevisionId = draft.id
  post.updatedAt = at
  return draft
}

function groupOf(p: StoredPost, working: StoredRevision | null): MyPostGroup {
  if (p.visibility === 'hidden' || working?.state === 'rejected') return 'action'
  if (working?.state === 'pending') return 'review'
  if (working && (working.state === 'draft' || working.state === 'withdrawn')) return 'draft'
  return 'published'
}

function decide(db: ForumDb, revisionId: string): { r: StoredRevision; post: StoredPost } {
  const r = rev(db, revisionId)
  if (!r) throw new ForumError('NOT_FOUND', 'Submission not found')
  const post = findPost(db, r.postId)!
  if (r.state !== 'pending') {
    throw new ForumError('CONFLICT', 'Already decided', {
      reason: 'STALE_DECISION',
      state: r.state,
      by: r.state === 'withdrawn' ? 'the author' : r.decidedBy ? authorOf(db, r.decidedBy).displayName : null,
    })
  }
  return { r, post }
}

// ------------------------------------------------------------- the adapter

export const mockForumApi: ForumApi = {
  listTags: () =>
    respond(() => {
      const db = loadDb()
      return tagCounts(db).filter((t) => t.active || t.count > 0)
    }),

  listPosts: (query) =>
    respond(() => {
      const db = loadDb()
      const empty = mode() === 'empty'
      const q = fold(query.q.trim())
      const tag = query.tag ? db.tags.find((t) => t.slug === query.tag) : null
      const rows = db.posts
        .filter((p) => !empty && p.visibility === 'published' && p.currentRevisionId)
        .map((p) => ({ p, r: rev(db, p.currentRevisionId)! }))
        .filter(({ r }) => (query.tag ? Boolean(tag && r.tagIds.includes(tag.id)) : true))
        .filter(({ r }) => (q ? fold(`${r.title}\n${r.body}`).includes(q) : true))
        .sort((a, b) => (b.p.publishedAt ?? '').localeCompare(a.p.publishedAt ?? ''))
      const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
      const page = Math.min(Math.max(1, query.page), pageCount)
      const items: PostSummary[] = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ p, r }) => ({
        id: p.id,
        author: authorOf(db, p.authorId),
        title: r.title,
        excerpt: excerpt(r.body),
        tags: tagsFor(db, r.tagIds),
        observationLink: r.links.find(isEyesLink) ?? null,
        publishedAt: p.publishedAt!,
        editedAt: p.editedAt,
        commentCount: visibleComments(db, p.id).length,
      }))
      return { items, page, pageCount, total: rows.length }
    }),

  getPost: (id) =>
    respond(() => {
      const db = loadDb()
      const u = viewer()
      const p = findPost(db, id)
      if (!p || !canSee(p, u)) throw new ForumError('NOT_FOUND', 'Post not found')
      const privileged = Boolean(u && (u.id === p.authorId || u.role === 'admin'))
      const current = rev(db, p.currentRevisionId)
      const working = privileged ? workingRevision(db, p) : null
      const view: PostView = {
        id: p.id,
        author: authorOf(db, p.authorId),
        visibility: p.visibility,
        published: current ? toPublished(db, current) : null,
        publishedAt: p.publishedAt,
        editedAt: p.editedAt,
        commentCount: visibleComments(db, p.id).length,
        isMine: Boolean(u && u.id === p.authorId),
        working: working ? toRevisionView(db, working) : null,
        hiddenReason: privileged ? (p.hidden?.reason ?? null) : null,
      }
      return view
    }),

  listComments: (postId) =>
    respond(() => {
      const db = loadDb()
      const u = viewer()
      const p = findPost(db, postId)
      if (!p || !canSee(p, u)) throw new ForumError('NOT_FOUND', 'Post not found')
      const admin = u?.role === 'admin'
      return db.comments
        .filter((c) => c.postId === postId && (admin || !c.hidden))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map<Comment>((c) => ({
          id: c.id,
          postId: c.postId,
          author: authorOf(db, c.authorId),
          body: c.body,
          createdAt: c.createdAt,
          isMine: Boolean(u && u.id === c.authorId),
          hidden: Boolean(c.hidden),
        }))
    }),

  addComment: (postId, body) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      if (!u.displayName) throw new ForumError('VALIDATION', 'Display name required', { reason: 'NO_DISPLAY_NAME' })
      const p = findPost(db, postId)
      if (!p || !canSee(p, u)) throw new ForumError('NOT_FOUND', 'Post not found')
      // Checked at send time, even if the page was opened while the post was public (AC08).
      if (p.visibility !== 'published') throw new ForumError('CONFLICT', 'Post not open for comments', { reason: 'POST_NOT_OPEN' })
      const err = validateComment(body)
      if (err) throw validationError({ body: err })
      const c: StoredComment = {
        id: nextId(db, 'cmt'),
        postId,
        authorId: u.id,
        body: body.trim(),
        createdAt: now(),
        revisionId: p.currentRevisionId,
        hidden: null,
      }
      db.comments.push(c)
      saveDb(db)
      return { id: c.id, postId, author: authorOf(db, u.id), body: c.body, createdAt: c.createdAt, isMine: true, hidden: false }
    }),

  report: (input) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      const errs = validateReason(input.reason)
      if (errs.code || errs.note) throw validationError(errs)
      let postId: string
      if (input.targetType === 'post') {
        const p = findPost(db, input.targetId)
        if (!p || p.visibility !== 'published') throw new ForumError('NOT_FOUND', 'Post not found')
        postId = p.id
      } else {
        const c = db.comments.find((x) => x.id === input.targetId)
        const p = c ? findPost(db, c.postId) : null
        if (!c || c.hidden || !p || p.visibility !== 'published') throw new ForumError('NOT_FOUND', 'Comment not found')
        postId = p.id
      }
      // One open report per person and target (AC13).
      const existing = db.reports.find((r) => r.reporterId === u.id && r.targetId === input.targetId && r.state === 'open')
      if (existing) return { duplicate: true }
      db.reports.push({
        id: nextId(db, 'rep'),
        targetType: input.targetType,
        targetId: input.targetId,
        postId,
        reporterId: u.id,
        reason: { code: input.reason.code, note: input.reason.note.trim() },
        state: 'open',
        createdAt: now(),
        closedAt: null,
        closedBy: null,
      })
      saveDb(db)
      return { duplicate: false }
    }),

  myPosts: () =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      return db.posts
        .filter((p) => p.authorId === u.id)
        .map<MyPostSummary>((p) => {
          const working = workingRevision(db, p)
          const current = rev(db, p.currentRevisionId)
          return {
            id: p.id,
            title: (current ?? working)?.title || 'Untitled draft',
            visibility: p.visibility,
            group: groupOf(p, working),
            working: working ? toRevisionView(db, working) : null,
            hiddenReason: p.hidden?.reason ?? null,
            publishedAt: p.publishedAt,
            updatedAt: [p.updatedAt, working?.decidedAt, p.hidden?.at].filter(Boolean).sort().at(-1)!,
            commentCount: visibleComments(db, p.id).length,
          }
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }),

  notifications: () =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      return db.notifications.filter((n) => n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
    }),

  markNotificationsRead: () =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      for (const n of db.notifications) if (n.userId === u.id) n.read = true
      saveDb(db)
    }),

  getEditor: (postId) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      const p = ownPost(db, postId, u)
      const working = workingRevision(db, p)
      const current = rev(db, p.currentRevisionId)
      const source = working ?? current
      if (!source) throw new ForumError('NOT_FOUND', 'Post not found')
      const data: EditorData = {
        postId: p.id,
        mode: current ? 'edit' : 'draft',
        content: { title: source.title, body: source.body, tagIds: source.tagIds, links: source.links },
        lockedBy: working?.state === 'pending' ? toRevisionView(db, working) : null,
        hasPublishedVersion: Boolean(current),
        lastRejection: working?.state === 'rejected' ? working.reason : null,
      }
      return data
    }),

  saveDraft: ({ postId, content, clientKey }) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      const errs = validateDraft(content)
      if (hasErrors(errs)) throw validationError({ title: errs.title, body: errs.body, tags: errs.tags, links: errs.links?.find(Boolean) })
      const draft = upsertDraft(db, u, postId, content, clientKey)
      saveDb(db)
      return { postId: draft.postId, revisionId: draft.id, savedAt: draft.updatedAt } satisfies SaveResult
    }),

  submit: ({ postId, content, clientKey }) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      if (!u.displayName) throw new ForumError('VALIDATION', 'Display name required', { reason: 'NO_DISPLAY_NAME' })
      const active = new Set(db.tags.filter((t) => t.active).map((t) => t.id))
      const errs = validatePost(content, active)
      if (hasErrors(errs)) {
        const inactive = errs.tags && content.tagIds.some((id) => !active.has(id))
        if (inactive) throw new ForumError('VALIDATION', 'Inactive tag', { reason: 'INACTIVE_TAG', fields: { tags: errs.tags! } })
        throw validationError({ title: errs.title, body: errs.body, tags: errs.tags, links: errs.links?.find(Boolean) })
      }
      // Double click / retry: the same content already waiting counts as success, not a duplicate (BA §7).
      const existing = postId ? ownPost(db, postId, u) : (db.posts.find((p) => p.clientKey === clientKey && p.authorId === u.id) ?? null)
      if (existing) {
        const w = workingRevision(db, existing)
        if (w?.state === 'pending' && sameContent(w, content)) return { postId: existing.id, revisionId: w.id, savedAt: w.updatedAt }
      }
      const draft = upsertDraft(db, u, existing?.id ?? postId, content, clientKey)
      const at = now()
      draft.state = 'pending'
      draft.submittedAt = at
      draft.updatedAt = at
      audit(db, { actorId: u.id, action: 'submit', postId: draft.postId, revisionId: draft.id, before: 'draft', after: 'pending' })
      saveDb(db)
      return { postId: draft.postId, revisionId: draft.id, savedAt: at }
    }),

  withdraw: (postId, revisionId) =>
    respond(() => {
      const db = loadDb()
      const u = requireUser()
      const p = ownPost(db, postId, u)
      const r = rev(db, revisionId)
      if (!r || r.postId !== p.id) throw new ForumError('NOT_FOUND', 'Submission not found')
      if (r.state !== 'pending') throw new ForumError('CONFLICT', 'Already decided', { reason: 'STALE_DECISION', state: r.state })
      r.state = 'withdrawn'
      r.updatedAt = now()
      p.updatedAt = r.updatedAt
      audit(db, { actorId: u.id, action: 'withdraw', postId: p.id, revisionId: r.id, before: 'pending', after: 'withdrawn' })
      saveDb(db)
    }),

  // ----------------------------------------------------------- admin

  moderationCounts: () =>
    respond<ModerationCounts>(() => {
      const db = loadDb()
      requireAdmin()
      return { queue: db.revisions.filter((r) => r.state === 'pending').length, reports: db.reports.filter((r) => r.state === 'open').length }
    }),

  queue: () =>
    respond(() => {
      const db = loadDb()
      requireAdmin()
      return db.revisions
        .filter((r) => r.state === 'pending')
        .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
        .map<QueueItem>((r) => {
          const p = findPost(db, r.postId)!
          return {
            revisionId: r.id,
            postId: p.id,
            title: r.title,
            author: authorOf(db, p.authorId),
            kind: p.currentRevisionId ? 'edit' : 'first',
            submittedAt: r.submittedAt!,
            postVisibility: p.visibility,
            inactiveTags: tagsFor(db, r.tagIds).filter((t) => !t.active),
          }
        })
    }),

  getSubmission: (revisionId) =>
    respond<Submission>(() => {
      const db = loadDb()
      requireAdmin()
      const r = rev(db, revisionId)
      if (!r) throw new ForumError('NOT_FOUND', 'Submission not found')
      const p = findPost(db, r.postId)!
      const current = rev(db, p.currentRevisionId)
      return {
        revision: toRevisionView(db, r),
        post: { id: p.id, author: authorOf(db, p.authorId), visibility: p.visibility, publishedAt: p.publishedAt },
        published: current ? toPublished(db, current) : null,
      }
    }),

  approve: (revisionId) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const { r, post } = decide(db, revisionId)
      const inactive = tagsFor(db, r.tagIds).filter((t) => !t.active)
      if (inactive.length) throw new ForumError('VALIDATION', 'Inactive tag', { reason: 'INACTIVE_TAG' })
      const at = now()
      const before = post.visibility
      const isEdit = Boolean(post.currentRevisionId)
      r.state = 'approved'
      r.decidedAt = at
      r.decidedBy = a.id
      post.currentRevisionId = r.id
      post.workingRevisionId = null
      post.updatedAt = at
      if (isEdit) post.editedAt = at
      else post.publishedAt = at
      // Approving an edit never un-hides a hidden post (AC09).
      if (post.visibility === 'unpublished') post.visibility = 'published'
      audit(db, { actorId: a.id, action: isEdit ? 'approve_edit' : 'approve', postId: post.id, revisionId: r.id, before, after: post.visibility })
      notify(db, post.authorId, 'approved', post.id, r.title)
      saveDb(db)
    }),

  reject: (revisionId, reason) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const errs = validateReason(reason)
      if (errs.code || errs.note) throw validationError(errs)
      const { r, post } = decide(db, revisionId)
      const at = now()
      r.state = 'rejected'
      r.decidedAt = at
      r.decidedBy = a.id
      r.reason = { code: reason.code, note: reason.note.trim() }
      post.updatedAt = at
      audit(db, { actorId: a.id, action: 'reject', postId: post.id, revisionId: r.id, reason: r.reason, before: 'pending', after: 'rejected' })
      notify(db, post.authorId, 'rejected', post.id, r.title, r.reason)
      saveDb(db)
    }),

  reports: () =>
    respond(() => {
      const db = loadDb()
      requireAdmin()
      const open = db.reports.filter((r) => r.state === 'open')
      return open
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map<ReportItem>((r) => {
          const p = findPost(db, r.postId)!
          const current = rev(db, p.currentRevisionId)
          const c = r.targetType === 'comment' ? db.comments.find((x) => x.id === r.targetId) : null
          return {
            id: r.id,
            targetType: r.targetType,
            targetId: r.targetId,
            postId: p.id,
            postTitle: current?.title ?? 'Untitled',
            targetExcerpt: excerpt(c ? c.body : (current?.body ?? ''), 240),
            targetAuthor: authorOf(db, c ? c.authorId : p.authorId),
            targetHidden: Boolean(c ? c.hidden : p.visibility === 'hidden'),
            reason: r.reason,
            openCount: open.filter((x) => x.targetId === r.targetId).length,
            createdAt: r.createdAt,
          }
        })
    }),

  hiddenContent: () =>
    respond(() => {
      const db = loadDb()
      requireAdmin()
      const posts: HiddenItem[] = db.posts
        .filter((p) => p.visibility === 'hidden' && p.hidden)
        .map((p) => {
          const r = rev(db, p.currentRevisionId)
          return { targetType: 'post', targetId: p.id, postId: p.id, title: r?.title ?? 'Untitled', excerpt: excerpt(r?.body ?? ''), reason: p.hidden!.reason, hiddenAt: p.hidden!.at }
        })
      const comments: HiddenItem[] = db.comments
        .filter((c) => c.hidden)
        .map((c) => {
          const p = findPost(db, c.postId)
          const r = p ? rev(db, p.currentRevisionId) : null
          return { targetType: 'comment', targetId: c.id, postId: c.postId, title: r?.title ?? 'Untitled', excerpt: excerpt(c.body), reason: c.hidden!.reason, hiddenAt: c.hidden!.at }
        })
      return [...posts, ...comments].sort((a, b) => b.hiddenAt.localeCompare(a.hiddenAt))
    }),

  resolveReport: (reportId, outcome) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const r = db.reports.find((x) => x.id === reportId)
      if (!r) throw new ForumError('NOT_FOUND', 'Report not found')
      if (r.state !== 'open') throw new ForumError('CONFLICT', 'Already closed', { reason: 'STALE_DECISION', state: r.state })
      r.state = outcome
      r.closedAt = now()
      r.closedBy = a.id
      audit(db, { actorId: a.id, action: `report_${outcome}`, postId: r.postId, targetId: r.targetId, before: 'open', after: outcome })
      saveDb(db)
    }),

  hide: (target, reason) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const errs = validateReason(reason)
      if (errs.code || errs.note) throw validationError(errs)
      const hidden = { reason: { code: reason.code, note: reason.note.trim() }, at: now(), by: a.id }
      let postId: string
      let authorId: string
      let title: string
      if (target.type === 'post') {
        const p = findPost(db, target.id)
        if (!p) throw new ForumError('NOT_FOUND', 'Post not found')
        if (p.visibility === 'hidden') throw new ForumError('CONFLICT', 'Already hidden', { reason: 'STALE_DECISION', state: 'hidden' })
        if (p.visibility !== 'published') throw new ForumError('CONFLICT', 'Not published', { reason: 'STALE_DECISION', state: p.visibility })
        p.visibility = 'hidden'
        p.hidden = hidden
        postId = p.id
        authorId = p.authorId
        title = rev(db, p.currentRevisionId)?.title ?? ''
      } else {
        const c = db.comments.find((x) => x.id === target.id)
        if (!c) throw new ForumError('NOT_FOUND', 'Comment not found')
        if (c.hidden) throw new ForumError('CONFLICT', 'Already hidden', { reason: 'STALE_DECISION', state: 'hidden' })
        c.hidden = hidden
        postId = c.postId
        authorId = c.authorId
        title = rev(db, findPost(db, c.postId)?.currentRevisionId ?? null)?.title ?? ''
      }
      for (const r of db.reports) {
        if (r.targetId === target.id && r.state === 'open') {
          r.state = 'resolved'
          r.closedAt = hidden.at
          r.closedBy = a.id
        }
      }
      audit(db, { actorId: a.id, action: `hide_${target.type}`, postId, targetId: target.id, reason: hidden.reason, before: 'visible', after: 'hidden' })
      notify(db, authorId, target.type === 'post' ? 'hidden' : 'comment_hidden', postId, title, hidden.reason)
      saveDb(db)
    }),

  restore: (target) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      if (target.type === 'post') {
        const p = findPost(db, target.id)
        if (!p) throw new ForumError('NOT_FOUND', 'Post not found')
        if (p.visibility !== 'hidden') throw new ForumError('CONFLICT', 'Not hidden', { reason: 'STALE_DECISION', state: p.visibility })
        p.visibility = 'published'
        p.hidden = null
        audit(db, { actorId: a.id, action: 'restore_post', postId: p.id, targetId: p.id, before: 'hidden', after: 'published' })
        notify(db, p.authorId, 'restored', p.id, rev(db, p.currentRevisionId)?.title ?? '')
      } else {
        const c = db.comments.find((x) => x.id === target.id)
        if (!c) throw new ForumError('NOT_FOUND', 'Comment not found')
        if (!c.hidden) throw new ForumError('CONFLICT', 'Not hidden', { reason: 'STALE_DECISION', state: 'visible' })
        c.hidden = null
        audit(db, { actorId: a.id, action: 'restore_comment', postId: c.postId, targetId: c.id, before: 'hidden', after: 'visible' })
      }
      saveDb(db)
    }),

  allTags: () =>
    respond(() => {
      const db = loadDb()
      requireAdmin()
      return tagCounts(db)
    }),

  createTag: ({ name, slug }) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const clean = normalizeSlug(slug || name)
      const display = name.trim()
      if (display.length < 2 || display.length > 30) throw validationError({ name: 'Use 2–30 characters.' })
      if (clean.length < 2 || clean.length > 30) throw validationError({ slug: 'Use 2–30 letters, numbers or dashes.' })
      if (db.tags.some((t) => t.slug === clean)) throw new ForumError('CONFLICT', 'Slug taken', { reason: 'SLUG_TAKEN' })
      const tag: Tag = { id: nextId(db, 'tag'), slug: clean, name: display, active: true }
      db.tags.push(tag)
      audit(db, { actorId: a.id, action: 'tag_create', targetId: tag.id, after: clean })
      saveDb(db)
      return tag
    }),

  updateTag: (id, { name }) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const tag = db.tags.find((t) => t.id === id)
      if (!tag) throw new ForumError('NOT_FOUND', 'Tag not found')
      const display = name.trim()
      if (display.length < 2 || display.length > 30) throw validationError({ name: 'Use 2–30 characters.' })
      audit(db, { actorId: a.id, action: 'tag_rename', targetId: id, before: tag.name, after: display })
      tag.name = display
      saveDb(db)
      return tag
    }),

  setTagActive: (id, active) =>
    respond(() => {
      const db = loadDb()
      const a = requireAdmin()
      const tag = db.tags.find((t) => t.id === id)
      if (!tag) throw new ForumError('NOT_FOUND', 'Tag not found')
      audit(db, { actorId: a.id, action: active ? 'tag_activate' : 'tag_retire', targetId: id, before: String(tag.active), after: String(active) })
      tag.active = active
      saveDb(db)
      return tag
    }),
}

function tagCounts(db: ForumDb): TagWithCount[] {
  const published = db.posts.filter((p) => p.visibility === 'published').map((p) => rev(db, p.currentRevisionId)!)
  return db.tags.map((t) => ({ ...t, count: published.filter((r) => r.tagIds.includes(t.id)).length }))
}
