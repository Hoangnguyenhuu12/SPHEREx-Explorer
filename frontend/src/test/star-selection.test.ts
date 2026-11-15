import { describe, expect, it } from 'vitest'
import { nearestStar } from '../features/blink/star-selection'

describe('catalog star selection', () => {
  const a = { sourceId: '9223372036854775806', px: [10, 20] as [number, number] }
  const b = { sourceId: '9223372036854775807', px: [11, 20] as [number, number] }

  it('selects the nearest marker and preserves its full string ID', () => {
    const view = { scale: 4, offsetX: 20, offsetY: 30 }
    expect(nearestStar([a, b], view, 66, 112)).toBe(b)
    expect(nearestStar([a, b], view, 62, 112)?.sourceId).toBe(a.sourceId)
  })

  it('uses screen-space hit tolerance after pan and zoom', () => {
    for (const scale of [0.5, 1, 12, 48]) {
      const view = { scale, offsetX: -50, offsetY: 70 }
      const x = view.offsetX + 10.5 * scale
      const y = view.offsetY + 20.5 * scale
      expect(nearestStar([a], view, x + 11, y)).toBe(a)
      expect(nearestStar([a], view, x + 13, y)).toBeNull()
    }
  })

  it('does not identify empty sky, unavailable catalogs, or invalid markers', () => {
    const view = { scale: 1, offsetX: 0, offsetY: 0 }
    expect(nearestStar([], view, 10, 20)).toBeNull()
    expect(nearestStar([a], view, 100, 100)).toBeNull()
    expect(nearestStar([{ px: [NaN, 20] }], view, 10, 20)).toBeNull()
  })
})
