import { useCallback, useEffect, useReducer, useRef } from 'react'

/** One observation player: a single activeFrameIndex for image, date, timeline, markers and charts. */

export interface PlayerState {
  count: number
  index: number
  playing: boolean
  fps: number
}

export type PlayerAction =
  | { type: 'reset'; count: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; index: number }
  | { type: 'tick' }
  | { type: 'speed'; fps: number }

export const SPEEDS = [0.5, 1, 2, 4] as const

export const initialPlayer: PlayerState = { count: 0, index: 0, playing: false, fps: 1 }

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'reset':
      return { ...s, count: Math.max(0, a.count), index: 0, playing: false }
    case 'play':
      return s.count >= 2 ? { ...s, playing: true } : s
    case 'pause':
      return { ...s, playing: false }
    case 'toggle':
      return s.count >= 2 ? { ...s, playing: !s.playing } : s
    case 'next':
      return s.count ? { ...s, index: (s.index + 1) % s.count } : s
    case 'prev':
      return s.count ? { ...s, index: (s.index - 1 + s.count) % s.count } : s
    case 'seek': {
      if (!s.count) return s
      const index = Math.max(0, Math.min(s.count - 1, Math.round(a.index)))
      return { ...s, index, playing: false }
    }
    case 'tick':
      return s.playing && s.count >= 2 ? { ...s, index: (s.index + 1) % s.count } : s
    case 'speed':
      return { ...s, fps: a.fps }
  }
}

export function usePlayer() {
  const [state, dispatch] = useReducer(playerReducer, initialPlayer)
  const last = useRef(0)

  useEffect(() => {
    if (!state.playing) return
    let raf = 0
    last.current = performance.now()
    const interval = 1000 / state.fps
    const loop = (now: number) => {
      // Avoid a burst of frames after the tab was hidden.
      if (now - last.current > interval * 4) last.current = now
      if (now - last.current >= interval) {
        last.current = now
        dispatch({ type: 'tick' })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onVis = () => {
      if (document.hidden) dispatch({ type: 'pause' })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [state.playing, state.fps])

  const reset = useCallback((count: number) => dispatch({ type: 'reset', count }), [])
  return { state, dispatch, reset }
}
