import { describe, expect, it } from 'vitest'
import { buildTimeline, interpolate, type Anchor } from '../features/artwork/craftTimeline'

const hero: Anchor = { x: 760, y: 120, size: 500 }
const docks: Anchor[] = [
  { x: 48, y: 1000, size: 88 },
  { x: 48, y: 2000, size: 88 },
  { x: 48, y: 2900, size: 88 },
]
const vh = 900
const t = buildTimeline([hero, ...docks], 64, vh)

describe('craft timeline', () => {
  it('keeps scroll inputs strictly ascending', () => {
    for (let i = 1; i < t.input.length; i++) expect(t.input[i]).toBeGreaterThan(t.input[i - 1])
  })

  it('sits exactly on the hero anchor at the top of the page, at full size, with its light', () => {
    expect(interpolate(0, t.input, t.x)).toBe(hero.x)
    expect(interpolate(0, t.input, t.y)).toBe(hero.y)
    expect(interpolate(0, t.input, t.scale)).toBe(1)
    expect(interpolate(0, t.input, t.beam)).toBe(1)
  })

  it('docks at each section when that dock is 30% down the viewport, small and without light', () => {
    for (const d of docks) {
      const s = 64 + d.y - vh * 0.3
      expect(interpolate(s, t.input, t.x)).toBeCloseTo(d.x, 5)
      expect(interpolate(s, t.input, t.y)).toBeCloseTo(d.y, 5)
      expect(interpolate(s, t.input, t.scale)).toBeCloseTo(88 / 500, 5)
      expect(interpolate(s, t.input, t.beam)).toBe(0)
      expect(interpolate(s, t.input, t.rotate)).toBe(0)
    }
  })

  it('stays docked while the section is read, then stays at the last dock', () => {
    const between = 64 + docks[1].y - vh * 0.3 + 50
    expect(interpolate(between, t.input, t.y)).toBeCloseTo(docks[1].y, 5)
    expect(interpolate(1e6, t.input, t.y)).toBe(docks[2].y)
  })

  it('tilts and swings sideways only mid-flight', () => {
    const depart = 64 + docks[1].y - vh * 0.95
    const arrive = 64 + docks[1].y - vh * 0.3
    const mid = (depart + arrive) / 2
    expect(interpolate(mid, t.input, t.rotate)).toBeGreaterThan(0)
    expect(interpolate(mid, t.input, t.x)).toBeGreaterThan(docks[0].x)
  })
})

describe('interpolate', () => {
  it('clamps and interpolates linearly', () => {
    expect(interpolate(-5, [0, 10], [1, 2])).toBe(1)
    expect(interpolate(5, [0, 10], [1, 2])).toBe(1.5)
    expect(interpolate(50, [0, 10], [1, 2])).toBe(2)
  })
})
