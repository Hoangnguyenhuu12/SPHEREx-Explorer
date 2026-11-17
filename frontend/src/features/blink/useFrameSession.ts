import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { ApiError } from '../../shared/api/errors'
import type { Frame, FramesParams, FramesResponse } from '../../shared/api/types'

/**
 * Frame metadata → decoded image sequence. Late responses for an older selection never replace
 * the current one (generation token + AbortController). Decoded bitmaps live outside the JSON cache.
 */

export type SessionStatus = 'idle' | 'fetching' | 'decoding' | 'ready' | 'error'

export interface FrameSession {
  status: SessionStatus
  data: FramesResponse | null
  originals: (ImageBitmap | null)[]
  diffs: (ImageBitmap | null)[]
  failed: number[]
  loaded: number
  total: number
  error: unknown
  startedAt: number | null
  cancel: () => void
  retry: () => void
  prioritizeFrames: (indices: readonly number[]) => void
  ensureDiffs: () => void
  diffStatus: 'idle' | 'loading' | 'ready' | 'error'
}

export function framesQueryKey(p: FramesParams) {
  return ['frames', config.useMock ? 'mock' : config.apiBaseUrl, p.ra, p.dec, p.detector, p.size, p.maxFrames, p.targetKey ?? null, p.timeline ?? null] as const
}

async function decodeAll(
  urls: (string | null)[],
  signal: AbortSignal,
  priorities: () => readonly number[],
  onEach: (i: number, bmp: ImageBitmap | null, err?: unknown) => void,
): Promise<void> {
  const pending = new Set(urls.flatMap((url, i) => url === null ? [] : [i]))
  const worker = async () => {
    while (pending.size > 0 && !signal.aborted) {
      const i = priorities().find((index) => pending.has(index)) ?? pending.values().next().value!
      pending.delete(i)
      let bmp: ImageBitmap
      try {
        bmp = await api.image(urls[i]!, signal)
      } catch (err) {
        if (!signal.aborted) onEach(i, null, err)
        continue
      }
      if (signal.aborted) bmp.close()
      else onEach(i, bmp)
    }
  }
  await Promise.all(Array.from({ length: Math.min(config.imageConcurrency, pending.size) }, worker))
}

const EMPTY_BITMAPS: (ImageBitmap | null)[] = []
const EMPTY_INDICES: number[] = []

function closeAll(list: (ImageBitmap | null)[]) {
  for (const b of list) b?.close()
}

function lumaMedianSample(data: Uint8ClampedArray): number {
  const step = Math.max(1, Math.floor((data.length / 4) / 256))
  const samples: number[] = []
  for (let i = 0; i < data.length; i += 4 * step) {
    samples.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  }
  if (samples.length === 0) return 0
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

async function computeClientDiffBitmap(cur: ImageBitmap, ref: ImageBitmap): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  const w = Math.max(1, cur.width)
  const h = Math.max(1, cur.height)
  const makeCanvas = () => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  const cCur = makeCanvas()
  const cRef = makeCanvas()
  const ctxCur = cCur.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  const ctxRef = cRef.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctxCur || !ctxRef) return null

  ctxCur.drawImage(cur, 0, 0, w, h)
  ctxRef.drawImage(ref, 0, 0, w, h)
  const imgCur = ctxCur.getImageData(0, 0, w, h)
  const imgRef = ctxRef.getImageData(0, 0, w, h)
  const dCur = imgCur.data
  const dRef = imgRef.data
  const medCur = lumaMedianSample(dCur)
  const medRef = lumaMedianSample(dRef)

  const out = ctxCur.createImageData(w, h)
  const dOut = out.data
  const gain = 1.4
  for (let i = 0; i < dCur.length; i += 4) {
    const lCur = dCur[i] * 0.299 + dCur[i + 1] * 0.587 + dCur[i + 2] * 0.114 - medCur
    const lRef = dRef[i] * 0.299 + dRef[i + 1] * 0.587 + dRef[i + 2] * 0.114 - medRef
    const v = Math.max(0, Math.min(255, Math.round(128 + (lCur - lRef) * gain)))
    dOut[i] = v
    dOut[i + 1] = v
    dOut[i + 2] = v
    dOut[i + 3] = 255
  }
  return createImageBitmap(out)
}

