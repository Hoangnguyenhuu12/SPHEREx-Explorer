/**
 * Log in and sign up.
 *  - Live mode (VITE_FORUM_API=http): Supabase Auth. Email confirmation is on, so sign-up may return
 *    no session; the user confirms by email, then logs in.
 *  - Demo mode: simulated round trip, no backend.
 * Nothing is stored here: never keep passwords in localStorage.
 */
import { config } from '../../app/config'
import { refreshLiveSession } from './session'
import { supabase } from './supabase'

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthResult {
  email: string
  /** Live sign-up: the account exists but the email must be confirmed before logging in. */
  needsConfirmation?: boolean
}

/** A failure the form can show as is (wrong password, unconfirmed email…). */
export class AuthServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthServiceError'
  }
}

const SIMULATED_DELAY_MS = 700

function simulate<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_DELAY_MS))
}

/** Supabase error codes → plain English. Unknown codes fall back to the form's generic message. */
function explain(code: string | undefined): AuthServiceError | null {
  switch (code) {
    case 'invalid_credentials':
      return new AuthServiceError('Email or password is incorrect.')
    case 'email_not_confirmed':
      return new AuthServiceError('Confirm your email first: open the link we sent you, then log in.')
    case 'user_already_exists':
    case 'email_exists':
      return new AuthServiceError('An account with this email already exists. Log in instead.')
    case 'weak_password':
      return new AuthServiceError('Choose a stronger password.')
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AuthServiceError('Too many attempts. Wait a minute and try again.')
    default:
      return null
  }
}

export async function logIn({ email, password }: AuthCredentials): Promise<AuthResult> {
  const clean = email.trim()
  if (!config.forumLive) return simulate({ email: clean })
  const { error } = await supabase().auth.signInWithPassword({ email: clean, password })
  if (error) throw explain(error.code) ?? error
  // Wait for /me so the role is known before the next page renders.
  await refreshLiveSession()
  return { email: clean }
}

export async function signUp({ email, password }: AuthCredentials): Promise<AuthResult> {
  const clean = email.trim()
  if (!config.forumLive) return simulate({ email: clean })
  const { data, error } = await supabase().auth.signUp({
    email: clean,
    password,
    options: { emailRedirectTo: `${location.origin}/login` },
  })
  if (error) throw explain(error.code) ?? error
  if (data.session) await refreshLiveSession()
  return { email: clean, needsConfirmation: !data.session }
}
