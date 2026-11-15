import type { Grid } from '../../shared/api/types'

/**
 * Validate whether the frame grid provides finite, usable TAN projection WCS metadata.
 */
export function hasValidWcs(g: Grid | null | undefined): g is Grid {
  if (!g) return false
  if (!Number.isFinite(g.width) || !Number.isFinite(g.height) || g.width <= 0 || g.height <= 0) return false
  if (!Number.isFinite(g.pixscale_arcsec) || g.pixscale_arcsec <= 0) return false
  if (!Number.isFinite(g.center_ra) || !Number.isFinite(g.center_dec)) return false
  if (g.center_dec < -90 || g.center_dec > 90) return false
  if (g.projection && g.projection.toUpperCase() !== 'TAN') return false
  return true
}

/**
 * Small-field pixel ↔ sky conversion for a north-up, east-left TAN grid centred on
 * (center_ra, center_dec). Pixel coordinates are top-left origin with integer centres.
 * Accurate to a fraction of a pixel for cutouts of a few arcminutes; replace with full WCS
 * when the API provides it.
 */
export function pixelToSky(g: Grid, x: number, y: number): { ra: number; dec: number } {
  const xi = -((x + 0.5 - g.width / 2) * g.pixscale_arcsec) / 3600
  const eta = -((y + 0.5 - g.height / 2) * g.pixscale_arcsec) / 3600
  const d0 = (g.center_dec * Math.PI) / 180
  const xiR = (xi * Math.PI) / 180
  const etaR = (eta * Math.PI) / 180
  const den = Math.cos(d0) - etaR * Math.sin(d0)
  const ra = g.center_ra + (Math.atan2(xiR, den) * 180) / Math.PI
  const dec = (Math.atan2(Math.sin(d0) + etaR * Math.cos(d0), Math.hypot(xiR, den)) * 180) / Math.PI
  return { ra: ((ra % 360) + 360) % 360, dec }
}

export function safePixelToSky(g: Grid | null | undefined, x: number, y: number): { ra: number; dec: number } | null {
  if (!hasValidWcs(g) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  const sky = pixelToSky(g, x, y)
  if (!Number.isFinite(sky.ra) || !Number.isFinite(sky.dec)) return null
  return sky
}

export function skyToPixel(g: Grid, ra: number, dec: number): [number, number] {
  const d0 = (g.center_dec * Math.PI) / 180
  const d = (dec * Math.PI) / 180
  const dra = (((ra - g.center_ra + 540) % 360) - 180) * (Math.PI / 180)
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra)
  const xi = (Math.cos(d) * Math.sin(dra)) / cosc
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra)) / cosc
  const k = (180 / Math.PI) * 3600 / g.pixscale_arcsec
  return [g.width / 2 - 0.5 - xi * k, g.height / 2 - 0.5 - eta * k]
}

export function safeSkyToPixel(g: Grid | null | undefined, ra: number, dec: number): [number, number] | null {
  if (!hasValidWcs(g) || !Number.isFinite(ra) || !Number.isFinite(dec)) return null
  const px = skyToPixel(g, ra, dec)
  if (!Number.isFinite(px[0]) || !Number.isFinite(px[1])) return null
  return px
}

/**
 * Great-circle angular distance on the celestial sphere in arcseconds using the
 * spherical Vincenty formula. Handles RA wraparound across 0°/360° and tiny separations cleanly.
 */
export function sphericalAngularDistanceArcsec(ra1Deg: number, dec1Deg: number, ra2Deg: number, dec2Deg: number): number {
  const rad = Math.PI / 180
  const phi1 = dec1Deg * rad
  const phi2 = dec2Deg * rad
  const dLambda = (((ra2Deg - ra1Deg + 540) % 360) - 180) * rad

  const cosPhi1 = Math.cos(phi1)
  const sinPhi1 = Math.sin(phi1)
  const cosPhi2 = Math.cos(phi2)
  const sinPhi2 = Math.sin(phi2)
  const cosDl = Math.cos(dLambda)
  const sinDl = Math.sin(dLambda)

  const y = Math.hypot(cosPhi2 * sinDl, cosPhi1 * sinPhi2 - sinPhi1 * cosPhi2 * cosDl)
  const x = sinPhi1 * sinPhi2 + cosPhi1 * cosPhi2 * cosDl
  const sigmaRad = Math.atan2(y, x)
  const arcsec = (sigmaRad / rad) * 3600
  return arcsec < 1e-9 ? 0 : arcsec
}

export function formatAngularArcsec(arcsec: number): string {
  if (!Number.isFinite(arcsec)) return '—'
  if (arcsec < 0.005) return '0″'
  if (arcsec < 10) return `${arcsec.toFixed(2)}″`
  return `${arcsec.toFixed(1)}″`
}
