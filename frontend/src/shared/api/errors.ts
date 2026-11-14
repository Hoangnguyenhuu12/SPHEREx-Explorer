import type { ErrorCode } from './types'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number | null
  readonly details: unknown

  constructor(code: ErrorCode, message: string, status: number | null = null, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface ErrorCopy {
  title: string
  body: string
  retry: boolean
}

/** UI decisions read only `code`; the backend message is never shown raw. */
export function describeError(error: unknown): ErrorCopy {
  const code: ErrorCode = error instanceof ApiError ? error.code : 'INTERNAL'
  switch (code) {
    case 'BAD_COORDS':
      return { title: 'Coordinates not accepted', body: 'Check the RA and Dec values and try again.', retry: false }
    case 'BAD_PARAM':
      return { title: 'Request not accepted', body: 'One of the settings is outside the allowed range.', retry: false }
    case 'UNKNOWN_TARGET':
      return { title: 'Name not found', body: 'Try another name, or enter RA and Dec instead.', retry: false }
    case 'NO_FRAMES':
      return {
        title: 'No SPHEREx observations here',
        body: 'SPHEREx has no released images for this position and detector yet. Try another detector or target.',
        retry: false,
      }
    case 'FRAME_NOT_FOUND':
      return { title: 'Images expired', body: 'The image service restarted. Reload the observations.', retry: true }
    case 'UPSTREAM_ERROR':
      return { title: 'Archive unavailable', body: 'The NASA archive did not answer correctly. Try again in a moment.', retry: true }
    case 'UPSTREAM_TIMEOUT':
    case 'CLIENT_TIMEOUT':
      return { title: 'The image service is slow', body: 'It may take a minute to wake up. Try again.', retry: true }
    case 'NETWORK':
      return { title: 'Connection problem', body: 'The image service could not be reached.', retry: true }
    case 'NOT_AVAILABLE':
      return { title: 'Not available yet', body: 'This tool needs data the service does not provide yet.', retry: false }
    case 'ABORTED':
      return { title: 'Cancelled', body: 'The request was cancelled.', retry: true }
    default:
      return { title: 'Something went wrong', body: 'An unexpected error occurred.', retry: true }
  }
}

export function isAbort(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === 'ABORTED') ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}
