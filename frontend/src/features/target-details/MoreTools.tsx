import { useQueries } from '@tanstack/react-query'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { describeError } from '../../shared/api/errors'
import type { FramesResponse } from '../../shared/api/types'
import type { TargetInfo } from '../../shared/config/targets'
import { framesQueryKey } from '../blink/useFrameSession'
import { DemoTag } from './SciencePanels'
import { formatUtcDate } from './format'

interface Props {
  target: TargetInfo | null
  coords: { ra: number; dec: number }
  data: FramesResponse | null
  activeIndex: number
  gaia: boolean
  setGaia: (v: boolean) => void
  gaiaStatus: { status: 'idle' | 'loading' | 'ready' | 'error'; count?: number }
  shareUrl: string
  embedUrl: string
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [done, setDone] = useState(false)
  const id = `copy-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-field__row">
        {multiline ? (
          <textarea id={id} className="input" readOnly rows={3} value={value} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input id={id} className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            void navigator.clipboard?.writeText(value).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            })
          }
        >
          {done ? <Check aria-hidden /> : <Copy aria-hidden />} {done ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

const RGB_DETECTORS = { r: 6, g: 4, b: 2 } as const

function RgbView({ target, coords, data, activeIndex }: Pick<Props, 'target' | 'coords' | 'data' | 'activeIndex'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const params = (d: number) => ({ ra: coords.ra, dec: coords.dec, detector: d, size: config.cutoutSizeDeg, maxFrames: config.maxFrames, targetKey: target?.key })
  const results = useQueries({
    queries: [RGB_DETECTORS.r, RGB_DETECTORS.g, RGB_DETECTORS.b].map((d) => ({
      queryKey: framesQueryKey(params(d)),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.frames(params(d), signal),
      staleTime: Infinity,
      retry: false,
    })),
  })
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error' | 'incompatible'; date?: string; error?: unknown }>({ status: 'loading' })
  const all = results.map((r) => r.data)
  const err = results.find((r) => r.isError)?.error
  const activeMjd = data?.frames[activeIndex]?.mjd

  useEffect(() => {
    if (err) {
      setState({ status: 'error', error: err })
      return
    }
    if (all.some((d) => !d)) return
    const seqs = all as FramesResponse[]
    const g0 = seqs[0].grid
    if (seqs.some((s) => s.grid.width !== g0.width || s.grid.height !== g0.height || s.grid.center_ra !== g0.center_ra)) {
      setState({ status: 'incompatible' })
      return
    }
    // Same sky pass: nearest frame to the active observation date in each detector.
    const pick = (s: FramesResponse) =>
      s.frames.reduce((best, f) => (activeMjd == null || Math.abs(f.mjd - activeMjd) < Math.abs(best.mjd - activeMjd) ? f : best), s.frames[0])
    const frames = seqs.map(pick)
    const ctrl = new AbortController()
    Promise.all(frames.map((f) => api.image(f.png, ctrl.signal)))
      .then((bitmaps) => {
        const c = canvasRef.current
        if (!c) return
        const w = g0.width
        const h = g0.height
        const tmp = new OffscreenCanvas(w, h)
        const tctx = tmp.getContext('2d')!
        const chans = bitmaps.map((b) => {
          tctx.clearRect(0, 0, w, h)
          tctx.drawImage(b, 0, 0)
          return tctx.getImageData(0, 0, w, h).data
        })
        const out = new ImageData(w, h)
        for (let i = 0; i < w * h; i++) {
          out.data[i * 4] = chans[0][i * 4]
          out.data[i * 4 + 1] = chans[1][i * 4]
          out.data[i * 4 + 2] = chans[2][i * 4]
          out.data[i * 4 + 3] = 255
        }
        c.width = w
        c.height = h
        c.getContext('2d')!.putImageData(out, 0, 0)
        bitmaps.forEach((b) => b.close())
        setState({ status: 'ready', date: formatUtcDate(frames[0].iso) })
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', error: e })
      })
    return () => ctrl.abort()
    // oxlint-disable-next-line react/exhaustive-deps
  }, [all[0], all[1], all[2], err, activeMjd])

  return (
    <div className="rgb">
      <div className="panel-head">
        <p className="caption">
          False-color view · red D{RGB_DETECTORS.r}, green D{RGB_DETECTORS.g}, blue D{RGB_DETECTORS.b}
          {state.date ? ` · ${state.date}` : ''}
        </p>
        <DemoTag mode={all[0]?.mode} />
      </div>
      <div className="rgb__frame">
        <canvas ref={canvasRef} aria-label="False-color composite of three SPHEREx detectors" role="img" />
        {state.status === 'loading' && (
          <p className="panel-status" role="status">
            <Loader2 className="spin" size={16} aria-hidden /> Loading three detectors…
          </p>
        )}
        {state.status === 'error' && <p className="caption">{describeError(state.error).title}. False-color needs all three detectors.</p>}
        {state.status === 'incompatible' && <p className="caption">The three detectors are not on the same image grid, so they cannot be combined.</p>}
      </div>
      <p className="caption">Colours are assigned, not seen: infrared light is mapped to red, green and blue to compare channels.</p>
    </div>
  )
}

export function MoreTools(p: Props) {
  const [rgbOn, setRgbOn] = useState(false)
  return (
    <div className="panel">
      <section className="tool">
        <h4>Gaia DR3 stars on the map</h4>
        <label className="check">
          <input type="checkbox" checked={p.gaia} onChange={(e) => p.setGaia(e.target.checked)} />
          Show Gaia DR3 catalog stars around this target (blue crosses)
        </label>
        <p className="caption">
          {p.gaiaStatus.status === 'loading'
            ? 'Loading Gaia DR3 from VizieR…'
            : p.gaiaStatus.status === 'error'
              ? 'Gaia DR3 could not be loaded from VizieR.'
              : p.gaiaStatus.status === 'ready'
                ? `${p.gaiaStatus.count ?? 'Some'} Gaia DR3 sources brighter than G = 18 within 6′ (ESA/Gaia via VizieR). Positions are at the Gaia epoch J2016.`
                : 'Real catalog data from ESA/Gaia via VizieR, drawn on the sky map.'}
        </p>
      </section>

      <section className="tool">
        <h4>False-color view</h4>
        {rgbOn ? (
          <RgbView target={p.target} coords={p.coords} data={p.data} activeIndex={p.activeIndex} />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setRgbOn(true)}>
            Combine three detectors
          </button>
        )}
      </section>

      <section className="tool">
        <h4>Share and embed</h4>
        <CopyField label="Link to this view" value={p.shareUrl} />
        <CopyField
          label="Embed code"
          multiline
          value={`<iframe src="${p.embedUrl}" title="SPHEREx Explorer: ${p.target?.name ?? 'sky view'}" width="960" height="640" style="border:0" loading="lazy"></iframe>`}
        />
      </section>
    </div>
  )
}
