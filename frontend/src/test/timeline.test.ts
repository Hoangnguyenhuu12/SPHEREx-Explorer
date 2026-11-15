import { describe, expect, it } from 'vitest'
import type { Frame, GaiaFrameOverlay } from '../shared/api/types'
import {
  analyzeTimeline,
  framesDifferInMissionOrBand,
  pickDefaultComparePair,
  selectReferenceGaiaOverlays,
} from '../features/target-details/timeline'

function makeFrame(id: string, mjd: number, mission: 'unWISE' | 'SPHEREx', band: string, quality = 'screened'): Frame {
  return {
    id,
    mjd,
    iso: '2020-01-01T00:00:00Z',
    wavelength_um: mission === 'unWISE' ? 4.6 : 4.7,
    bandwidth_um: null,
    release: mission === 'unWISE' ? 'wiseview-unwise' : 'dr1',
    survey: null,
    bad_pixel_frac: null,
    predicted_px: [52, 52],
    png: `/api/frames/${id}/image.png`,
    diff_png: null,
    mission,
    band_or_detector: band,
    quality_label: quality,
  }
}

function makeOverlay(
  source_id: string,
  pixel_x: number,
  pixel_y_png: number,
  g_mag: number | null,
  motion_status: 'propagated_pm' | 'catalog_static_no_pm' = 'propagated_pm',
): GaiaFrameOverlay {
  return {
    frame_index: 1,
    source_id,
    observed_mjd: 55320,
    catalog_ra_deg: 133.8,
    catalog_dec_deg: -7.2,
    propagated_ra_deg: 133.8,
    propagated_dec_deg: -7.2,
    pixel_x,
    pixel_y_png,
    in_frame: true,
    has_proper_motion: motion_status === 'propagated_pm',
    motion_status,
    g_mag,
  }
}

describe('timeline helpers', () => {
  it('picks earliest and latest verified unWISE W2 frames with longest baseline', () => {
    const frames = [
      makeFrame('u1', 55320, 'unWISE', 'W2'),
      makeFrame('u2', 56780, 'unWISE', 'W2'),
      makeFrame('u3', 60417, 'unWISE', 'W2'),
      makeFrame('s1', 60800, 'SPHEREx', 'D6'),
    ]
    expect(pickDefaultComparePair(frames)).toEqual([0, 2])
  })

  it('skips flagged unWISE frames when verified ones exist', () => {
    const frames = [
      makeFrame('u1', 55320, 'unWISE', 'W2', 'flagged'),
      makeFrame('u2', 55500, 'unWISE', 'W2', 'screened'),
      makeFrame('u3', 60417, 'unWISE', 'W2', 'screened'),
    ]
    expect(pickDefaultComparePair(frames)).toEqual([1, 2])
  })

  it('detects when two frames differ in mission or band', () => {
    const u = makeFrame('u', 55320, 'unWISE', 'W2')
    const s = makeFrame('s', 60800, 'SPHEREx', 'D6')
    const u2 = makeFrame('u2', 60417, 'unWISE', 'W2')
    expect(framesDifferInMissionOrBand(u, s)).toBe(true)
    expect(framesDifferInMissionOrBand(u, u2)).toBe(false)
  })

  it('analyzes missions and detects multi-month gaps from real MJDs', () => {
    const frames = [
      makeFrame('u1', 55320, 'unWISE', 'W2'),
      makeFrame('u2', 56600, 'unWISE', 'W2'),
      makeFrame('u3', 60417, 'unWISE', 'W2'),
      makeFrame('s1', 60801, 'SPHEREx', 'D6'),
    ]
    const summary = analyzeTimeline(frames, 6)
    expect(summary.hasMixedMissionsOrBands).toBe(true)
    expect(summary.missions).toEqual([
      { mission: 'unWISE', band: 'W2', count: 3 },
      { mission: 'SPHEREx', band: 'D6', count: 1 },
    ])
    expect(summary.gaps.length).toBeGreaterThanOrEqual(2)
    expect(summary.gaps.some((g) => g.label.includes('yr gap'))).toBe(true)
  })

  it('selects at most maxCount well-separated Gaia reference stars inside frame', () => {
    const overlays: GaiaFrameOverlay[] = [
      makeOverlay('edge', 2, 2, 10),
      makeOverlay('bright1', 30, 30, 11.2),
      makeOverlay('tooClose', 32, 31, 12.0, 'catalog_static_no_pm'),
      makeOverlay('bright2', 75, 70, 13.4),
      makeOverlay('bright3', 85, 25, 14.1),
    ]
    const res = selectReferenceGaiaOverlays(overlays, 1, 105, 105, 6)
    expect(res.inFrameCount).toBe(5)
    expect(res.selected.map((m) => m.source_id)).toEqual(['bright1', 'bright2', 'bright3'])
  })
})
