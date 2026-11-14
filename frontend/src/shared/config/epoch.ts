/** MJD of the J2000.0 epoch the catalogue positions refer to. */
export const J2000_MJD = 51544.5
export const J2000_JYEAR = 2000.0
/** Gaia DR3 reference epoch (J2016.0). */
export const GAIA_DR3_EPOCH_JYEAR = 2016.0

export function jyearToMjd(jyear: number): number {
  return J2000_MJD + (jyear - J2000_JYEAR) * 365.25
}

export const GAIA_DR3_EPOCH_MJD = jyearToMjd(GAIA_DR3_EPOCH_JYEAR)

/**
 * Middle of the SPHEREx DR1 all-sky cube (HiPS t_min 60789.75 … t_max 61174.49, about Nov 2025).
 * Map markers use this epoch so they sit on the star as SPHEREx imaged it.
 */
export const DR1_MAP_MJD = 60982

/** Representative midpoint of the AllWISE HiPS mosaic (t_min 55378 … t_max 55414, ~July 2010). */
export const ALLWISE_MAP_MJD = 55396

export interface ProperMotionSource {
  raDeg: number
  decDeg: number
  pmRaCosDecMasYr?: number | null
  pmDecMasYr?: number | null
  refEpochMjd?: number
  refEpochJyear?: number
}

export interface EpochOptions {
  refEpochMjd?: number
  refEpochJyear?: number
}

function resolveRefMjd(t: ProperMotionSource, options?: EpochOptions): number {
  if (options?.refEpochMjd != null && Number.isFinite(options.refEpochMjd)) return options.refEpochMjd
  if (options?.refEpochJyear != null && Number.isFinite(options.refEpochJyear)) return jyearToMjd(options.refEpochJyear)
  if (t.refEpochMjd != null && Number.isFinite(t.refEpochMjd)) return t.refEpochMjd
  if (t.refEpochJyear != null && Number.isFinite(t.refEpochJyear)) return jyearToMjd(t.refEpochJyear)
  return J2000_MJD
}

/**
 * Position of a target or catalog source at a given MJD, propagating linearly along its angular proper
 * motion (`angular_proper_motion_only`) from `refEpochMjd` / `refEpochJyear` (defaulting to J2000.0).
 * Sources missing either proper-motion component stay at their reference coordinates.
 */
export function positionAt(t: ProperMotionSource, mjd: number, options?: EpochOptions): { ra: number; dec: number } {
  const normRa = (deg: number) => ((deg % 360) + 360) % 360
  if (
    t.pmRaCosDecMasYr == null ||
    t.pmDecMasYr == null ||
    !Number.isFinite(t.pmRaCosDecMasYr) ||
    !Number.isFinite(t.pmDecMasYr)
  ) {
    return { ra: normRa(t.raDeg), dec: t.decDeg }
  }
  const refMjd = resolveRefMjd(t, options)
  const years = (mjd - refMjd) / 365.25
  const dec = t.decDeg + (t.pmDecMasYr * years) / 3_600_000
  const cosDec = Math.cos((t.decDeg * Math.PI) / 180) || 1e-9
  const ra = t.raDeg + (t.pmRaCosDecMasYr * years) / 3_600_000 / cosDec
  return { ra: normRa(ra), dec }
}

/** Where to draw a target on a background map at `targetMjd` (defaulting to SPHEREx DR1). */
export function mapPosition(t: ProperMotionSource, targetMjd = DR1_MAP_MJD): { ra: number; dec: number } {
  return positionAt(t, targetMjd)
}
