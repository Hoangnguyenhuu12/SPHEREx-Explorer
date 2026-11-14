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
  return ['frames', config.useMock ? 'mock' : config.apiBaseUrl, p.ra, p.dec, p.detector, p.size, p.maxFrames, p.targetKey ?? null, p.timeline ?? null] as const
}

async function decodeAll(
  urls: (string | null)[],
  signal: AbortSignal,
  onEach: (i: number, bmp: ImageBitmap | null, err?: unknown) => void,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const i = next++
      if (signal.aborted) return
      try {
        const url = urls[i]
        if (url === null) continue
        const bmp = await api.image(url, signal)
        if (signal.aborted) {
          bmp.close()
          return
        }
        onEach(i, bmp)
      } catch (err) {
        if (signal.aborted || isAbort(err)) return
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
  const [imageOwner, setImageOwner] = useState<FramesResponse | null>(null)
  const [diffStatus, setDiffStatus] = useState<FrameSession['diffStatus']>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const generation = useRef(0)
  const ctrlRef = useRef<AbortController | null>(null)
  const diffBitmaps = useRef<(ImageBitmap | null)[]>([])
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
    if (!data || imageOwner !== data || diffStatus !== 'idle' || !data.frames.some((f) => f.diff_png)) return
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
      diffBitmaps.current = local
      setDiffStatus(anyFail ? 'error' : 'ready')
    })
  }, [data, imageOwner, diffStatus])

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
    originals: imageOwner === data ? originals : [],
    diffs: imageOwner === data ? diffs : [],
    failed: imageOwner === data ? failed : [],
    loaded: imageOwner === data ? loaded : 0,
    total: data?.frames.length ?? 0,
    error: query.error ?? decodeError,
    startedAt,
    cancel,
    retry,
    ensureDiffs,
    diffStatus,
  }
}