function sameMissionRefIndex(frames: readonly Frame[], index: number): number {
  const mission = frames[index]?.mission === 'unWISE' ? 'unWISE' : 'SPHEREx'
  const first = frames.findIndex((f) => (f.mission === 'unWISE' ? 'unWISE' : 'SPHEREx') === mission)
  if (first >= 0 && frames.filter((f) => (f.mission === 'unWISE' ? 'unWISE' : 'SPHEREx') === mission).length >= 2) {
    return first
  }
  return 0
}

export function useFrameSession(params: FramesParams | null): FrameSession {
  const qc = useQueryClient()
  const key = params ? framesQueryKey(params) : (['frames', 'none'] as const)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.frames(params!, signal),
    enabled: params !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnMount: false,
  })

  const [originals, setOriginals] = useState<(ImageBitmap | null)[]>([])
  const [diffs, setDiffs] = useState<(ImageBitmap | null)[]>([])
  const [failed, setFailed] = useState<number[]>([])
  const [loaded, setLoaded] = useState(0)
  const [decodeError, setDecodeError] = useState<unknown>(null)
  const [imageOwner, setImageOwner] = useState<FramesResponse | null>(null)
  const [diffStatus, setDiffStatus] = useState<FrameSession['diffStatus']>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const generation = useRef(0)
  const ctrlRef = useRef<AbortController | null>(null)
  const diffBitmaps = useRef<(ImageBitmap | null)[]>([])
  const diffRequested = useRef(false)
  const framePriority = useRef<{ data: FramesResponse; indices: readonly number[] } | null>(null)
  const recovered = useRef(false)
  const keyString = JSON.stringify(key)

  // Reset the per-selection recovery budget.
  useEffect(() => {
    recovered.current = false
    setStartedAt(params ? Date.now() : null)
  }, [keyString]) // eslint-disable-line react-hooks/exhaustive-deps

  const data = query.data ?? null
  const prioritizeFrames = useCallback((indices: readonly number[]) => {
    if (data) framePriority.current = { data, indices }
  }, [data])
  const priorities = useCallback(() => (
    framePriority.current?.data === data ? framePriority.current.indices : EMPTY_INDICES
  ), [data])

  useEffect(() => {
    const gen = ++generation.current
    ctrlRef.current?.abort()
    setOriginals([])
    setDiffs([])
    setFailed([])
    setLoaded(0)
    setDecodeError(null)
    setDiffStatus('idle')
    diffRequested.current = false
    setImageOwner(data)
    if (!data) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const local: (ImageBitmap | null)[] = new Array(data.frames.length).fill(null)
    const fails: number[] = []
    let expired = false
    let firstError: unknown
    decodeAll(
      data.frames.map((f) => f.png),
      ctrl.signal,
      priorities,
      (i, bmp, err) => {
        if (gen !== generation.current) {
          bmp?.close()
          return
        }
        if (bmp) {
          local[i] = bmp
          setOriginals([...local])
        } else {
          fails.push(i)
          firstError ??= err
          setFailed([...fails])
          if (err instanceof ApiError && err.code === 'FRAME_NOT_FOUND') expired = true
        }
        setLoaded((n) => n + 1)
      },
    ).then(() => {
      if (gen !== generation.current || ctrl.signal.aborted) return
      if (expired && !recovered.current) {
        // Backend restarted or evicted images: refetch metadata once, never loop.
        recovered.current = true
        void qc.resetQueries({ queryKey: key, exact: true })
        return
      }
      if (fails.length > 0 && fails.length === local.length) setDecodeError(firstError)
    })
    return () => {
      ctrl.abort()
      closeAll(local)
      closeAll(diffBitmaps.current)
      diffBitmaps.current = []
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillClientDiffs = useCallback(
    async (gen: number, currentData: FramesResponse, currentOriginals: (ImageBitmap | null)[]) => {
      const target = diffBitmaps.current.length === currentData.frames.length
        ? diffBitmaps.current
        : new Array<ImageBitmap | null>(currentData.frames.length).fill(null)
      diffBitmaps.current = target
      let updated = false
      for (let i = 0; i < currentData.frames.length; i++) {
        if (gen !== generation.current) return
        if (target[i]) continue
        const cur = currentOriginals[i]
        const refIdx = sameMissionRefIndex(currentData.frames, i)
        const ref = currentOriginals[refIdx]
        if (!cur || !ref) continue
        const bmp = await computeClientDiffBitmap(cur, ref)
        if (gen !== generation.current) {
          bmp?.close()
          return
        }
        if (bmp) {
          target[i] = bmp
          updated = true
        }
      }
      if (gen !== generation.current) return
      if (updated) setDiffs([...target])
      const allReady = currentData.frames.every((_, idx) => Boolean(target[idx]) || !currentOriginals[idx])
      setDiffStatus(allReady ? 'ready' : 'loading')
    },
    [],
  )

  useEffect(() => {
    if (!diffRequested.current || !data || imageOwner !== data) return
    void fillClientDiffs(generation.current, data, originals)
  }, [originals, data, imageOwner, fillClientDiffs])

  const ensureDiffs = useCallback(() => {
    if (!data || imageOwner !== data || diffRequested.current) return
    diffRequested.current = true
    const gen = generation.current
    const ctrl = ctrlRef.current
    if (!ctrl || ctrl.signal.aborted) return
    setDiffStatus('loading')
    const local: (ImageBitmap | null)[] = new Array(data.frames.length).fill(null)
    diffBitmaps.current = local

    const missions = new Set(data.frames.map((f) => f.mission ?? 'SPHEREx'))
    const canUseServerDiffs = missions.size <= 1 && data.frames.every((f) => Boolean(f.diff_png))
    if (!canUseServerDiffs) {
      void fillClientDiffs(gen, data, originals)
      return
    }

    let anyMissing = false
    decodeAll(
      data.frames.map((f) => f.diff_png),
      ctrl.signal,
      priorities,
      (i, bmp) => {
        if (gen !== generation.current) {
          bmp?.close()
          return
        }
        if (bmp) {
          local[i] = bmp
          setDiffs([...local])
        } else {
          anyMissing = true
        }
      },
    ).then(() => {
      if (gen !== generation.current || ctrl.signal.aborted) return
      if (anyMissing) {
        void fillClientDiffs(gen, data, originals)
      } else {
        setDiffStatus('ready')
      }
    })
  }, [data, imageOwner, originals, priorities, fillClientDiffs])

  const cancel = useCallback(() => {
    void qc.cancelQueries({ queryKey: key, exact: true })
    ctrlRef.current?.abort()
  }, [qc, keyString]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    recovered.current = false
    setStartedAt(Date.now())
    void qc.resetQueries({ queryKey: key, exact: true })
  }, [qc, keyString]) // eslint-disable-line react-hooks/exhaustive-deps

  const status: SessionStatus = useMemo(() => {
    if (!params) return 'idle'
    if (query.isError) return 'error'
    if (query.isFetching || (!data && query.isPending)) return 'fetching'
    if (decodeError && imageOwner === data) return 'error'
    if (data && data.frames.length > 0 && (imageOwner !== data || loaded < data.frames.length)) return 'decoding'
    return data ? 'ready' : 'idle'
  }, [params, query.isError, query.isFetching, query.isPending, data, decodeError, imageOwner, loaded])

  return {
    status,
    data,
    originals: imageOwner === data ? originals : EMPTY_BITMAPS,
    diffs: imageOwner === data ? diffs : EMPTY_BITMAPS,
    failed: imageOwner === data ? failed : EMPTY_INDICES,
    loaded: imageOwner === data ? loaded : 0,
    total: data?.frames.length ?? 0,
    error: query.error ?? decodeError,
    startedAt,
    cancel,
    retry,
    prioritizeFrames,
    ensureDiffs,
    diffStatus: imageOwner === data ? diffStatus : 'idle',
  }
}
