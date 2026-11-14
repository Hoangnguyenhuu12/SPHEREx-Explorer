/** Client-side checks for the Log in and Sign up forms. The backend must validate again. */

export type AuthMode = 'login' | 'signup'

export interface AuthValues {
  email: string
  password: string
  confirmPassword: string
}

export type AuthField = keyof AuthValues
export type AuthErrors = Partial<Record<AuthField, string>>

export const PASSWORD_MIN_LENGTH = 8
export const EMAIL_MAX_LENGTH = 254

// One "@", no spaces, a dot in the domain, and a top-level domain of 2+ letters.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[a-z]{2,}$/i

export function validateEmail(raw: string): string | undefined {
  const email = raw.trim()
  if (email === '') return 'Enter your email address.'
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) return 'Enter a valid email address, like name@example.com.'
  return undefined
}

/** Sign up enforces the strength rules; Log in only needs a non-empty password. */
export function validatePassword(password: string, mode: AuthMode): string | undefined {
  if (password === '') return 'Enter your password.'
  if (mode === 'login') return undefined
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  return undefined
}

export function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (confirm === '') return 'Enter your password again.'
  if (confirm !== password) return 'Passwords do not match.'
  return undefined
}

export function validateField(field: AuthField, values: AuthValues, mode: AuthMode): string | undefined {
  switch (field) {
    case 'email':
      return validateEmail(values.email)
    case 'password':
      return validatePassword(values.password, mode)
    case 'confirmPassword':
      return mode === 'signup' ? validateConfirmPassword(values.password, values.confirmPassword) : undefined
  }
}

export function fieldsFor(mode: AuthMode): AuthField[] {
  return mode === 'signup' ? ['email', 'password', 'confirmPassword'] : ['email', 'password']
}

export function validateAuth(values: AuthValues, mode: AuthMode): AuthErrors {
  const errors: AuthErrors = {}
  for (const field of fieldsFor(mode)) {
    const message = validateField(field, values, mode)
    if (message) errors[field] = message
  }
  return errors
}

/** Live checklist shown under the Sign up password field. */
export function passwordRules(password: string) {
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'letter', label: 'A letter', met: /[a-z]/i.test(password) },
    { id: 'number', label: 'A number', met: /\d/.test(password) },
  ]
}
