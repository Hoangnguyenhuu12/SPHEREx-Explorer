// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayer } from '../features/blink/player'
import { framesQueryKey, useFrameSession } from '../features/blink/useFrameSession'
import { ObservationViewer, type ViewerToggles } from '../features/target-details/ObservationViewer'
import { api } from '../shared/api'
import type { FramesParams, FramesResponse } from '../shared/api/types'

const params: FramesParams = { ra: 10, dec: 0, detector: 2, size: 0.1, maxFrames: 8 }

function sequence(prefix = 'frame'): FramesResponse {
  return {
    api_version: '0.1',
    target: { ra: 10, dec: 0, name: 'Test target', target_key: null },
    detector: 2,
    grid: { width: 8, height: 8, pixscale_arcsec: 6, projection: 'TAN', center_ra: 10, center_dec: 0 },
    norm: null,
    reference_frame_id: `${prefix}-0`,
    frames: Array.from({ length: 8 }, (_, i) => ({
      id: `${prefix}-${i}`,
      mjd: 60_000 + i,
      iso: new Date(Date.UTC(2023, 1, 25 + i)).toISOString(),
      png: `/${prefix}-${i}.png`,
      diff_png: `/diff-${prefix}-${i}.png`,
      wavelength_um: null,
      bandwidth_um: null,
      release: null,
      survey: null,
      bad_pixel_frac: null,
      predicted_px: null,
    })),
    warnings: [],
  }
}

function Harness({ selection, compare }: { selection: FramesParams; compare?: boolean }) {
  const session = useFrameSession(selection)
  const [toggles, setToggles] = useState<ViewerToggles>({ mode: 'original', flags: false, trail: false, pick: true, gaiaOverlays: false })
  const { state, dispatch } = usePlayer(session.data, toggles.mode === 'difference' ? session.diffs : session.originals)
  return (
    <ObservationViewer
      session={session}
      player={state}
      dispatch={dispatch}
      toggles={toggles}
      setToggles={(patch) => setToggles((t) => ({ ...t, ...patch }))}
      targetName="Test target"
      flagsOverlay={null}
      trail={[]}
      picked={null}
      onPixelClick={() => {}}
      detector={2}
      fovArcmin={null}
      onFovChange={() => {}}
      initialCompare={compare}
      compareSelection={compare ? { queryText: 'Test target', frameAId: 'frame-7', frameBId: 'frame-6' } : undefined}
    />
  )
}

describe('progressive observation viewer', () => {
  let client: QueryClient
  let host: HTMLDivElement
  let root: Root
  let requests: Map<string, { resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void; signal?: AbortSignal }>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    client = new QueryClient()
    client.setQueryData(framesQueryKey(params), sequence())
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    requests = new Map()
    vi.spyOn(api, 'image').mockImplementation((url, signal) =>
      new Promise((resolve, reject) => requests.set(url, { resolve, reject, signal })),
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const render = async (selection = params, compare = false) => {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter><Harness selection={selection} compare={compare} /></MemoryRouter>
      </QueryClientProvider>,
    ))
  }

  const finish = async (url: string) => {
    const bitmap = { width: 8, height: 8, close: vi.fn() }
    await act(async () => requests.get(url)!.resolve(bitmap as unknown as ImageBitmap))
    return bitmap
  }

  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const slider = () => host.querySelector<HTMLInputElement>('input[aria-label="Observation date"]')!

  it('plays available images in timeline order while other images load or fail', async () => {
    await render()
    expect(button('Play').disabled).toBe(true)
    await finish('/frame-0.png')
    await act(async () => requests.get('/frame-1.png')!.reject(new Error('image unavailable')))
    await finish('/frame-2.png')

    expect(button('Play').disabled).toBe(false)
    expect(slider().max).toBe('7')
    await act(async () => button('Next observation').click())
    expect(slider().value).toBe('2')
    await act(async () => button('Previous observation').click())
    expect(slider().value).toBe('0')
    await act(async () => button('Play').click())
    expect(button('Pause').disabled).toBe(false)
    expect([...requests.keys()].some((key) => key.startsWith('/diff-'))).toBe(false)
  })

  it('loads both selected dates before background frames', async () => {
    await render(params, true)
    expect([...requests.keys()].slice(0, 2)).toEqual(['/frame-7.png', '/frame-6.png'])
  })

  it('discards a late bitmap when the selection changes', async () => {
    await render()
    const newer = { ...params, ra: 11 }
    client.setQueryData(framesQueryKey(newer), sequence('new'))
    await render(newer)
    expect(requests.get('/frame-0.png')!.signal?.aborted).toBe(true)
    const late = await finish('/frame-0.png')
    expect(late.close).toHaveBeenCalledOnce()
    expect(button('Play').disabled).toBe(true)
    await finish('/new-0.png')
    await finish('/new-1.png')
    expect(button('Play').disabled).toBe(false)
  })
})
