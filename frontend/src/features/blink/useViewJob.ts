import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import type { FramesParams, FramesResponse, ViewJobStatusResponse } from '../../shared/api/types'

export interface ViewJobState {
  active: boolean
  status: ViewJobStatusResponse['status'] | null
  progress: { found: number; done: number } | null
  queuePosition: number
  jobId: string | null
  framesResponse: FramesResponse | null
  error: unknown
  retry: () => void
}

export function viewJobToFramesResponse(job: ViewJobStatusResponse, params: FramesParams): FramesResponse {
  return {
    api_version: '0.1',
    target: {
      ra: job.target.ra,
      dec: job.target.dec,
      name: job.target.name,
      target_key: job.target.target_key,
    },
    detector: params.detector,
    grid: {
      width: 59,
      height: 59,
      pixscale_arcsec: 6.15,
      projection: 'TAN',
      center_ra: job.target.ra,
      center_dec: job.target.dec,
    },
    norm: null,
    reference_frame_id: job.frames[0]?.id ?? null,
    frames: job.frames,
    warnings: job.frames.length > 0 && job.frames.length < 3 ? ['FEW_FRAMES'] : [],
  }
}

export function useViewJob(params: FramesParams | null, enabled: boolean): ViewJobState {
  const fovArcmin = params ? Math.min(30, Math.max(1, Math.round(params.size * 60))) : 8
  const createQ = useQuery({
    queryKey: ['view-job-create', params?.ra, params?.dec, params?.queryName ?? null, fovArcmin, params?.detector],
    queryFn: ({ signal }) => {
      if (!params || !api.createViewJob) {
        throw new Error('View jobs unsupported by API adapter')
      }
      return api.createViewJob(
        params.queryName
          ? { name: params.queryName, fov_arcmin: fovArcmin, detector: params.detector }
          : { ra: params.ra, dec: params.dec, fov_arcmin: fovArcmin, detector: params.detector },
        signal,
      )
    },
    enabled: Boolean(enabled && params && api.createViewJob),
    staleTime: Infinity,
    retry: false,
  })

  const jobId = createQ.data?.job_id ?? null
  const createStatus = createQ.data?.status ?? null
  const pollQ = useQuery({
    queryKey: ['view-job-status', jobId],
    queryFn: ({ signal }) => {
      if (!api.getViewJob) throw new Error('View jobs unsupported by API adapter')
      return api.getViewJob(jobId!, signal)
    },
    enabled: Boolean(enabled && jobId && api.getViewJob && createStatus !== 'ready' && createStatus !== 'failed'),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && s !== 'ready' && s !== 'failed' ? 750 : false
    },
    retry: false,
  })

  const job = pollQ.data ?? createQ.data ?? null
  const framesResponse = job && params && job.frames.length > 0 ? viewJobToFramesResponse(job, params) : null

  return {
    active: enabled,
    status: job?.status ?? null,
    progress: job?.progress ?? null,
    queuePosition: job?.queue_position ?? 0,
    jobId,
    framesResponse,
    error: createQ.error ?? pollQ.error ?? (job?.status === 'failed' ? job.error : null),
    retry: () => {
      void createQ.refetch()
      if (jobId) void pollQ.refetch()
    },
  }
}
