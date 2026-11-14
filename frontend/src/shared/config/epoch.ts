import type { TargetInfo } from './targets'

/** MJD of the J2000.0 epoch the catalogue positions refer to. */
export const J2000_MJD = 51544.5
/**
 * Middle of the SPHEREx DR1 all-sky cube (HiPS t_min 60789.75 … t_max 61174.49, about Nov 2025).
 * Map markers use this epoch so they sit on the star as SPHEREx imaged it.
 */
export const DR1_MAP_MJD = 60982

/**
 * Position of a target at a given date, moving it along its proper motion from J2000. Linear in RA/Dec,
 * which is accurate to well under a SPHEREx pixel for these five stars over a few decades.
 */
export function positionAt(t: Pick<TargetInfo, 'raDeg' | 'decDeg' | 'pmRaCosDecMasYr' | 'pmDecMasYr'>, mjd: number): { ra: number; dec: number } {
  const years = (mjd - J2000_MJD) / 365.25
  const dec = t.decDeg + (t.pmDecMasYr * years) / 3_600_000
  const cosDec = Math.cos((t.decDeg * Math.PI) / 180) || 1e-9
  const ra = t.raDeg + (t.pmRaCosDecMasYr * years) / 3_600_000 / cosDec
  return { ra: ((ra % 360) + 360) % 360, dec }
}

/** Where to draw a target on the SPHEREx DR1 background map. */
export function mapPosition(t: Pick<TargetInfo, 'raDeg' | 'decDeg' | 'pmRaCosDecMasYr' | 'pmDecMasYr'>): { ra: number; dec: number } {
  return positionAt(t, DR1_MAP_MJD)
}
