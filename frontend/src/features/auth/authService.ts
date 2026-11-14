/**
 * Frontend-only placeholder for authentication. There is no backend endpoint yet, so these
 * functions only simulate a network round trip. Replace the bodies with real API calls
 * (and keep the signatures) once the backend exposes /api/auth/*.
 * Nothing is stored: never keep passwords in localStorage.
 */

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthResult {
  email: string
}

const SIMULATED_DELAY_MS = 700

function simulate<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_DELAY_MS))
}

export function logIn({ email }: AuthCredentials): Promise<AuthResult> {
  return simulate({ email: email.trim() })
}

export function signUp({ email }: AuthCredentials): Promise<AuthResult> {
  return simulate({ email: email.trim() })
}
