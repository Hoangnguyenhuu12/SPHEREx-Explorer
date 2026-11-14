import type { Grid } from '../../shared/api/types'

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
