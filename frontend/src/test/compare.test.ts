import { describe, expect, it } from 'vitest'
import type { Frame, Grid } from '../shared/api/types'
import {
  formatAngularArcsec,
  hasValidWcs,
  safePixelToSky,
  sphericalAngularDistanceArcsec,
} from '../features/blink/wcs'
import { buildComparisonShareUrl, computeCompareMeasurement } from '../features/target-details/compare'
import { pickDefaultComparePair, resolveComparePair } from '../features/target-details/timeline'
import { parseSelection } from '../features/target-search/explorer-url'

const SAMPLE_GRID: Grid = {
  width: 120,
  height: 120,
  pixscale_arcsec: 2.75,
  center_ra: 133.786,
  center_dec: -7.244,
  projection: 'TAN',
}

function makeFrame(id: string, mjd: number, overrides: Partial<Frame> = {}): Frame {
  return {
    id,
    mjd,
    iso: '2024-01-01T00:00:00Z',
    wavelength_um: 4.6,
    bandwidth_um: null,
    release: 'wiseview-unwise',
    survey: null,
    bad_pixel_frac: null,
    predicted_px: [52, 52],
    png: `/frames/${id}.png`,
    diff_png: null,
    mission: 'unWISE',
    band_or_detector: 'W2',
    quality_label: 'verified_coadd',
    ...overrides,
  }
}

describe('WCS & spherical angular distance', () => {
  it('returns exact 0 arcseconds for identical positions', () => {
    const d = sphericalAngularDistanceArcsec(133.786, -7.244, 133.786, -7.244)
    expect(d).toBe(0)
    expect(formatAngularArcsec(d)).toBe('0″')

    const m = computeCompareMeasurement({
      grid: SAMPLE_GRID,
      frameA: makeFrame('a', 55320),
      frameB: makeFrame('b', 60417),
      markA: [60, 60],
      markB: [60, 60],
    })
    expect(m.angularOffsetArcsec).toBe(0)
    expect(m.formattedOffset).toBe('0″')
  })

  it('computes accurate known-distance offsets from WCS pixel coordinates', () => {
    const m = computeCompareMeasurement({
      grid: SAMPLE_GRID,
      frameA: makeFrame('a', 55320, { predicted_px: [29.37, 53.88] }),
      frameB: makeFrame('b', 60417, { predicted_px: [70.59, 50.46] }),
      markA: [60, 50],
      markB: [60, 60],
    })
    expect(m.hasWcs).toBe(true)
    expect(m.angularOffsetArcsec).not.toBeNull()
    expect(m.angularOffsetArcsec!).toBeCloseTo(27.5, 1)
    expect(m.formattedOffset).toBe('27.5″')
    // Realistic WISE 0855 shift across ~14 yr baseline (~41.36 px * 2.75"/px)
    expect(m.catalogOffsetArcsec).toBeCloseTo(113.7, 0)
  })

  it('handles RA wraparound across 0° / 360° and cos(dec) foreshortening', () => {
    const eqDist = sphericalAngularDistanceArcsec(359.99, 0, 0.01, 0)
    expect(eqDist).toBeCloseTo(72.0, 2)

    const highDecDist = sphericalAngularDistanceArcsec(359.99, 60, 0.01, 60)
    expect(highDecDist).toBeCloseTo(36.0, 2)
  })

  it('reports missing or invalid WCS explicitly instead of returning bogus numbers', () => {
    expect(hasValidWcs(null)).toBe(false)
    expect(hasValidWcs({ ...SAMPLE_GRID, pixscale_arcsec: 0 })).toBe(false)
    expect(hasValidWcs({ ...SAMPLE_GRID, projection: 'SIN' })).toBe(false)
    expect(safePixelToSky({ ...SAMPLE_GRID, center_ra: Number.NaN }, 60, 60)).toBeNull()

    const bad = computeCompareMeasurement({
      grid: { ...SAMPLE_GRID, pixscale_arcsec: 0 },
      frameA: makeFrame('a', 55320),
      frameB: makeFrame('b', 60417),
      markA: [29.4, 53.9],
      markB: [70.6, 50.5],
    })
    expect(bad.hasWcs).toBe(false)
    expect(bad.markA?.sky).toBeNull()
    expect(bad.angularOffsetArcsec).toBeNull()
    expect(bad.formattedOffset).toBeNull()
    expect(bad.qualityLimitations.some((q) => /Missing or invalid WCS/i.test(q))).toBe(true)
  })
})

describe('Compare frame resolution, sharing & variable brightness', () => {
  const mixedFrames: Frame[] = [
    makeFrame('u0', 55320),
    makeFrame('u1', 60417),
    makeFrame('s0', 60800, { mission: 'SPHEREx', band_or_detector: 'D6', detector: 6, quality_label: 'screened_dr1_usable' }),
  ]

  it('resolves saved frame IDs cleanly and reports missing IDs with fallback pair', () => {
    const ok = resolveComparePair(mixedFrames, 'u0', 's0', 'motion')
    expect(ok).toEqual({ pair: [0, 2], missingA: null, missingB: null })

    const missing = resolveComparePair(mixedFrames, 'deleted-frame-a', 'u1', 'motion')
    expect(missing.missingA).toBe('deleted-frame-a')
    expect(missing.missingB).toBeNull()
    expect(missing.pair[0]).toBe(0)
    expect(missing.pair[1]).toBe(1)
  })

  it('skips flagged/saturated frames when selecting variable-brightness pairs', () => {
    const rwaurFrames: Frame[] = [
      makeFrame('w2-early', 55259),
      makeFrame('w2-late', 60354),
      makeFrame('s-good', 60900, { mission: 'SPHEREx', band_or_detector: 'D6', detector: 6, quality_label: 'screened_dr1_usable' }),
      makeFrame('s-flagged', 60910, { mission: 'SPHEREx', band_or_detector: 'D6', detector: 6, quality_label: 'dr1_target_flagged_or_saturated' }),
    ]
    const pair = pickDefaultComparePair(rwaurFrames, 'brightness')
    expect(pair).toEqual([0, 1])
  })

  it('round-trips a full shareable comparison URL into clean explorer selection', () => {
    const url = buildComparisonShareUrl({
      origin: 'https://phanetx.example',
      pathname: '/the-eyes',
      q: 'wise0855',
      detector: 6,
      seq: 'combined',
      frameA: mixedFrames[0],
      frameB: mixedFrames[1],
      markA: [29.37, 53.88],
      markB: [70.59, 50.46],
      gaia: false,
      pred: true,
      fovArcmin: 4.5,
    })
    const parsedUrl = new URL(url)
    expect(parsedUrl.origin).toBe('https://phanetx.example')
    expect(parsedUrl.pathname).toBe('/the-eyes')
    expect(parseSelection(parsedUrl.search)).toEqual({
      q: 'wise0855',
      detector: 6,
      fovArcmin: 4.5,
      compare: true,
      seq: 'combined',
      band: 'W2',
      frameA: 'u0',
      frameB: 'u1',
      markA: [29.4, 53.9],
      markB: [70.6, 50.5],
      gaia: false,
      pred: true,
    })
  })
})
