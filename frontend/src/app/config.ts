/** Public build-time configuration. Never place credentials in VITE_* variables. */

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
/** Public anon/publishable key only. Never the service_role key. */
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** Star guide chat (Supabase Edge Function `star-chat`). Public URL; the AI key stays server-side. */
const starChatUrl = (
  import.meta.env.VITE_STAR_CHAT_URL ?? 'https://gprawwpsgvhfzwyfoout.supabase.co/functions/v1/star-chat'
).trim()

export const config = {
  apiBaseUrl,
  starChatUrl,
  supabaseUrl,
  supabaseAnonKey,
  /**
   * Forum and login talk to the real backend (Supabase Auth + /api/forum) only when asked for
   * explicitly and every setting is present. Otherwise the in-browser demo forum is used.
   */
  forumLive: import.meta.env.VITE_FORUM_API === 'http' && apiBaseUrl !== '' && supabaseUrl !== '' && supabaseAnonKey !== '',
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
