import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { ApiError } from '../../shared/api/errors'
import type { FramesParams, FramesResponse } from '../../shared/api/types'

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

  const ensureDiffs = useCallback(() => {
    if (!data || imageOwner !== data || diffBitmaps.current.length > 0 || !data.frames.some((f) => f.diff_png)) return
    const gen = generation.current
    const ctrl = ctrlRef.current
    if (!ctrl || ctrl.signal.aborted) return
    setDiffStatus('loading')
    const local: (ImageBitmap | null)[] = new Array(data.frames.length).fill(null)
    diffBitmaps.current = local
    let anyFail = false
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
          anyFail = true
        }
      },
    ).then(() => {
      if (gen !== generation.current || ctrl.signal.aborted) return
      setDiffStatus(anyFail ? 'error' : 'ready')
    })
    // State setters are stable; listing them lets the React Compiler keep this memoization.
  }, [data, imageOwner, priorities, setDiffs, setDiffStatus])

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
