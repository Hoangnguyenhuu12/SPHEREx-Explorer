import { useEffect, useMemo, useReducer } from 'react'
import type { FramesResponse } from '../../shared/api/types'

/** One observation player: a single activeFrameIndex for image, date, timeline, markers and charts. */

export interface PlayerState {
  count: number
  readyIndices: readonly number[]
  index: number
  playing: boolean
  fps: number
}

export type PlayerAction =
  | { type: 'reset'; count: number }
  | { type: 'availability'; readyIndices: readonly number[] }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; index: number }
  | { type: 'tick' }
  | { type: 'speed'; fps: number }

export const SPEEDS = [0.5, 1, 2, 4] as const

export const initialPlayer: PlayerState = { count: 0, readyIndices: [], index: 0, playing: false, fps: 1 }

export function canStep(s: PlayerState): boolean {
  return s.readyIndices.length > 1 || (s.readyIndices.length === 1 && s.readyIndices[0] !== s.index)
}

function step(s: PlayerState, direction: 1 | -1): PlayerState {
  const { readyIndices, index } = s
  if (!canStep(s)) return s
  // Candidates retain their timeline indices, even when a download fails or finishes out of order.
  const next = direction === 1
    ? (readyIndices.find((i) => i > index) ?? readyIndices[0])
    : (readyIndices.findLast((i) => i < index) ?? readyIndices[readyIndices.length - 1])
  return { ...s, index: next }
}

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'reset':
      return { ...s, count: Math.max(0, a.count), readyIndices: [], index: 0, playing: false }
    case 'availability':
      return { ...s, readyIndices: a.readyIndices, playing: s.playing && a.readyIndices.length >= 2 }
    case 'play':
      return s.readyIndices.length >= 2 ? { ...stepToReady(s), playing: true } : s
    case 'pause':
      return { ...s, playing: false }
    case 'toggle':
      return playerReducer(s, { type: s.playing ? 'pause' : 'play' })
    case 'next':
      return step(s, 1)
    case 'prev':
      return step(s, -1)
    case 'seek': {
      if (!s.count) return s
      const index = Math.max(0, Math.min(s.count - 1, Math.round(a.index)))
      return { ...s, index, playing: false }
    }
    case 'tick':
      return s.playing ? step(s, 1) : s
    case 'speed':
      return { ...s, fps: a.fps }
  }
}

function stepToReady(s: PlayerState): PlayerState {
  return s.readyIndices.includes(s.index) ? s : step(s, 1)
}

export function usePlayer(sequence: FramesResponse | null, bitmaps: readonly (ImageBitmap | null)[]) {
  const [state, dispatch] = useReducer(playerReducer, initialPlayer)
  const readyIndices = useMemo(() => bitmaps.flatMap((bitmap, index) => bitmap ? [index] : []), [bitmaps])

  useEffect(() => {
    dispatch({ type: 'reset', count: sequence?.frames.length ?? 0 })
  }, [sequence])

  useEffect(() => {
    dispatch({ type: 'availability', readyIndices })
  }, [sequence, readyIndices])

  useEffect(() => {
    if (!state.playing) return
    let raf = 0
    let last = performance.now()
    const interval = 1000 / state.fps
    const loop = (now: number) => {
      // Avoid a burst of frames after the tab was hidden.
      if (now - last > interval * 4) last = now
      if (now - last >= interval) {
        last = now
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

  return { state, dispatch }
}
