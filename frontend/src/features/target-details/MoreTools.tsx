import { useQueries } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { describeError } from '../../shared/api/errors'
import type { FramesResponse } from '../../shared/api/types'
import { DR1_MAP_MJD } from '../../shared/config/epoch'
import type { TargetInfo } from '../../shared/config/targets'
import { framesQueryKey } from '../blink/useFrameSession'
import type { GaiaStatusInfo, SurveyInfo } from '../sky-map/AladinMap'
import { DemoTag } from './SciencePanels'
import { formatUtcDate } from './format'

interface Props {
  target: TargetInfo | null
  coords: { ra: number; dec: number }
  data: FramesResponse | null
  activeIndex: number
  gaia: boolean
  setGaia: (v: boolean) => void
  gaiaStatus: GaiaStatusInfo
  survey: SurveyInfo
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
  const isDssFallback = p.survey.key === 'dss2' || p.survey.id === 'CDS/P/DSS2/color'
  const sourceName = p.gaiaStatus.source === 'sky_archive' ? 'Supabase sky_archive (ESA Gaia DR3)' : 'ESA/Gaia DR3 via VizieR'
  const targetEpochText = p.survey.cube
    ? `DR1_MAP_MJD (${DR1_MAP_MJD}, Nov 2025)`
    : (p.survey.epochLabel ?? 'active map epoch')

  const gaiaCaption = (() => {
    if (p.gaiaStatus.status === 'loading') {
      return 'Loading Gaia DR3 catalog (sky_archive / VizieR)…'
    }
    if (p.gaiaStatus.status === 'error') {
      return 'Gaia DR3 could not be loaded from sky_archive or VizieR.'
    }
    if (p.gaiaStatus.status === 'ready') {
      const total = p.gaiaStatus.count ?? 0
      const propagated = p.gaiaStatus.propagatedCount ?? 0
      const staticCount = p.gaiaStatus.staticCount ?? 0
      if (isDssFallback) {
        return `${total} Gaia DR3 sources loaded from ${sourceName}. Kept at Gaia reference epoch J2016.0 (not shifted to the mixed 1950s–1990s DSS2 plate epochs).`
      }
      if (staticCount > 0) {
        return `${total} Gaia DR3 sources (${sourceName}): ${propagated} propagated via pmRA/pmDE (angular_proper_motion_only) from J2016.0 to ${targetEpochText}; ${staticCount} kept at J2016.0 because pmRA/pmDE are absent.`
      }
      return `${total} Gaia DR3 sources (${sourceName}): propagated via pmRA/pmDE (angular_proper_motion_only) from J2016.0 to ${targetEpochText}.`
    }
    if (isDssFallback) {
      return 'Real catalog data from ESA/Gaia DR3 (epoch J2016.0). Note: the current background is DSS2 optical plates from the 1950s–1990s.'
    }
    return `Real catalog data from ESA/Gaia DR3 (sky_archive for standard targets, VizieR otherwise), propagated with pmRA/pmDE from J2016.0 to ${targetEpochText} (or kept at J2016.0 when pmRA/pmDE are absent).`
  })()

  return (
    <div className="panel">
      <section className="tool">
        <h4>Gaia DR3 stars on the map</h4>
        {isDssFallback && (
          <div className="notice notice--warn" role="status">
            <AlertTriangle aria-hidden />
            <span>
              <strong>Epoch mismatch (DSS2 fallback):</strong> The sky map fell back to DSS2 optical plates (1950s–1990s). Target markers (DR1 epoch MJD {DR1_MAP_MJD}) and Gaia DR3 crosses (J2016.0) are not instantaneous positions on the DSS2 plates.
            </span>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={p.gaia} onChange={(e) => p.setGaia(e.target.checked)} />
          Show Gaia DR3 catalog stars around this target (blue crosses)
        </label>
        <p className="caption">{gaiaCaption}</p>
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
