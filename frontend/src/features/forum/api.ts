import { config } from '../../app/config'
import { httpForumApi } from './http/httpForumApi'
import { mockForumApi } from './mock/mockForumApi'

export { ForumError, describeForumError, type ConflictReason, type ForumErrorCode, type ForumErrorDetails } from './errors'
import type {
  Author,
  Comment,
  EditorData,
  ForumNotification,
  ListQuery,
  ModerationReason,
  MyPostSummary,
  Page,
  PostContent,
  PostSummary,
  PostView,
  PublishedContent,
  ReportInput,
  RevisionView,
  Tag,
  TagWithCount,
  Visibility,
} from './types'

export interface SaveResult {
  postId: string
  revisionId: string
  savedAt: string
}

export interface QueueItem {
  revisionId: string
  postId: string
  title: string
  author: Author
  kind: 'first' | 'edit'
  submittedAt: string
  postVisibility: Visibility
  inactiveTags: Tag[]
}

export interface Submission {
  revision: RevisionView
  post: { id: string; author: Author; visibility: Visibility; publishedAt: string | null }
  published: PublishedContent | null
}

export interface ReportItem {
  id: string
  targetType: 'post' | 'comment'
  targetId: string
  postId: string
  postTitle: string
  targetExcerpt: string
  targetAuthor: Author
  targetHidden: boolean
  reason: ModerationReason
  /** Open reports on the same target, including this one. */
  openCount: number
  createdAt: string
}

export interface HiddenItem {
  targetType: 'post' | 'comment'
  targetId: string
  postId: string
  title: string
  excerpt: string
  reason: ModerationReason
  hiddenAt: string
}

export interface ModerationCounts {
  queue: number
  reports: number
}

export interface ForumApi {
  // Public (guests allowed)
  listTags(): Promise<TagWithCount[]>
  listPosts(query: ListQuery): Promise<Page<PostSummary>>
  getPost(id: string): Promise<PostView>
  listComments(postId: string): Promise<Comment[]>
  // Members
  addComment(postId: string, body: string): Promise<Comment>
  report(input: ReportInput): Promise<{ duplicate: boolean }>
  myPosts(): Promise<MyPostSummary[]>
  notifications(): Promise<ForumNotification[]>
  markNotificationsRead(): Promise<void>
  getEditor(postId: string): Promise<EditorData>
  /** `clientKey` makes the first save/submit of a new post idempotent (double click, retry). */
  saveDraft(input: { postId: string | null; content: PostContent; clientKey: string }): Promise<SaveResult>
  submit(input: { postId: string | null; content: PostContent; clientKey: string }): Promise<SaveResult>
  withdraw(postId: string, revisionId: string): Promise<void>
  // Admin
  moderationCounts(): Promise<ModerationCounts>
  queue(): Promise<QueueItem[]>
  getSubmission(revisionId: string): Promise<Submission>
  approve(revisionId: string): Promise<void>
  reject(revisionId: string, reason: ModerationReason): Promise<void>
  reports(): Promise<ReportItem[]>
  hiddenContent(): Promise<HiddenItem[]>
  resolveReport(reportId: string, outcome: 'resolved' | 'dismissed'): Promise<void>
  hide(target: { type: 'post' | 'comment'; id: string }, reason: ModerationReason): Promise<void>
  restore(target: { type: 'post' | 'comment'; id: string }): Promise<void>
  allTags(): Promise<TagWithCount[]>
  createTag(input: { name: string; slug: string }): Promise<Tag>
  updateTag(id: string, input: { name: string }): Promise<Tag>
  setTagActive(id: string, active: boolean): Promise<Tag>
}

/**
 * Live backend (Supabase Auth + /api/forum, forum-v1.1) when VITE_FORUM_API=http and its settings are
 * present; otherwise the in-browser demo forum (docs/ui-design/FORUM_API_NEEDS.md).
 */
export const forumApi: ForumApi = config.forumLive ? httpForumApi : mockForumApi

export const USING_DEMO_DATA = !config.forumLive
