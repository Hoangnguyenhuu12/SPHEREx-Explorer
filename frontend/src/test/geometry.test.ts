import { describe, expect, it } from 'vitest'
import { fitViewport, pixelCentreToScreen, scaleForFov, screenToImage, visibleFovArcmin, zoomAt } from '../features/blink/viewport'
import { pixelToSky, skyToPixel } from '../features/blink/wcs'
import type { Grid } from '../shared/api/types'

describe('viewport', () => {
  it('fits with an integer scale and centres the image', () => {
    const v = fitViewport(98, 98, 428, 428)
    expect(v.scale).toBe(4)
    expect(v.offsetX).toBe((428 - 392) / 2)
  })
  it('places the crosshair at the pixel centre, (x + 0.5) × scale', () => {
    const v = { scale: 4, offsetX: 10, offsetY: 20 }
    expect(pixelCentreToScreen(v, [17, 19])).toEqual({ x: 10 + 17.5 * 4, y: 20 + 19.5 * 4 })
  })
  it('zoom keeps the point under the cursor fixed', () => {
    const v = { scale: 4, offsetX: 18, offsetY: 18 }
    const before = screenToImage(v, 200, 150)
    const after = screenToImage(zoomAt(v, 2, 200, 150), 200, 150)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })
  it('converts between scale and visible field of view', () => {
    const s = scaleForFov(5, 428, 6.15)
    expect(visibleFovArcmin({ scale: s, offsetX: 0, offsetY: 0 }, 428, 6.15)).toBeCloseTo(5, 6)
  })
})

describe('small-field TAN conversion', () => {
  const g: Grid = { width: 98, height: 98, pixscale_arcsec: 6.15, projection: 'TAN', center_ra: 269.4521, center_dec: 4.6934 }
  it('maps the grid centre to the reference position', () => {
    const s = pixelToSky(g, 48.5, 48.5)
    expect(s.ra).toBeCloseTo(269.4521, 6)
    expect(s.dec).toBeCloseTo(4.6934, 6)
  })
  it('puts north up and east left', () => {
    const up = pixelToSky(g, 48.5, 10)
    const left = pixelToSky(g, 10, 48.5)
    expect(up.dec).toBeGreaterThan(g.center_dec)
    expect(left.ra).toBeGreaterThan(g.center_ra)
  })
  it('round-trips pixel → sky → pixel', () => {
    const s = pixelToSky(g, 12, 80)
    const [x, y] = skyToPixel(g, s.ra, s.dec)
    expect(x).toBeCloseTo(12, 6)
    expect(y).toBeCloseTo(80, 6)
  })
  it('handles the RA wrap near 0°', () => {
    const g0 = { ...g, center_ra: 0.01, center_dec: 0 }
    const s = pixelToSky(g0, 90, 48.5)
    expect(s.ra).toBeGreaterThan(359)
    const [x] = skyToPixel(g0, s.ra, s.dec)
    expect(x).toBeCloseTo(90, 6)
  })
})
