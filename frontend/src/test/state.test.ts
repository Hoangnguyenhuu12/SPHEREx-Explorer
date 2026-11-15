import { describe, expect, it } from 'vitest'
import { initialPlayer, playerReducer, type PlayerState } from '../features/blink/player'
import { overlayReducer } from '../shared/layout/overlay'
import { parseSelection, resolveQuery, serializeSelection } from '../features/target-search/explorer-url'

describe('playerReducer', () => {
  const four: PlayerState = playerReducer(initialPlayer, { type: 'reset', count: 4 })
  it('resets to the first frame, paused', () => {
    expect(four).toMatchObject({ count: 4, index: 0, playing: false })
  })
  it('wraps next and prev', () => {
    expect(playerReducer(four, { type: 'prev' }).index).toBe(3)
    expect(playerReducer({ ...four, index: 3 }, { type: 'next' }).index).toBe(0)
  })
  it('seek clamps and pauses', () => {
    const playing = { ...four, playing: true }
    expect(playerReducer(playing, { type: 'seek', index: 9 })).toMatchObject({ index: 3, playing: false })
    expect(playerReducer(playing, { type: 'seek', index: -2 }).index).toBe(0)
  })
  it('cannot play a single observation', () => {
    const one = playerReducer(initialPlayer, { type: 'reset', count: 1 })
    expect(playerReducer(one, { type: 'play' }).playing).toBe(false)
    expect(playerReducer(one, { type: 'tick' }).index).toBe(0)
  })
  it('ticks only while playing', () => {
    expect(playerReducer(four, { type: 'tick' }).index).toBe(0)
    expect(playerReducer({ ...four, playing: true }, { type: 'tick' }).index).toBe(1)
  })
  it('a new sequence resets a running player', () => {
    const running = { ...four, index: 2, playing: true }
    expect(playerReducer(running, { type: 'reset', count: 3 })).toMatchObject({ index: 0, playing: false, count: 3 })
  })
})

describe('overlayReducer: navigation and target popup are exclusive', () => {
  it('opening the target closes navigation', () => {
    expect(overlayReducer('navigation', { type: 'open', overlay: 'target' })).toBe('target')
  })
  it('opening navigation closes the target popup', () => {
    expect(overlayReducer('target', { type: 'toggleNav' })).toBe('navigation')
  })
  it('closing a non-active overlay keeps the current one', () => {
    expect(overlayReducer('target', { type: 'close', overlay: 'navigation' })).toBe('target')
    expect(overlayReducer('navigation', { type: 'close', overlay: 'navigation' })).toBe('none')
  })
})

describe('explorer URL codec', () => {
  it('round-trips a selection', () => {
    const s = { q: 'barnard', detector: 6, fovArcmin: 4.5 }
    expect(parseSelection(serializeSelection(s))).toEqual(s)
  })
  it('drops invalid detector and FOV values', () => {
    expect(parseSelection('?q=x&det=9&fov=500')).toEqual({ q: 'x', detector: 0, fovArcmin: null })
  })
  it('keeps the sign of a coordinate query through URL encoding', () => {
    const q = '10:00:00 -00:30:00'
    expect(parseSelection(serializeSelection({ q, detector: 0, fovArcmin: null })).q).toBe(q)
    const plus = '17 57 48.5 +04 41 36'
    expect(parseSelection(serializeSelection({ q: plus, detector: 0, fovArcmin: null })).q).toBe(plus)
    const r = resolveQuery(q)
    expect(r.kind === 'coords' && r.coords.dec).toBeCloseTo(-0.5, 9)
  })
  it('parses and serializes compare=1 when set', () => {
    const s = { q: 'wise0855', detector: 0, fovArcmin: null, compare: true }
    expect(serializeSelection(s)).toBe('?q=wise0855&compare=1')
    expect(parseSelection(serializeSelection(s))).toEqual(s)
  })
  it('preserves legacy URLs and round-trips full comparison share state', () => {
    expect(parseSelection('?q=wise0855&det=6')).toEqual({
      q: 'wise0855',
      detector: 6,
      fovArcmin: null,
    })
    const rich = {
      q: 'wise0855',
      detector: 6,
      fovArcmin: 3.5,
      compare: true,
      seq: 'combined' as const,
      band: 'W2',
      frameA: 'wise0855-65fb266ac45d40b26d40416d',
      frameB: 'wise0855-78f2a5ab5dcacebe6e68b8be',
      markA: [29.4, 53.9] as [number, number],
      markB: [70.6, 50.5] as [number, number],
      gaia: true,
      pred: false,
    }
    expect(parseSelection(serializeSelection(rich))).toEqual(rich)
  })
  it('classifies queries', () => {
    expect(resolveQuery('rdra').kind).toBe('target')
    expect(resolveQuery('Vega').kind).toBe('name')
    expect(resolveQuery('').kind).toBe('none')
  })
})
