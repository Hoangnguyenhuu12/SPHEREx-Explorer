/** Coordinate parsing: decimal degrees or sexagesimal. Pure, no networking. */

export interface Coords {
  ra: number
  dec: number
}

export type ParseResult = { ok: true; coords: Coords } | { ok: false; error: string }

const SEPARATORS = /[\s:hmsdHMSD°′″'"]+/

function normalizeMinus(s: string): string {
  return s.replace(/[−–—]/g, '-')
}

/** Splits "ra dec" input into two fields. Accepts comma, space or sexagesimal groups. */
function splitFields(input: string): [string, string] | null {
  const s = normalizeMinus(input.trim())
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
    return parts.length === 2 ? [parts[0], parts[1]] : null
  }
  // Dec starts at the first explicit sign after the RA part.
  const signIdx = s.slice(1).search(/[+-]/)
  if (signIdx >= 0) {
    const i = signIdx + 1
    return [s.slice(0, i).trim(), s.slice(i).trim()]
  }
  const tokens = s.split(/\s+/)
  if (tokens.length === 2) return [tokens[0], tokens[1]]
  if (tokens.length === 6) return [tokens.slice(0, 3).join(' '), tokens.slice(3).join(' ')]
  return null
}

function parseSexagesimal(field: string): { value: number; sign: number; parts: number } | null {
  const trimmed = field.trim()
  const sign = trimmed.startsWith('-') ? -1 : 1
  const body = trimmed.replace(/^[+-]/, '')
  const parts = body.split(SEPARATORS).filter(Boolean)
  if (parts.length === 0 || parts.length > 3) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  if (parts.length > 1 && (nums[1] >= 60 || (nums[2] ?? 0) >= 60)) return null
  const value = nums[0] + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600
  return { value, sign, parts: parts.length }
}

export function parseRa(field: string): number | null {
  const isHours = /[hH:]/.test(field) || field.trim().split(/\s+/).length === 3
  const p = parseSexagesimal(field)
  if (!p || p.sign < 0) return null
  const deg = isHours || p.parts > 1 ? p.value * 15 : p.value
  if (isHours && p.value >= 24) return null
  if (deg < 0 || deg >= 360) return null
  return deg
}

export function parseDec(field: string): number | null {
  const p = parseSexagesimal(field)
  if (!p) return null
  const deg = p.sign * p.value
  if (deg < -90 || deg > 90) return null
  return deg
}

/** Returns null when the input does not look like coordinates (treat it as a name). */
export function looksLikeCoordinates(input: string): boolean {
  return /^[\s+\-−0-9.,:hmsd°′″'"]+$/i.test(input.trim()) && /\d/.test(input)
}

export function parseCoordinates(input: string): ParseResult {
  const fields = splitFields(input)
  if (!fields) return { ok: false, error: 'Enter RA and Dec, for example "269.452 +4.693" or "17 57 48.5 +04 41 36".' }
  const ra = parseRa(fields[0])
  if (ra === null) return { ok: false, error: 'RA must be between 0 and 360 degrees, or 0h to 24h.' }
  const dec = parseDec(fields[1])
  if (dec === null) return { ok: false, error: 'Dec must be between −90 and +90 degrees.' }
  return { ok: true, coords: { ra, dec } }
}

function pad(n: number, width: number, digits = 0): string {
  const s = n.toFixed(digits)
  const [int, frac] = s.split('.')
  return int.padStart(width, '0') + (frac ? '.' + frac : '')
}

/** Normalises a sexagesimal triple so rounding never yields 60 in a lower field. */
function triple(value: number, secDigits: number): [number, number, number] {
  const scale = 10 ** secDigits
  let totalSec = Math.round(value * 3600 * scale) / scale
  const a = Math.floor(totalSec / 3600)
  totalSec -= a * 3600
  const b = Math.floor(totalSec / 60)
  const c = +(totalSec - b * 60).toFixed(secDigits)
  return [a, b, c]
}

export function formatRaHms(raDeg: number): string {
  const [h, m, s] = triple(((raDeg % 360) + 360) % 360 / 15, 2)
  return `${pad(h % 24, 2)}h ${pad(m, 2)}m ${pad(s, 2, 2)}s`
}

export function formatDecDms(decDeg: number): string {
  const sign = decDeg < 0 ? '−' : '+'
  const [d, m, s] = triple(Math.abs(decDeg), 1)
  return `${sign}${pad(d, 2)}° ${pad(m, 2)}′ ${pad(s, 2, 1)}″`
}

export function formatDeg(value: number, digits = 4): string {
  return value.toFixed(digits).replace('-', '−')
}
