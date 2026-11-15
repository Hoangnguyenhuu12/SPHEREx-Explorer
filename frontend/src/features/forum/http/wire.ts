/** forum-v1.1 response shapes (members/dong/app/forum/views.py) and their mapping to UI types. */
import { REASONS, reasonLabel, type ReasonCode } from '../config'
import { checkLink, describeObservation, isEyesLink } from '../links'
import type { Author, ModerationReason, PublishedContent, RevisionState, RevisionView, Tag, Visibility } from '../types'

export interface WAuthor {
  id: string
  display_name: string
}
export interface WTag {
  id: string
  slug: string
  display_name: string
  active: boolean
  version: number
}
export interface WLink {
  label: string
  url: string
}
export interface WRevision {
  id: string
  post_id: string
  number: number
  status: RevisionState
  version: number
  title: string
  body: string
  hashtag_ids: string[]
  links: WLink[]
  created_at: string
  updated_at: string
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  withdrawn_at: string | null
}
export interface WVisibilityReason {
  action: 'hide' | 'restore'
  reason: string
  actor_id: string
  at: string
}
export interface WPostState {
  id: string
  author: WAuthor
  visibility: Visibility
  version: number
  published_revision_id: string | null
  working_revision_id: string | null
  published_at: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
  visibility_reason: WVisibilityReason | null
}
export interface WWorkspace {
  post: WPostState
  published_revision: WRevision | null
  working_revision: WRevision | null
  hashtags: WTag[]
}
export interface WPublicPost {
  id: string
  author: WAuthor
  published_revision_id: string
  title: string
  body: string
  hashtags: WTag[]
  links: WLink[]
  published_at: string
  edited_at: string | null
}
export interface WComment {
  id: string
  post_id: string
  observed_revision_id: string
  author: WAuthor
  body: string
  version: number
  created_at: string
  updated_at: string
}
export interface WModeratedComment {
  comment: WComment
  visibility: 'visible' | 'hidden'
  visibility_reason: WVisibilityReason | null
}
export type WReportReason = 'off_topic' | 'spam' | 'abuse' | 'personal_information' | 'other'
export interface WReport {
  id: string
  target_type: 'post' | 'comment'
  target_id: string
  reason_code: WReportReason
  description: string
  status: 'open' | 'resolved' | 'dismissed'
  version: number
  created_at: string
}
export interface WAdminReport {
  report: WReport
  reporter_id: string
}
export interface WNotification {
  id: string
  type: 'submission_received' | 'revision_approved' | 'revision_rejected' | 'post_hidden' | 'post_restored' | 'comment_hidden' | 'comment_restored'
  post_id: string
  revision_id: string | null
  comment_id: string | null
  created_at: string
  read_at: string | null
}
export interface WReview {
  post: WPostState
  submitted_revision: WRevision
  published_revision: WRevision | null
  hashtags: WTag[]
}
export interface WAuditEvent {
  id: string
  actor_id: string
  action: string
  post_id: string | null
  comment_id: string | null
  reason: string | null
  created_at: string
}
export interface WMe {
  profile: { id: string; display_name: string | null }
  role: 'user' | 'admin'
}

// ------------------------------------------------------------------ mapping

export const toAuthor = (a: WAuthor): Author => ({ id: a.id, displayName: a.display_name })
export const toTag = (t: WTag): Tag => ({ id: t.id, slug: t.slug, name: t.display_name, active: t.active })

/**
 * Moderation reasons travel as text ("[spam] note"), because hide/restore and report decisions only
 * carry a free-text reason. The bracketed code lets the UI show the same label it offered.
 */
export function encodeReason(r: ModerationReason): string {
  const note = r.note.trim()
  return `[${r.code}] ${note || reasonLabel(r.code)}`
}

export function decodeReason(text: string | null | undefined): ModerationReason | null {
  if (!text) return null
  const m = /^\[([a-z_]+)\]\s?([\s\S]*)$/.exec(text)
  const code = m && REASONS.some((r) => r.code === m[1]) ? (m[1] as ReasonCode) : null
  if (!code) return { code: 'other', note: text }
  const note = m![2].trim()
  return { code, note: note === reasonLabel(code) ? '' : note }
}

/** UI reason → rejection reason_code (forum-v1.1 Reject). */
export function rejectCode(code: ReasonCode): string {
  return code === 'abusive' ? 'abuse' : code === 'personal_info' ? 'personal_information' : code
}

/** UI reason → report reason_code; "needs context" has no report code, so it is sent as "other". */
export function reportCode(code: ReasonCode): WReportReason {
  if (code === 'abusive') return 'abuse'
  if (code === 'personal_info') return 'personal_information'
  if (code === 'needs_context') return 'other'
  return code
}

export function fromReportCode(code: WReportReason): ReasonCode {
  return code === 'abuse' ? 'abusive' : code === 'personal_information' ? 'personal_info' : code
}

/** Links are stored absolute (the backend accepts only http(s) URLs); Eyes links come back relative. */
export function toWireLink(href: string, origin: string = location.origin): WLink {
  const checked = checkLink(href, origin)
  const local = checked.ok ? checked.href : href.trim()
  const url = new URL(local, origin).href
  const label = isEyesLink(local) ? (describeObservation(local)?.label ?? 'The Eyes') : new URL(url).host
  return { label: [...label].slice(0, 120).join('') || 'Link', url }
}

export function fromWireLink(l: WLink, origin: string = location.origin): string {
  const checked = checkLink(l.url, origin)
  return checked.ok ? checked.href : l.url
}

export function toRevisionView(r: WRevision, tags: ReadonlyMap<string, Tag>): RevisionView {
  return {
    id: r.id,
    number: r.number,
    state: r.status,
    title: r.title,
    body: r.body,
    tagIds: r.hashtag_ids,
    links: r.links.map((l) => fromWireLink(l)),
    tags: r.hashtag_ids.map((id) => tags.get(id)).filter((t): t is Tag => Boolean(t)),
    updatedAt: r.updated_at,
    submittedAt: r.submitted_at,
    decidedAt: r.reviewed_at ?? r.withdrawn_at,
    reason: r.status === 'rejected' ? decodeReason(r.rejection_reason) : null,
  }
}

export function toPublished(r: WRevision, tags: ReadonlyMap<string, Tag>): PublishedContent {
  const v = toRevisionView(r, tags)
  return { revisionId: r.id, title: v.title, body: v.body, tagIds: v.tagIds, links: v.links, tags: v.tags }
}

export function hiddenReasonOf(post: WPostState): ModerationReason | null {
  return post.visibility === 'hidden' && post.visibility_reason?.action === 'hide' ? decodeReason(post.visibility_reason.reason) : null
}
