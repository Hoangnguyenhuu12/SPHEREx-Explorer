import { PATHS } from '../../app/config'
import { TARGET_BY_KEY, isTargetKey } from '../../shared/config/targets'
import { parseSelection, resolveQuery } from '../target-search/explorer-url'

export type LinkCheck = { ok: true; href: string; kind: 'eyes' | 'external' } | { ok: false; message: string }

/**
 * Accept a link to The Eyes (relative "/the-eyes?…" or a full URL on this site) or any http(s) URL.
 * Links to The Eyes are normalised to a relative path so they work on every deployment.
 */
export function checkLink(raw: string, origin: string = typeof location === 'undefined' ? 'https://spherex.invalid' : location.origin): LinkCheck {
  const value = raw.trim()
  if (value === '') return { ok: false, message: 'Enter a link or remove this field.' }
  if (/\s/.test(value)) return { ok: false, message: 'Links cannot contain spaces.' }
  let url: URL
  try {
    url = new URL(value, value.startsWith('/') && !value.startsWith('//') ? origin : undefined)
  } catch {
    return { ok: false, message: 'Enter a full link starting with https://, or a link copied from The Eyes.' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, message: 'Only web links (https://) are allowed.' }
  if (url.origin === origin) {
    if (url.pathname === PATHS.explorer || url.pathname === '/eyes') {
      return { ok: true, href: `${PATHS.explorer}${url.search}`, kind: 'eyes' }
    }
    return { ok: true, href: `${url.pathname}${url.search}${url.hash}`, kind: 'external' }
  }
  return { ok: true, href: url.href, kind: 'external' }
}

export function isEyesLink(href: string): boolean {
  return href.startsWith(`${PATHS.explorer}?`) || href === PATHS.explorer
}

export interface ObservationSummary {
  href: string
  /** Target name, coordinates text, or the raw query. */
  label: string
  detector: number | null
  fovArcmin: number | null
}

/** Read what an Eyes link points at, without calling any API (AC14). */
export function describeObservation(href: string): ObservationSummary | null {
  if (!isEyesLink(href)) return null
  const search = href.slice(PATHS.explorer.length)
  const sel = parseSelection(search)
  const resolved = resolveQuery(sel.q)
  let label = 'The Eyes'
  if (resolved.kind === 'target' && isTargetKey(resolved.key)) label = TARGET_BY_KEY.get(resolved.key)!.name
  else if (resolved.kind === 'coords') label = `RA ${resolved.coords.ra.toFixed(4)}°, Dec ${resolved.coords.dec.toFixed(4)}°`
  else if (resolved.kind === 'name') label = resolved.name
  return { href, label, detector: sel.detector || null, fovArcmin: sel.fovArcmin }
}
