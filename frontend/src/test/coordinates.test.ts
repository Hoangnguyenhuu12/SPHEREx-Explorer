import { describe, expect, it } from 'vitest'
import { formatDecDms, formatRaHms, looksLikeCoordinates, parseCoordinates, parseDec, parseRa } from '../features/target-search/coordinates'

describe('parseCoordinates', () => {
  it('parses decimal degrees', () => {
    const r = parseCoordinates('269.452 +4.693')
    expect(r.ok && r.coords).toEqual({ ra: 269.452, dec: 4.693 })
  })
  it('parses comma-separated decimals with a negative dec', () => {
    const r = parseCoordinates('133.8189, -7.2470')
    expect(r.ok && r.coords.dec).toBeCloseTo(-7.247, 6)
  })
  it('parses sexagesimal with spaces', () => {
    const r = parseCoordinates('17 57 48.5 +04 41 36')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.coords.ra).toBeCloseTo(269.452083, 5)
      expect(r.coords.dec).toBeCloseTo(4.693333, 5)
    }
  })
  it('parses h/m/s and d/m/s letters and the Unicode minus', () => {
    const r = parseCoordinates('22h04m10.6s −56d46m58s')
    expect(r.ok && r.coords.dec).toBeCloseTo(-56.782778, 5)
  })
  it('keeps the sign of declinations between 0 and −1 degree', () => {
    expect(parseDec('-00:30:00')).toBeCloseTo(-0.5, 9)
    const r = parseCoordinates('10:00:00 -00:30:00')
    expect(r.ok && r.coords.dec).toBeCloseTo(-0.5, 9)
  })
  it('rejects out-of-range values', () => {
    expect(parseCoordinates('400 +10').ok).toBe(false)
    expect(parseCoordinates('10 +95').ok).toBe(false)
    expect(parseRa('24:00:00')).toBeNull()
    expect(parseCoordinates('10 20 30').ok).toBe(false)
  })
  it('rejects minutes or seconds of 60 or more', () => {
    expect(parseDec('+10 60 00')).toBeNull()
  })
})

describe('looksLikeCoordinates', () => {
  it('distinguishes names from numbers', () => {
    expect(looksLikeCoordinates('Barnards Star')).toBe(false)
    expect(looksLikeCoordinates('17 57 48 +04 41 36')).toBe(true)
    expect(looksLikeCoordinates('R Dra')).toBe(false)
  })
})

describe('formatting', () => {
  it('never shows 60 in a lower field after rounding', () => {
    expect(formatRaHms(14.99999999)).toBe('01h 00m 00.00s')
    expect(formatDecDms(-0.9999999)).toBe('−01° 00′ 00.0″')
  })
  it('formats a catalog position', () => {
    expect(formatRaHms(269.45207695861876)).toBe('17h 57m 48.50s')
    expect(formatDecDms(4.693364966576667)).toBe('+04° 41′ 36.1″')
  })
})
