import { describe, expect, it } from 'vitest'
import { aladinSliceArgument, sliceForDetector } from '../features/sky-map/surveys'

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
})
