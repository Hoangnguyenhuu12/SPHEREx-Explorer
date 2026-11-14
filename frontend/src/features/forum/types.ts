import type { ReasonCode } from './config'

/** Workflow state of one submitted content version (BA §6). */
export type RevisionState = 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
/** Whether the post is visible to the public (BA §6, "Ẩn bài"). Separate axis from RevisionState. */
export type Visibility = 'unpublished' | 'published' | 'hidden'

export interface Tag {
  id: string
  slug: string
  name: string
  active: boolean
}

export interface TagWithCount extends Tag {
  /** Published posts only (AC10). */
  count: number
}

export interface Author {
  id: string
  displayName: string
}

export interface ModerationReason {
  code: ReasonCode
  note: string
}

export interface PostContent {
  title: string
  body: string
  tagIds: string[]
  links: string[]
}

export interface RevisionView extends PostContent {
  id: string
  number: number
  state: RevisionState
  tags: Tag[]
  updatedAt: string
  submittedAt: string | null
  decidedAt: string | null
  reason: ModerationReason | null
}

export interface PostSummary {
  id: string
  author: Author
  title: string
  excerpt: string
  tags: Tag[]
  /** First link to The Eyes, if any (shown as a target line in the list). */
  observationLink: string | null
  publishedAt: string
  editedAt: string | null
  commentCount: number
}

export interface PublishedContent extends PostContent {
  revisionId: string
  tags: Tag[]
}

export interface PostView {
  id: string
  author: Author
  visibility: Visibility
  /** The approved, public version. Null until the first approval. */
  published: PublishedContent | null
  publishedAt: string | null
  editedAt: string | null
  commentCount: number
  isMine: boolean
  /** Author/admin only: the newest non-approved revision (draft, pending, rejected, withdrawn). */
  working: RevisionView | null
  /** Author/admin only. */
  hiddenReason: ModerationReason | null
}

export interface Comment {
  id: string
  postId: string
  author: Author
  body: string
  createdAt: string
  isMine: boolean
  /** Admin only: the comment is hidden from the public. */
  hidden: boolean
}

export type MyPostGroup = 'action' | 'review' | 'draft' | 'published'

export interface MyPostSummary {
  id: string
  title: string
  visibility: Visibility
  group: MyPostGroup
  working: RevisionView | null
  hiddenReason: ModerationReason | null
  publishedAt: string | null
  updatedAt: string
  commentCount: number
}

export type NotificationKind = 'approved' | 'rejected' | 'hidden' | 'restored' | 'comment_hidden'

export interface ForumNotification {
  id: string
  kind: NotificationKind
  postId: string
  title: string
  reason: ModerationReason | null
  createdAt: string
  read: boolean
}

export interface Page<T> {
  items: T[]
  page: number
  pageCount: number
  total: number
}

export interface ListQuery {
  q: string
  tag: string | null
  page: number
}

export type EditorMode = 'new' | 'draft' | 'edit'

/** What the editor loads for an existing post. */
export interface EditorData {
  postId: string
  mode: Exclude<EditorMode, 'new'>
  content: PostContent
  /** Pending revisions cannot be edited; the author must withdraw first. */
  lockedBy: RevisionView | null
  /** Set when the post is public, so the editor can explain that readers keep the old version. */
  hasPublishedVersion: boolean
  lastRejection: ModerationReason | null
}

export interface ReportInput {
  targetType: 'post' | 'comment'
  targetId: string
  reason: ModerationReason
}
