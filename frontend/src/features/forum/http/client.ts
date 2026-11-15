/**
 * Transport for /api/forum (forum-v1.1): bearer token, Idempotency-Key on POST, JSON envelopes,
 * and the mapping from backend error codes to the UI's ForumError codes. The UI reads only
 * `code` and `details.reason`, never the backend message.
 */
import { config } from '../../../app/config'
import { accessToken } from '../../auth/supabase'
import { ForumError, type ForumErrorDetails } from '../errors'

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  /** POST only. One UUID per user intent; reuse it when retrying the same intent. */
  key?: string
  /** Send the access token. Public reads go without it so a stale token never turns them into 401. */
  auth?: boolean
}

export interface ApiResponse<T> {
  status: number
  data: T
}

const base = () => `${config.apiBaseUrl}/api/forum`

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${base()}${path}`, typeof location === 'undefined' ? 'http://localhost' : location.origin)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  return url.toString()
}

export async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method === 'POST') headers['Idempotency-Key'] = opts.key ?? crypto.randomUUID()
  if (opts.auth) {
    const token = await accessToken()
    if (!token) throw new ForumError('UNAUTHENTICATED', 'Login required')
    headers.Authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
    })
  } catch {
    throw new ForumError('NETWORK', 'Network request failed')
  }
  if (res.status === 204) return { status: 204, data: undefined as T }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) throw toForumError(res.status, (data ?? {}) as ApiErrorBody)
  return { status: res.status, data: data as T }
}

export const get = <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts).then((r) => r.data)

/** Field names from `details.fields` (list or map) as a field → message record. */
function fieldMessages(details: Record<string, unknown>): Record<string, string> | undefined {
  const f = details.fields
  const names = Array.isArray(f) ? f.map(String) : f && typeof f === 'object' ? Object.keys(f) : []
  if (!names.length) return undefined
  const ui: Record<string, string> = { hashtag_ids: 'tags', display_name: 'name' }
  return Object.fromEntries(names.map((n) => [ui[n] ?? n, 'This value is not accepted.']))
}

export function toForumError(status: number, body: ApiErrorBody): ForumError {
  const details = body.error?.details ?? {}
  const reason = typeof details.reason === 'string' ? details.reason : undefined
  const message = body.error?.message ?? `HTTP ${status}`
  const extra: ForumErrorDetails = { backendReason: reason }
  if (typeof details.state === 'string') extra.state = details.state
  switch (status) {
    case 401:
      return new ForumError('UNAUTHENTICATED', message)
    case 403:
      if (reason === 'PROFILE_REQUIRED') return new ForumError('VALIDATION', message, { reason: 'NO_DISPLAY_NAME', ...extra })
      return new ForumError('FORBIDDEN', message, extra)
    case 404:
      return new ForumError('NOT_FOUND', message, extra)
    case 400:
      if (reason === 'INACTIVE_HASHTAG') return new ForumError('VALIDATION', message, { reason: 'INACTIVE_TAG', ...extra })
      return new ForumError('VALIDATION', message, { fields: fieldMessages(details), ...extra })
    case 409:
      if (reason === 'INACTIVE_HASHTAG') return new ForumError('VALIDATION', message, { reason: 'INACTIVE_TAG', ...extra })
      if (reason === 'DUPLICATE_SLUG') return new ForumError('CONFLICT', message, { reason: 'SLUG_TAKEN', ...extra })
      // STALE_VERSION, INVALID_STATE, STALE_REVISION, IDEMPOTENCY_CONFLICT: someone else got there first.
      return new ForumError('CONFLICT', message, { reason: 'STALE_DECISION', ...extra })
    default:
      // 429, 500, 503 (forum not configured, database or auth provider down).
      return new ForumError('UNAVAILABLE', message, extra)
  }
}

/** True when the backend refused with this `details.reason` (kept as `details.backendReason`). */
export function hasBackendReason(error: unknown, reason: string): boolean {
  return error instanceof ForumError && error.details.backendReason === reason
}
