import { describe, expect, it } from 'vitest'
import { ALLWISE_MAP_MJD, DR1_MAP_MJD, GAIA_DR3_EPOCH_JYEAR, GAIA_DR3_EPOCH_MJD, J2000_MJD, jyearToMjd, mapPosition, positionAt } from '../shared/config/epoch'
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
  it('propagates Gaia DR3 sources from J2016.0 to SPHEREx DR1 and AllWISE epochs', () => {
    expect(jyearToMjd(2000)).toBe(J2000_MJD)
    expect(jyearToMjd(GAIA_DR3_EPOCH_JYEAR)).toBe(GAIA_DR3_EPOCH_MJD)
    const gaiaStar = {
      raDeg: 269.4485,
      decDeg: 4.7394,
      pmRaCosDecMasYr: -801.551,
      pmDecMasYr: 10362.394,
      refEpochJyear: 2016.0,
    }
    const atDr1 = positionAt(gaiaStar, DR1_MAP_MJD)
    const yearsDr1 = (DR1_MAP_MJD - GAIA_DR3_EPOCH_MJD) / 365.25
    expect((atDr1.dec - gaiaStar.decDeg) * 3600).toBeCloseTo((10362.394 * yearsDr1) / 1000, 4)

    const atWise = positionAt(gaiaStar, ALLWISE_MAP_MJD, { refEpochJyear: 2016.0 })
    const yearsWise = (ALLWISE_MAP_MJD - GAIA_DR3_EPOCH_MJD) / 365.25
    expect(yearsWise).toBeLessThan(0)
    expect((atWise.dec - gaiaStar.decDeg) * 3600).toBeCloseTo((10362.394 * yearsWise) / 1000, 4)
  })
  it('keeps catalog coordinates unchanged when proper motion is missing', () => {
    const noPm = { raDeg: 133.8, decDeg: -7.2, pmRaCosDecMasYr: null, pmDecMasYr: 100.0, refEpochJyear: 2016.0 }
    const res = positionAt(noPm, DR1_MAP_MJD)
    expect(res.ra).toBeCloseTo(133.8, 9)
    expect(res.dec).toBeCloseTo(-7.2, 9)
  })
})
