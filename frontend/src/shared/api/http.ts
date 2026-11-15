import { config } from '../../app/config'
import type { ObservationApi, TargetQuery } from './adapter'
import { ApiError } from './errors'
import type { ErrorCode, FramesParams } from './types'

/** Adapter for the synchronous API 0.1 (E1–E7). */

function abortReason(signal?: AbortSignal): ApiError {
  const reason = signal?.reason
  if (reason instanceof ApiError) return reason
  return new ApiError('ABORTED', 'Request cancelled')
}

function link(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(abortReason(signal))
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new ApiError('CLIENT_TIMEOUT', 'Client watchdog expired')), timeoutMs)
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

async function request(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal, timeoutMs = 30_000): Promise<Response> {
  const url = new URL(path, config.apiBaseUrl + '/')
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const linked = link(signal, timeoutMs)
  try {
    const res = await fetch(url, { signal: linked.signal, mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw await toApiError(res)
    return res
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (linked.signal.aborted) throw abortReason(linked.signal)
    throw new ApiError('NETWORK', 'Network or CORS failure')
  } finally {
    linked.done()
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: ErrorCode = res.status === 404 ? 'NO_FRAMES' : res.status >= 500 ? 'INTERNAL' : 'BAD_PARAM'
  let message = res.statusText
  let details: unknown = null
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
    if (body.error?.code) code = body.error.code as ErrorCode
    message = body.error?.message ?? message
    details = body.error?.details ?? null
  } catch {
    // PNG endpoints may not return JSON; keep status-derived code.
  }
  return new ApiError(code, message, res.status, details)
}

export const httpApi: ObservationApi = {
  mode: 'live',

  async health(signal) {
    const res = await request('api/health', {}, signal, 70_000)
    return res.json()
  },

  async resolve(name, signal) {
    const res = await request('api/resolve', { name }, signal)
    return res.json()
  },

  async frames(p: FramesParams, signal) {
    const res = await request(
      'api/frames',
      { ra: p.ra, dec: p.dec, detector: p.detector, size: p.size, max_frames: p.maxFrames, target_key: p.targetKey, timeline: p.timeline },
      signal,
      config.framesTimeoutMs,
    )
    return res.json()
  },

  async image(url, signal) {
    const abs = new URL(url, config.apiBaseUrl + '/').href
    const linked = link(signal, 30_000)
    try {
      const res = await fetch(abs, { signal: linked.signal, mode: 'cors', credentials: 'omit' })
      if (!res.ok) {
        const error = await toApiError(res)
        if (res.status === 404 && error.code === 'NO_FRAMES') throw new ApiError('FRAME_NOT_FOUND', 'Frame image expired', 404)
        throw error
      }
      const blob = await res.blob()
      return await createImageBitmap(blob)
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (linked.signal.aborted) throw abortReason(linked.signal)
      throw new ApiError('NETWORK', 'Image could not be loaded')
    } finally {
      linked.done()
    }
  },

  async photometry(q: TargetQuery, signal) {
    const res = await request('api/photometry', { ra: q.ra, dec: q.dec, detector: q.detector, target_key: q.targetKey }, signal, 70_000)
    return res.json()
  },

  async astrometry(q: TargetQuery, signal) {
    const res = await request('api/astrometry', { ra: q.ra, dec: q.dec, detector: q.detector, target_key: q.targetKey }, signal, 70_000)
    return res.json()
  },

  async spectrum(q: { ra: number; dec: number }, signal) {
    const res = await request('api/spectrum', { ra: q.ra, dec: q.dec }, signal, 70_000)
    return res.json()
  },

  async flags() {
    throw new ApiError('NOT_AVAILABLE', 'Flags endpoint is not part of API 0.1')
  },

  async hipsLayers(signal) {
    const res = await request('api/sky-archive/hips-layers', {}, signal, 5_000)
    return res.json()
  },

  async skyArchiveGaia(targetKey, signal) {
    const res = await request('api/sky-archive/gaia', { target_key: targetKey }, signal, 10_000)
    return res.json()
  },

  async combinedGaiaOverlays(sequenceId, signal) {
    const res = await request(
      'api/sky-archive/combined-timeline/gaia-overlays',
      { sequence_id: sequenceId, in_frame_only: 'true' },
      signal,
      70_000,
    )
    return res.json()
  },
}
