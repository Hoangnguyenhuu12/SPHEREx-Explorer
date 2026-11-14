import type { WarningCode } from '../../shared/api/types'

const MJD_UNIX_EPOCH = 40587

export function mjdToDate(mjd: number): Date {
  return new Date((mjd - MJD_UNIX_EPOCH) * 86_400_000)
}

/** UTC calendar date, e.g. 2025-05-14. */
export function formatUtcDate(iso: string | number): string {
  const d = typeof iso === 'number' ? mjdToDate(iso) : new Date(iso)
  return d.toISOString().slice(0, 10)
}

export function formatShortDate(mjd: number): string {
  const d = mjdToDate(mjd)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatInterval(tMin?: number, tMax?: number): string | null {
  if (tMin == null || tMax == null) return null
  const a = mjdToDate(tMin).toISOString().replace('T', ' ').slice(0, 16)
  const b = mjdToDate(tMax).toISOString().replace('T', ' ').slice(0, 16)
  return `${a} – ${b} UTC`
}

export const WARNING_COPY: Record<string, string> = {
  SATURATION_POSSIBLE: 'This star is bright enough to saturate the detector. Its centre may look flat or wrong.',
  FEW_FRAMES: 'Fewer than three observations are available, so changes over time are hard to judge.',
  TRUNCATED: 'Only part of the available observations is shown.',
  MIXED_WAVELENGTH: 'The frames were taken at different wavelengths, so brightness differences may not be real changes.',
  TARGET_OUTSIDE_COVERAGE: 'The target lies near or beyond the edge of the observed area.',
}

export function warningText(code: WarningCode): string {
  return WARNING_COPY[code] ?? `Data note: ${code}`
}
