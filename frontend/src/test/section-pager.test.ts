import { describe, expect, it } from 'vitest'
import { cubicBezier, glideMs, pickTarget, tidyStops } from '../pages/landing/pager'

const visible = 836
// Hero, intro, about, CTA (one screen each), then the footer at the page bottom.
const stops = [0, 836, 1672, 2508, 2700]

describe('section pager', () => {
  it('sorts stops and drops near-duplicates', () => {
    expect(tidyStops([836, 0, 838, 1672])).toEqual([0, 836, 1672])
  })

  it('glides to the next or previous section from rest', () => {
    expect(pickTarget(0, 1, stops, visible)).toBe(836)
    expect(pickTarget(836, 1, stops, visible)).toBe(1672)
    expect(pickTarget(836, -1, stops, visible)).toBe(0)
    expect(pickTarget(2508, 1, stops, visible)).toBe(2700)
    expect(pickTarget(2700, -1, stops, visible)).toBe(2508)
  })

  it('snaps to the nearest section edge from a position in between', () => {
    expect(pickTarget(400, 1, stops, visible)).toBe(836)
    expect(pickTarget(400, -1, stops, visible)).toBe(0)
  })

  it('leaves native scrolling at both ends of the page', () => {
    expect(pickTarget(0, -1, stops, visible)).toBeNull()
    expect(pickTarget(2700, 1, stops, visible)).toBeNull()
  })

  it('scrolls natively through a section taller than the screen until its edge shows', () => {
    const tall = [0, 836, 2400, 3000]
    expect(pickTarget(836, 1, tall, visible)).toBeNull()
    expect(pickTarget(1600, 1, tall, visible)).toBe(2400)
    expect(pickTarget(2400, -1, tall, visible)).toBeNull()
    expect(pickTarget(1200, -1, tall, visible)).toBe(836)
  })

  it('takes about 0.9 s for a full screen and less for short hops', () => {
    expect(glideMs(visible, visible)).toBe(900)
    expect(glideMs(190, visible)).toBeLessThan(600)
    expect(glideMs(5000, visible)).toBe(950)
  })

  it('eases from 0 to 1 monotonically', () => {
    const ease = cubicBezier(0.45, 0.05, 0.2, 1)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let prev = 0
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = ease(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
