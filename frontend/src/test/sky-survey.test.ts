import { describe, expect, it } from 'vitest'
import { aladinSliceArgument, sliceForDetector, SPHEREX_SURVEY, spherexSurveyFromHipsLayer, WISE_MIRRORS, WISE_SURVEY } from '../features/sky-map/surveys'
import { ALLWISE_MAP_MJD } from '../shared/config/epoch'

const C = 299_792_458
const emMin = 7.43e-7
const emMax = 5.009e-6
const depth = 102

/** What Aladin's core does with a setSliceNumber argument (reproduces the measured behaviour). */
function frameLoaded(arg: number): number {
  const f = C / (emMin + (arg / depth) * (emMax - emMin))
  return Math.floor(((f - C / emMax) / (C / emMin - C / emMax)) * depth)
}

describe('SPHEREx cube background', () => {
  it('uses the middle channel of each detector', () => {
    expect([1, 2, 3, 4, 5, 6].map(sliceForDetector)).toEqual([8, 25, 42, 59, 76, 93])
    // 0 means "not chosen"; the app defaults to D6.
    expect(sliceForDetector(0)).toBe(93)
  })
  it('reproduces the measured mismatch without correction', () => {
    expect(frameLoaded(8)).toBe(64)
    expect(frameLoaded(93)).toBe(1)
  })
  it('makes Aladin load the intended frame for every detector', () => {
    for (let d = 1; d <= 6; d++) {
      const frame = sliceForDetector(d)
      expect(frameLoaded(aladinSliceArgument(frame))).toBe(frame)
    }
  })
  it('maps sky_archive.hips_layers rows onto SPHEREx survey metadata with safe fallback', () => {
    const mapped = spherexSurveyFromHipsLayer({
      layer_id: 'ivo://IPAC/P/SPHEREx/DR1/cube',
      title: 'SPHEREx DR1 all-sky data cube',
      service_url: 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/',
      spectral_metadata: {
        cube: true,
        credit: 'NASA/SPHEREx, HiPS by Caltech/IPAC IRSA',
        em_min_m: 7.43e-7,
        em_max_m: 5.009e-6,
        cube_frames: 102,
      },
    })
    expect(mapped.fromArchive).toBe(true)
    expect(mapped.url).toBe('https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube')
    expect(mapped.cubeDepth).toBe(102)
    expect(spherexSurveyFromHipsLayer(null)).toBe(SPHEREX_SURVEY)
    expect(spherexSurveyFromHipsLayer({ service_url: 'not-a-url' })).toBe(SPHEREX_SURVEY)
  })
  it('defines infrared WISE/AllWISE survey metadata and mirrors', () => {
    expect(WISE_SURVEY.cube).toBe(false)
    expect(WISE_SURVEY.epochMjd).toBe(ALLWISE_MAP_MJD)
    expect(WISE_MIRRORS.length).toBeGreaterThanOrEqual(2)
  })
})
