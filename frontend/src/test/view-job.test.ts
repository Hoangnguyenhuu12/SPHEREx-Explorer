import { describe, expect, it } from 'vitest'
import { viewJobToFramesResponse } from '../features/blink/useViewJob'
import type { ViewJobStatusResponse } from '../shared/api/types'

describe('viewJobToFramesResponse', () => {
  it('converts partial and completed view jobs into FramesResponse', () => {
    const job: ViewJobStatusResponse = {
      job_id: 'abc123',
      status: 'fetching',
      progress: { found: 6, done: 2 },
      queue_position: 0,
      target: {
        ra: 269.452,
        dec: 4.693,
        name: "Barnard's Star",
        target_key: 'barnard',
        resolved_by: 'targets_table',
      },
      detector: 5,
      fov_arcmin: 8,
      frames: [
        {
          id: 'f-0',
          mjd: 60800,
          iso: '2025-05-05T00:00:00Z',
          wavelength_um: 3.1,
          bandwidth_um: 0.4,
          release: 'dr1',
          survey: 1,
          bad_pixel_frac: 0.01,
          predicted_px: [29, 29],
          png: '/api/frames/f-0.png',
          diff_png: '/api/frames/f-0/diff.png',
        },
        {
          id: 'f-1',
          mjd: 60900,
          iso: '2025-08-13T00:00:00Z',
          wavelength_um: 3.1,
          bandwidth_um: 0.4,
          release: 'dr1',
          survey: 1,
          bad_pixel_frac: 0.01,
          predicted_px: [29, 29],
          png: '/api/frames/f-1.png',
          diff_png: '/api/frames/f-1/diff.png',
        },
      ],
      error: null,
    }

    const out = viewJobToFramesResponse(job, {
      ra: 269.452,
      dec: 4.693,
      detector: 5,
      size: 0.1667,
      maxFrames: 24,
    })

    expect(out.detector).toBe(5)
    expect(out.frames).toHaveLength(2)
    expect(out.reference_frame_id).toBe('f-0')
    expect(out.warnings).toContain('FEW_FRAMES')
  })
})
