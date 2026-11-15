import { describe, expect, it } from 'vitest'
import {
  buildForumCandidatePrefill,
  buildObservationsCsv,
  buildPythonSnippet,
  evaluateSpotChallenge,
  measureAngularOffset,
  readExperienceMode,
} from '../features/experience-mode/mode'
import type { FramesResponse, Grid } from '../shared/api/types'

const TEST_GRID: Grid = {
  width: 250,
  height: 250,
  pixscale_arcsec: 2.75,
  projection: 'TAN',
  center_ra: 133.81890825,
  center_dec: -7.247048,
}

describe('experience mode & science/explore utilities', () => {
  it('reads Explore vs Science mode from URL query parameters', () => {
    expect(readExperienceMode('')).toBe('explore')
    expect(readExperienceMode('?mode=science')).toBe('science')
    expect(readExperienceMode('?mode=explore')).toBe('explore')
  })

  it('evaluates Spot-the-Star challenge hits and misses', () => {
    const hit = evaluateSpotChallenge([125, 125], [123, 124], 2.75, 7)
    expect(hit).not.toBeNull()
    expect(hit!.hit).toBe(true)
    expect(hit!.distanceArcsec).toBeCloseTo(Math.hypot(2, 1) * 2.75, 3)

    const miss = evaluateSpotChallenge([150, 150], [120, 120], 2.75, 7)
    expect(miss!.hit).toBe(false)
    expect(miss!.distancePx).toBeGreaterThan(7)
  })

  it('computes angular separation, position angle, and proper motion on the TAN grid', () => {
    // Moving 10 pixels West (+x on east-left TAN grid -> -RA -> PA ~ 270 deg) over 15 years
    const mjd2010 = 55320.0
    const mjd2025 = 55320.0 + 15 * 365.25
    const m = measureAngularOffset(TEST_GRID, [125, 125], [135, 125], mjd2010, mjd2025)
    expect(m.sepArcsec).toBeCloseTo(27.5, 1)
    expect(m.paDeg).toBeCloseTo(270, 0)
    expect(m.baselineYears).toBeCloseTo(15, 2)
    expect(m.properMotionMasYr).toBeCloseTo((27.5 * 1000) / 15, 0)
  })

  it('builds CSV table and reproducible Python snippet for observations', () => {
    const sample: FramesResponse = {
      api_version: '0.1',
      target: { ra: 133.81890825, dec: -7.247048, name: 'WISE 0855−0714', target_key: 'wise0855' },
      detector: 6,
      grid: TEST_GRID,
      norm: { vmin: 0, vmax: 1, stretch: 'asinh' },
      reference_frame_id: 'wise0855-001',
      warnings: [],
      frames: [
        {
          id: 'wise0855-001',
          mission: 'unWISE',
          release: 'neo1',
          survey: null,
          band_or_detector: 'W2',
          mjd: 55320.5,
          iso: '2010-05-04T12:00:00Z',
          wavelength_um: 4.6,
          bandwidth_um: 1.0,
          bad_pixel_frac: null,
          predicted_px: [124.5, 124.5],
          png: '/api/frames/wise0855/frame_001_unwise.png',
          diff_png: null,
        },
      ],
    }
    const csv = buildObservationsCsv(sample)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('frame_index,id,mission,release')
    expect(lines[1]).toContain('1,wise0855-001,unWISE,neo1,W2,55320.5')

    const py = buildPythonSnippet({
      targetName: 'WISE 0855−0714',
      targetKey: 'wise0855',
      ra: 133.818908,
      dec: -7.247048,
      detector: 6,
      fitsUrl: 'https://example.org/aligned_sequence.fits',
      manifestUrl: 'https://example.org/sequence_manifest.json',
    })
    expect(py).toContain('from astropy.io import fits')
    expect(py).toContain('https://example.org/aligned_sequence.fits')
    expect(py).toContain('https://example.org/sequence_manifest.json')
  })

  it('builds structured Citizen Science candidate prefill for Forum', () => {
    const ruler = measureAngularOffset(TEST_GRID, [120, 120], [130, 120], 55320, 60800)
    const prefill = buildForumCandidatePrefill({
      targetName: 'WISE 0855−0714',
      targetKey: 'wise0855',
      coords: { ra: 133.818908, dec: -7.247048 },
      picked: { ra: 133.81, dec: -7.24, x: 130, y: 120 },
      detector: 6,
      frame: {
        mjd: 60800,
        iso: '2025-05-05T00:00:00Z',
        mission: 'SPHEREx',
        release: 'DR1',
        band_or_detector: 'D6',
      },
      shareUrl: 'https://example.org/eyes?q=wise0855',
      rulerMeasurement: ruler,
    })
    expect(prefill.title).toContain('Candidate report near WISE 0855−0714')
    expect(prefill.body).toContain('(130, 120)')
    expect(prefill.body).toContain('SPHEREx D6')
    expect(prefill.body).toContain('mas/yr')
    expect(prefill.links).toEqual(['https://example.org/eyes?q=wise0855'])
  })
})
