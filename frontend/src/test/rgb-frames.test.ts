import { describe, expect, it } from 'vitest'
import { selectRgbFrames } from '../features/target-details/rgbFrames'
import type { Frame, FramesResponse, Grid } from '../shared/api/types'

const grid: Grid = { width: 40, height: 40, pixscale_arcsec: 6.15, projection: 'TAN', center_ra: 133.8, center_dec: -7.2 }

function sequence(detector: number, dates: number[], skyGrid = grid): FramesResponse {
  const frames: Frame[] = dates.map((mjd) => ({
    id: `d${detector}-${mjd}`, mjd, iso: '', wavelength_um: 2, bandwidth_um: 0.1,
    release: 'dr1', survey: 1, bad_pixel_frac: null, predicted_px: null,
    png: `/${detector}/${mjd}.png`, diff_png: null,
  }))
  return {
    api_version: '0.1', target: { ra: 133.8, dec: -7.2, name: null, target_key: null },
    detector, grid: skyGrid, norm: null, reference_frame_id: frames[0]?.id ?? null, frames, warnings: [],
  }
}

describe('RGB observation selection', () => {
  it('uses the existing observation nearest the selected date and the corresponding detector epochs', () => {
    const selection = selectRgbFrames(sequence(6, [60000, 60100]), sequence(4, [60100.4]), sequence(2, [60099.5, 60140]), 60101)
    expect(selection).toMatchObject({ status: 'ready', red: { mjd: 60100 }, green: { mjd: 60100.4 }, blue: { mjd: 60099.5 } })
  })

  it('rejects mixed epochs and misaligned grids before requesting PNGs', () => {
    const red = sequence(6, [60100])
    const green = sequence(4, [60100])
    expect(selectRgbFrames(red, green, sequence(2, [60103]))).toEqual({ status: 'different-epochs' })
    expect(selectRgbFrames(red, green, sequence(2, [60100], { ...grid, center_dec: -7.3 }))).toEqual({ status: 'incompatible' })
    expect(selectRgbFrames(red, green, sequence(2, []))).toEqual({ status: 'missing' })
  })
})
