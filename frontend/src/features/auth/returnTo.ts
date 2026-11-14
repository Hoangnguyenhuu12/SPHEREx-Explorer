import { PATHS } from '../../app/config'

const AUTH_PATHS: string[] = [PATHS.login, PATHS.signup]

/**
 * Accept only same-site paths such as "/forum/new?x=1". Rejects absolute URLs, protocol-relative
 * ("//host"), backslash tricks, control characters and the auth pages themselves (to avoid loops).
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value, 'https://spherex.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://spherex.invalid') return null
  if (AUTH_PATHS.includes(url.pathname)) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function loginPath(returnTo: string, base: string = PATHS.login): string {
  const safe = sanitizeReturnTo(returnTo)
  return safe ? `${base}?returnTo=${encodeURIComponent(safe)}` : base
}
