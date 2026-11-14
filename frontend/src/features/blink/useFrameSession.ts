import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { ApiError, isAbort } from '../../shared/api/errors'
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
  ensureDiffs: () => void
  diffStatus: 'idle' | 'loading' | 'ready' | 'error'
}

export function framesQueryKey(p: FramesParams) {
  return ['frames', config.useMock ? 'mock' : config.apiBaseUrl, p.ra, p.dec, p.detector, p.size, p.maxFrames, p.targetKey ?? null] as const
}

async function decodeAll(
  urls: string[],
  signal: AbortSignal,
  onEach: (i: number, bmp: ImageBitmap | null, err?: unknown) => void,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const i = next++
      if (signal.aborted) return
      try {
        const bmp = await api.image(urls[i], signal)
        if (signal.aborted) {
          bmp.close()
          return
        }
        onEach(i, bmp)
      } catch (err) {
        if (isAbort(err)) return
        onEach(i, null, err)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(config.imageConcurrency, urls.length) }, worker))
}

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
  const [decoding, setDecoding] = useState(false)
  const [diffStatus, setDiffStatus] = useState<FrameSession['diffStatus']>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const generation = useRef(0)
  const ctrlRef = useRef<AbortController | null>(null)
  const recovered = useRef(false)
  const keyString = JSON.stringify(key)

  // Reset the per-selection recovery budget.
  useEffect(() => {
    recovered.current = false
    setStartedAt(params ? Date.now() : null)
  }, [keyString]) // eslint-disable-line react-hooks/exhaustive-deps

  const data = query.data ?? null

  useEffect(() => {
    const gen = ++generation.current
    ctrlRef.current?.abort()
    setOriginals([])
    setDiffs([])
    setFailed([])
    setLoaded(0)
    setDecodeError(null)
    setDiffStatus('idle')
    if (!data) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const local: (ImageBitmap | null)[] = new Array(data.frames.length).fill(null)
    const fails: number[] = []
    let expired = false
    setDecoding(true)
    decodeAll(
      data.frames.map((f) => f.png),
      ctrl.signal,
      (i, bmp, err) => {
        if (gen !== generation.current) {
          bmp?.close()
          return
        }
        if (bmp) local[i] = bmp
        else {
          fails.push(i)
          if (err instanceof ApiError && err.code === 'FRAME_NOT_FOUND') expired = true
        }
        setLoaded((n) => n + 1)
      },
    ).then(() => {
      if (gen !== generation.current || ctrl.signal.aborted) return
      if (expired && !recovered.current) {
        // Backend restarted or evicted images: refetch metadata once, never loop.
        recovered.current = true
        closeAll(local)
        void qc.resetQueries({ queryKey: key, exact: true })
        return
      }
      setOriginals(local)
      setFailed(fails.sort((a, b) => a - b))
      setDecoding(false)
      if (expired) setDecodeError(new ApiError('FRAME_NOT_FOUND', 'Images expired twice'))
    })
    return () => {
      ctrl.abort()
      closeAll(local)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const ensureDiffs = useCallback(() => {
    if (!data || diffStatus !== 'idle') return
    const gen = generation.current
    const ctrl = ctrlRef.current
    if (!ctrl) return
    setDiffStatus('loading')
    const local: (ImageBitmap | null)[] = new Array(data.frames.length).fill(null)
    let anyFail = false
    decodeAll(
      data.frames.map((f) => f.diff_png),
      ctrl.signal,
      (i, bmp) => {
        if (gen !== generation.current) {
          bmp?.close()
          return
        }
        if (bmp) local[i] = bmp
        else anyFail = true
      },
    ).then(() => {
      if (gen !== generation.current || ctrl.signal.aborted) {
        closeAll(local)
        return
      }
      setDiffs(local)
      setDiffStatus(anyFail ? 'error' : 'ready')
    })
  }, [data, diffStatus])

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
    if (decodeError) return 'error'
    if (decoding) return 'decoding'
    return data ? 'ready' : 'idle'
  }, [params, query.isError, query.isFetching, query.isPending, data, decodeError, decoding])

  return {
    status,
    data,
    originals,
    diffs,
    failed,
    loaded,
    total: data?.frames.length ?? 0,
    error: query.error ?? decodeError,
    startedAt,
    cancel,
    retry,
    ensureDiffs,
    diffStatus,
  }
}
