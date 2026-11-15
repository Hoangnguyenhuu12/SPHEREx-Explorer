export type ForumErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'NETWORK' | 'UNAVAILABLE'

/** Sub-reasons carried in `details.reason` so the UI can explain conflicts precisely. */
export type ConflictReason =
  | 'STALE_DECISION'
  | 'PENDING_LOCK'
  | 'POST_NOT_OPEN'
  | 'INACTIVE_TAG'
  | 'SLUG_TAKEN'
  | 'NO_DISPLAY_NAME'

export interface ForumErrorDetails {
  reason?: ConflictReason
  /** STALE_DECISION: the state the revision is in now, and who changed it. */
  state?: string
  by?: string | null
  fields?: Record<string, string>
  /** Live backend only: the raw `details.reason` (STALE_VERSION, NO_CHANGE, SELF_REVIEW…). */
  backendReason?: string
}

export class ForumError extends Error {
  readonly code: ForumErrorCode
  readonly details: ForumErrorDetails

  constructor(code: ForumErrorCode, message: string, details: ForumErrorDetails = {}) {
    super(message)
    this.name = 'ForumError'
    this.code = code
    this.details = details
  }
}

export interface ForumErrorCopy {
  title: string
  body: string
  retry: boolean
}

/** UI reads only `code` and `details.reason`; mock/back-end messages are not shown raw. */
export function describeForumError(error: unknown): ForumErrorCopy {
  if (!(error instanceof ForumError)) return { title: 'Something went wrong', body: 'Try again in a moment.', retry: true }
  switch (error.code) {
    case 'NETWORK':
      return { title: 'Could not reach the Forum', body: 'Check your connection and try again.', retry: true }
    case 'UNAVAILABLE':
      return { title: 'The Forum server is not ready', body: 'It may be starting up, which can take about a minute. Try again shortly.', retry: true }
    case 'UNAUTHENTICATED':
      return { title: 'Please log in', body: 'Your session ended. Log in again to continue.', retry: false }
    case 'FORBIDDEN':
      return { title: 'No access', body: 'Your account cannot do this.', retry: false }
    case 'NOT_FOUND':
      return { title: 'Post not found', body: 'It may have been removed, or it is not public.', retry: false }
    case 'VALIDATION':
      if (error.details.reason === 'NO_DISPLAY_NAME') return { title: 'Choose a display name', body: 'Set a public name before posting.', retry: false }
      if (error.details.reason === 'INACTIVE_TAG')
        return { title: 'A topic is no longer available', body: 'Remove the retired topic and choose another.', retry: false }
      return { title: 'Check the highlighted fields', body: 'Some values are not accepted.', retry: false }
    case 'CONFLICT':
      switch (error.details.reason) {
        case 'PENDING_LOCK':
          return { title: 'Waiting for review', body: 'Withdraw the submission before you change it.', retry: false }
        case 'POST_NOT_OPEN':
          return { title: 'Comments are closed', body: 'This post is no longer public, so it cannot take new comments.', retry: false }
        case 'SLUG_TAKEN':
          return { title: 'Topic already exists', body: 'Another topic uses this name. Choose a different one.', retry: false }
        case 'STALE_DECISION':
        default:
          return { title: 'This changed while you were looking', body: 'Reload to see the current status.', retry: true }
      }
  }
}
