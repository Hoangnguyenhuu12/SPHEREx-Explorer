/* oxlint-disable react/only-export-components -- helpers live next to their provider/view on purpose */
/**
 * Session for the Forum.
 *  - Demo mode (default): a frontend-only stand-in kept in sessionStorage, with a role switch.
 *  - Live mode (VITE_FORUM_API=http): Supabase Auth owns the session; id, display name and role come
 *    from GET /api/forum/me, which reads the role from the forum database, never from the token.
 * Nothing here is a security boundary: the backend checks identity and role on every request.
 * Passwords are never stored.
 */
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { config } from '../../app/config'
import { get, request } from '../forum/http/client'
import type { WMe } from '../forum/http/wire'
import { supabase } from './supabase'

export type Role = 'member' | 'admin'

export interface SessionUser {
  id: string
  email: string
  displayName: string | null
  role: Role
}

const SESSION_KEY = 'spherex-session-v1'
const PROFILES_KEY = 'spherex-profiles-v1'

interface Profile {
  displayName: string | null
  role: Role
}

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: Storage | undefined, key: string, value: unknown) {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or storage full: the session simply will not survive a reload.
  }
}

const session = () => (typeof window === 'undefined' ? undefined : window.sessionStorage)
const local = () => (typeof window === 'undefined' ? undefined : window.localStorage)

/** Stable demo user ID derived from the email, so the same email sees the same posts. */
export function userIdFor(email: string): string {
  let h = 2166136261
  for (const ch of email.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return `u_${(h >>> 0).toString(36)}`
}

function profiles(): Record<string, Profile> {
  return readJson<Record<string, Profile>>(local(), PROFILES_KEY) ?? {}
}

function saveProfile(id: string, patch: Partial<Profile>) {
  const all = profiles()
  all[id] = { ...{ displayName: null, role: 'member' as Role }, ...all[id], ...patch }
  writeJson(local(), PROFILES_KEY, all)
}

/** Public display name of any user (the mock "profile service"). */
export function displayNameOf(userId: string): string | null {
  return profiles()[userId]?.displayName ?? null
}

let cached: SessionUser | null | undefined
const listeners = new Set<() => void>()

// ------------------------------------------------------------------ live mode

let liveUser: SessionUser | null = null
let liveReady = !config.forumLive
let liveStarted = false
let loadSeq = 0

function toUser(me: WMe, email: string): SessionUser {
  return { id: me.profile.id, email, displayName: me.profile.display_name, role: me.role === 'admin' ? 'admin' : 'member' }
}

/** Re-read the Supabase session and the forum profile (/me). Resolves once the store is updated. */
export async function refreshLiveSession(): Promise<SessionUser | null> {
  const seq = ++loadSeq
  const { data } = await supabase().auth.getSession()
  const s = data.session
  let next: SessionUser | null = null
  if (s) {
    try {
      next = toUser(await get<WMe>('/me', { auth: true }), s.user.email ?? '')
    } catch (e) {
      // Forum backend asleep or not configured: stay logged in, without moderator rights.
      console.warn('Could not load the forum profile', e)
      next = { id: s.user.id, email: s.user.email ?? '', displayName: null, role: 'member' }
    }
  }
  if (seq === loadSeq) {
    const same = JSON.stringify(next) === JSON.stringify(liveUser)
    if (!same) liveUser = next
    if (!same || !liveReady) {
      liveReady = true
      emit()
    }
  }
  return liveUser
}

function startLiveSession() {
  if (liveStarted || !config.forumLive) return
  liveStarted = true
  void refreshLiveSession()
  supabase().auth.onAuthStateChange((event) => {
    // Supabase advises against awaiting its own calls inside this callback.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => void refreshLiveSession(), 0)
  })
}

function isReady(): boolean {
  return liveReady
}

/** Current user, or null. Also used by the mock Forum API in place of a session cookie. */
export function getSessionUser(): SessionUser | null {
  if (config.forumLive) return liveUser
  if (cached !== undefined) return cached
  const stored = readJson<{ id: string; email: string }>(session(), SESSION_KEY)
  if (!stored) return (cached = null)
  const p = profiles()[stored.id]
  cached = { id: stored.id, email: stored.email, displayName: p?.displayName ?? null, role: p?.role ?? 'member' }
  return cached
}

function emit() {
  cached = undefined
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function startSession(email: string): SessionUser {
  const id = userIdFor(email)
  if (!profiles()[id]) saveProfile(id, {})
  writeJson(session(), SESSION_KEY, { id, email: email.trim() })
  emit()
  return getSessionUser()!
}

let loggedOutAt = 0

export function endSession() {
  loggedOutAt = Date.now()
  if (config.forumLive) {
    liveUser = null
    void supabase().auth.signOut()
  } else writeJson(session(), SESSION_KEY, null)
  emit()
}

/** True right after a deliberate log out, so route guards leave instead of asking to log in again. */
export function justLoggedOut(): boolean {
  return Date.now() - loggedOutAt < 3000
}

interface SessionApi {
  user: SessionUser | null
  /** False while the live session is still being restored (page load); guards wait for it. */
  ready: boolean
  /** Demo: starts the stand-in session. Live: the login already happened in authService. */
  logIn: (email: string) => SessionUser | null
  logOut: () => void
  setDisplayName: (name: string) => Promise<void>
  /** Demo only: switch between member and admin to show the moderation screens. */
  setDemoRole: (role: Role) => void
}

const SessionContext = createContext<SessionApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const user = useSyncExternalStore(subscribe, getSessionUser, () => null)
  const ready = useSyncExternalStore(subscribe, isReady, () => !config.forumLive)
  useEffect(startLiveSession, [])

  // Private Forum data (my posts, drafts, queue, notifications) must never leak to the next account.
  const dropForumCache = useCallback(() => qc.removeQueries({ queryKey: ['forum'] }), [qc])

  const logIn = useCallback(
    (email: string) => {
      dropForumCache()
      return config.forumLive ? getSessionUser() : startSession(email)
    },
    [dropForumCache],
  )
  const logOut = useCallback(() => {
    endSession()
    dropForumCache()
  }, [dropForumCache])
  const setDisplayName = useCallback(async (name: string) => {
    const current = getSessionUser()
    if (!current) return
    if (config.forumLive) {
      const res = await request<WMe>('PATCH', '/me', { body: { display_name: name.trim() }, auth: true })
      liveUser = toUser(res.data, current.email)
    } else saveProfile(current.id, { displayName: name.trim() })
    emit()
  }, [])
  const setDemoRole = useCallback(
    (role: Role) => {
      const current = getSessionUser()
      // The real role lives in the forum database (granted with SQL), never in the browser.
      if (!current || config.forumLive) return
      saveProfile(current.id, { role })
      emit()
      dropForumCache()
    },
    [dropForumCache],
  )

  const value = useMemo(() => ({ user, ready, logIn, logOut, setDisplayName, setDemoRole }), [user, ready, logIn, logOut, setDisplayName, setDemoRole])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <AuthProvider>')
  return ctx
}
