import { describe, expect, it } from 'vitest'
import { bankAngle, buildStops, poseAt, progressAt, type Anchor } from '../features/artwork/craftTimeline'

// Page coordinates: hero craft on the right, one dock near the top-left of each section.
const hero: Anchor = { x: 760, y: 180, size: 500 }
const docks: Anchor[] = [
  { x: 48, y: 1000, size: 88 },
  { x: 48, y: 1900, size: 88 },
  { x: 48, y: 2800, size: 88 },
]
const snaps = [0, 900, 1800, 2700]
const vh = 964
const stops = buildStops([hero, ...docks], snaps)

describe('craft flight', () => {
  it('turns page anchors into viewport positions for the scroll at which each section rests', () => {
    expect(stops.map((s) => s.y)).toEqual([180, 100, 100, 100])
    expect(stops.map((s) => s.scroll)).toEqual(snaps)
  })

  it('maps scroll to a fractional section index, clamped at both ends', () => {
    expect(progressAt(-20, stops)).toBe(0)
    expect(progressAt(0, stops)).toBe(0)
    expect(progressAt(450, stops)).toBeCloseTo(0.5)
    expect(progressAt(900, stops)).toBe(1)
    expect(progressAt(2250, stops)).toBeCloseTo(2.5)
    expect(progressAt(9999, stops)).toBe(3)
  })

  it('sits exactly on the hero anchor at the top, at full size, with its light', () => {
    expect(poseAt(0, 0, stops, vh)).toEqual({ x: 760, y: 180, scale: 1, beam: 1 })
  })

  it('rests exactly on each dock, small and without light', () => {
    for (let i = 1; i < stops.length; i++) {
      const pose = poseAt(i, snaps[i], stops, vh)
      expect(pose.x).toBeCloseTo(48, 5)
      expect(pose.y).toBeCloseTo(100, 5)
      expect(pose.scale).toBeCloseTo(88 / 500, 5)
      expect(pose.beam).toBe(0)
    }
  })

  it('flies a curve that swings towards the left margin and dips, rather than a straight line', () => {
    const mid = poseAt(0.5, 450, stops, vh)
    expect(mid.x).toBeLessThan((760 + 48) / 2)
    expect(mid.y).toBeGreaterThan((180 + 100) / 2)
    const hop = poseAt(1.5, 1350, stops, vh)
    expect(hop.y).toBeGreaterThan(100)
    expect(hop.scale).toBeGreaterThan(88 / 500)
  })

  it('moves continuously across a dock (no jump between flights)', () => {
    const before = poseAt(1 - 1e-6, 900, stops, vh)
    const after = poseAt(1 + 1e-6, 900, stops, vh)
    expect(after.x).toBeCloseTo(before.x, 2)
    expect(after.y).toBeCloseTo(before.y, 2)
    expect(after.scale).toBeCloseTo(before.scale, 5)
  })

  it('tolerates spring overshoot and rides up with the page past the last section', () => {
    expect(poseAt(3.04, 2700, stops, vh).y).toBeCloseTo(100, 5)
    expect(poseAt(-0.03, 0, stops, vh).x).toBeCloseTo(760, 5)
    expect(poseAt(3, 2900, stops, vh).y).toBeCloseTo(-100, 5)
  })

  it('banks with speed, within limits', () => {
    expect(bankAngle(0)).toBe(0)
    expect(bankAngle(1)).toBeGreaterThan(0)
    expect(bankAngle(-1)).toBeLessThan(0)
    expect(bankAngle(100)).toBe(12)
    expect(bankAngle(-100)).toBe(-12)
  })
})
