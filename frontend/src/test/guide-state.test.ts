// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readGuide, writeGuide } from '../features/guide/guide-state'

describe('guide state', () => {
  beforeEach(() => localStorage.clear())

  it('starts on for a first visit', () => {
    expect(readGuide('')).toBe(true)
  })

  it('remembers the last choice', () => {
    writeGuide(false)
    expect(readGuide('?q=barnard')).toBe(false)
    writeGuide(true)
    expect(readGuide('')).toBe(true)
  })

  it('lets the URL win over the saved choice', () => {
    writeGuide(false)
    expect(readGuide('?guide=1')).toBe(true)
    writeGuide(true)
    expect(readGuide('?guide=0')).toBe(false)
  })
})
