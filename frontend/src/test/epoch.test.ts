import { describe, expect, it } from 'vitest'
import { DR1_MAP_MJD, J2000_MJD, mapPosition, positionAt } from '../shared/config/epoch'
import { TARGET_BY_KEY } from '../shared/config/targets'

describe('target positions at the SPHEREx DR1 map epoch', () => {
  const barnard = TARGET_BY_KEY.get('barnard')!
  it('is unchanged at J2000', () => {
    const p = positionAt(barnard, J2000_MJD)
    expect(p.ra).toBeCloseTo(barnard.raDeg, 9)
    expect(p.dec).toBeCloseTo(barnard.decDeg, 9)
  })
  it("moves Barnard's Star about 4.5′ north by late 2025", () => {
    const p = mapPosition(barnard)
    const years = (DR1_MAP_MJD - J2000_MJD) / 365.25
    expect((p.dec - barnard.decDeg) * 60).toBeCloseTo((10.362394 * years) / 60, 3)
    expect((p.dec - barnard.decDeg) * 60).toBeGreaterThan(4.3)
    expect((p.dec - barnard.decDeg) * 60).toBeLessThan(4.7)
  })
  it('keeps every target within a few arcminutes of its catalogue position', () => {
    for (const t of TARGET_BY_KEY.values()) {
      const p = mapPosition(t)
      const dDec = (p.dec - t.decDeg) * 60
      const dRa = (p.ra - t.raDeg) * 60 * Math.cos((t.decDeg * Math.PI) / 180)
      expect(Math.hypot(dRa, dDec)).toBeLessThan(6)
    }
  })
})
