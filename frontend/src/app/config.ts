/** Public build-time configuration. Never place credentials in VITE_* variables. */

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

export const config = {
  apiBaseUrl,
  /** Mock mode is on unless explicitly disabled AND an API origin exists. */
  useMock: parseBool(import.meta.env.VITE_USE_MOCK, true) || apiBaseUrl === '',
  /** Client watchdog for /api/frames: Render wake-up (~50 s) + live processing (~65 s). */
  framesTimeoutMs: 125_000,
  /** Cutout size requested from the backend, degrees (10 arcmin). */
  cutoutSizeDeg: 0.1667,
  maxFrames: 24,
  combinedMaxFrames: 200,
  imageConcurrency: 4,
} as const

export const PATHS = {
  home: '/',
  story: '/story',
  entry: '/where-are-you',
  explorer: '/the-eyes',
  login: '/login',
  signup: '/signup',
  forum: '/forum',
  forumNew: '/forum/new',
  myPosts: '/forum/my-posts',
  adminForum: '/admin/forum',
} as const

export const forumPostPath = (id: string) => `/forum/posts/${encodeURIComponent(id)}`
export const forumEditPath = (id: string) => `/forum/posts/${encodeURIComponent(id)}/edit`
