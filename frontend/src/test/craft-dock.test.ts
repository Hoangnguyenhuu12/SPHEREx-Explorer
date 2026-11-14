import { describe, expect, it } from 'vitest'
import { chooseDock, DOCK_MAX, DOCK_MIN, type Rect } from '../features/artwork/craftDock'

const r = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })
const hits = (d: { x: number; y: number; size: number }, t: Rect[]) =>
  t.some((b) => d.x < b.right && d.x + d.size > b.left && d.y < b.bottom && d.y + d.size > b.top)

describe('chooseDock', () => {
  it('uses the left margin beside the heading on wide screens', () => {
    const text = [r(240, 1096, 700, 1140), r(240, 1150, 900, 1180)]
    const d = chooseDock({ section: r(0, 1000, 1920, 1800), contentLeft: 240, text })
    expect(d.size).toBe(DOCK_MAX)
    expect(d.x + d.size).toBeLessThanOrEqual(240)
    expect(hits(d, text)).toBe(false)
  })

  it('lines up with the heading in the margin even when other content starts higher', () => {
    const heading = r(240, 1400, 600, 1444)
    const text = [r(1300, 1100, 1560, 1420), heading]
    const d = chooseDock({ section: r(0, 1000, 1920, 2000), contentLeft: 240, text, heading })
    expect(d.y).toBeCloseTo(1400 - d.size * 0.25, 5)
    expect(hits(d, text)).toBe(false)
  })

  it('falls back to the top padding when the margin is narrow', () => {
    const text = [r(48, 1096, 500, 1140)]
    const d = chooseDock({ section: r(0, 1000, 1366, 1800), contentLeft: 48, text })
    expect(d.y + d.size).toBeLessThanOrEqual(1096)
    expect(hits(d, text)).toBe(false)
  })

  it('shrinks to fit a short padding and never covers text', () => {
    const text = [r(16, 1070, 380, 1110), r(16, 1120, 380, 1200)]
    const d = chooseDock({ section: r(0, 1000, 390, 1800), contentLeft: 16, text })
    expect(d.size).toBeLessThan(DOCK_MAX)
    expect(d.size).toBeGreaterThanOrEqual(DOCK_MIN)
    expect(hits(d, text)).toBe(false)
  })

  it('avoids a wide element that starts high in the section', () => {
    // A preview card on the left of the padding area forces the craft to shrink or move.
    const text = [r(48, 1040, 300, 1300), r(320, 1096, 800, 1140)]
    const d = chooseDock({ section: r(0, 1000, 1366, 1800), contentLeft: 48, text })
    expect(d.size).toBeGreaterThanOrEqual(DOCK_MIN)
    expect(d.y).toBeGreaterThanOrEqual(1000)
  })
})
