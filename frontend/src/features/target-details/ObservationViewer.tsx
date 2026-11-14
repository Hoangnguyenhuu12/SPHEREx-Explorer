import { AlertTriangle, Crosshair, Expand, Loader2, Maximize, Minus, Pause, Play, Plus, RotateCw, SkipBack, SkipForward, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type Dispatch } from 'react'
import { describeError } from '../../shared/api/errors'
import { DETECTORS } from '../../shared/config/targets'
import { BlinkCanvas, type BlinkCanvasHandle, type GaiaOverlayMarker, type TrailPoint } from '../blink/BlinkCanvas'
import { SPEEDS, type PlayerAction, type PlayerState } from '../blink/player'
import type { FrameSession } from '../blink/useFrameSession'
import { formatShortDate, formatUtcDate } from './format'

export type ImageMode = 'original' | 'difference'

export interface ViewerToggles {
  mode: ImageMode
  crosshair: boolean
  flags: boolean
  trail: boolean
  pick: boolean
  gaiaOverlays: boolean
}

export interface GaiaOverlayMeta {
  model: string
  annualParallaxIncluded: boolean
  propagatedCount: number
  staticCount: number
  loading?: boolean
  error?: boolean
}

interface Props {
  session: FrameSession
  player: PlayerState
  dispatch: Dispatch<PlayerAction>
  toggles: ViewerToggles
  setToggles: (patch: Partial<ViewerToggles>) => void
  targetName: string
  flagsOverlay: HTMLImageElement | null
  trail: TrailPoint[]
  gaiaMarkers?: GaiaOverlayMarker[]
  gaiaOverlayMeta?: GaiaOverlayMeta | null
  picked: [number, number] | null
  onPixelClick: (x: number, y: number) => void
  detector: number
  onDetector: (d: number) => void
  timelineControl?: { combined: boolean; setCombined: (value: boolean) => void }
  fovArcmin: number | null
  onFovChange: (arcmin: number, byUser: boolean) => void
}

function useElapsed(since: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return since && active ? Math.max(0, Math.floor((now - since) / 1000)) : 0
}

export function ObservationViewer(props: Props) {
  const { session, player, dispatch, toggles, setToggles, targetName } = props
  const canvasRef = useRef<BlinkCanvasHandle>(null)
  const expandedRef = useRef<BlinkCanvasHandle>(null)
  const [expanded, setExpanded] = useState(false)
  const [visibleFov, setVisibleFov] = useState<number | null>(null)
  const data = session.data
  const frame = data?.frames[player.index] ?? null
  const elapsed = useElapsed(session.startedAt, session.status === 'fetching')
  const combined = props.timelineControl?.combined ?? false
  const isDiff = !combined && toggles.mode === 'difference'
  const bitmap = isDiff ? (session.diffs[player.index] ?? null) : (session.originals[player.index] ?? null)
  const demo = data?.mode === 'mock' || frame?.data_mode === 'fixture'
  const mission = frame?.mission ?? 'SPHEREx'
  const failedHere = session.failed.includes(player.index)
  const ready = session.status === 'ready'
  const canPlay = ready && session.originals.filter(Boolean).length >= 2

  useEffect(() => {
    if (isDiff) session.ensureDiffs()
  }, [isDiff, session])

  const onFov = (a: number, byUser: boolean) => {
    setVisibleFov(a)
    props.onFovChange(a, byUser)
  }

  const canvas = (ref: React.RefObject<BlinkCanvasHandle | null>, big = false) =>
    data ? (
      <BlinkCanvas
        ref={ref}
        bitmap={bitmap}
        gridW={data.grid.width}
        gridH={data.grid.height}
        pixArcsec={data.grid.pixscale_arcsec}
        crosshair={frame?.predicted_px ?? null}
        showCrosshair={toggles.crosshair}
        flagsOverlay={toggles.flags ? props.flagsOverlay : null}
        trail={toggles.trail ? props.trail : undefined}
        gaiaMarkers={combined && toggles.gaiaOverlays ? props.gaiaMarkers : undefined}
        clickMode={toggles.pick}
        picked={props.picked}
        initialFovArcmin={big ? null : props.fovArcmin}
        label={`${demo ? 'Illustrative demo' : mission} ${isDiff ? 'difference' : 'original'} image of ${targetName}, observation ${player.index + 1} of ${session.total}${frame ? `, ${formatUtcDate(frame.iso)}` : ''}.`}
        onFovChange={big ? undefined : onFov}
        onPixelClick={props.onPixelClick}
      />
    ) : null

  const dates = data?.frames ?? []

  const stateLayer = (() => {
    if (session.status === 'fetching')
      return (
        <div className="viewer-state" role="status">
          <Loader2 className="spin" aria-hidden />
          <p>Requesting observations…</p>
          {elapsed >= 5 && <p className="caption">Waiting {elapsed} s. The image service may take a minute to respond.</p>}
          <button type="button" className="btn btn-secondary" onClick={session.cancel}>
            Cancel
          </button>
        </div>
      )
    if (session.status === 'decoding' && !bitmap && !failedHere)
      return (
        <div className="viewer-state" role="status">
          <Loader2 className="spin" aria-hidden />
          <p>
            Loading images <span className="num">{session.loaded}</span> / <span className="num">{session.total}</span>
          </p>
          <progress max={session.total} value={session.loaded} />
        </div>
      )
    if (session.status === 'error') {
      const copy = describeError(session.error)
      return (
        <div className="viewer-state" role="alert">
          <AlertTriangle className="is-warn" aria-hidden />
          <p className="viewer-state__title">{copy.title}</p>
          <p className="caption">{copy.body}</p>
          {copy.retry && (
            <button type="button" className="btn btn-secondary" onClick={session.retry}>
              <RotateCw aria-hidden /> Try again
            </button>
          )}
        </div>
      )
    }
    if (ready && session.total === 0)
      return (
        <div className="viewer-state" role="status">
          <AlertTriangle className="is-warn" aria-hidden />
          <p className="viewer-state__title">No observations for detector D{data?.detector}</p>
          <p className="caption">Try another detector from the list below.</p>
        </div>
      )
    if (failedHere)
      return (
        <div className="viewer-state" role="alert">
          <AlertTriangle className="is-warn" aria-hidden />
          <p>Observation {player.index + 1} could not be loaded.</p>
          <button type="button" className="btn btn-secondary" onClick={session.retry}>
            <RotateCw aria-hidden /> Reload observations
          </button>
        </div>
      )
    if (ready && isDiff && session.diffStatus === 'loading')
      return (
        <div className="viewer-state viewer-state--soft" role="status">
          <Loader2 className="spin" aria-hidden />
          <p>Loading difference images…</p>
        </div>
      )
    return null
  })()

  const controls = (idSuffix: string) => (
    <>
      <div className="viewer-meta">
        {frame ? (
          <>
            <span className="num viewer-meta__date">{formatUtcDate(frame.iso)} UTC</span>
            <span className="num">
              Observation {player.index + 1} / {session.total}
            </span>
            <span className="num">
              {mission} {frame.band_or_detector ?? `D${data!.detector}`}
              {frame.wavelength_um != null ? ` · ${frame.wavelength_um.toFixed(2)} µm` : ''}
            </span>
            {frame.quality_label && <span className="caption">{frame.quality_label}</span>}
          </>
        ) : (
          <span className="caption">No observation selected</span>
        )}
      </div>

      <div className="viewer-player">
        <button type="button" className="icon-btn" aria-label="Previous observation" disabled={!canPlay} onClick={() => dispatch({ type: 'prev' })}>
          <SkipBack aria-hidden />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--play"
          aria-label={player.playing ? 'Pause' : 'Play'}
          disabled={!canPlay}
          title={!canPlay && ready ? 'Playback needs at least two observations' : undefined}
          onClick={() => dispatch({ type: 'toggle' })}
        >
          {player.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button type="button" className="icon-btn" aria-label="Next observation" disabled={!canPlay} onClick={() => dispatch({ type: 'next' })}>
          <SkipForward aria-hidden />
        </button>
        <div className="viewer-scrub">
          <input
            type="range"
            min={0}
            max={Math.max(0, session.total - 1)}
            step={1}
            value={player.index}
            disabled={!canPlay}
            aria-label="Observation date"
            aria-valuetext={frame ? `${formatUtcDate(frame.iso)}, observation ${player.index + 1} of ${session.total}` : undefined}
            onChange={(e) => dispatch({ type: 'seek', index: Number(e.target.value) })}
            list={`obs-ticks-${idSuffix}`}
          />
          <datalist id={`obs-ticks-${idSuffix}`}>
            {dates.map((_, i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          <div className="viewer-scrub__labels caption num" aria-hidden>
            {dates.length > 0 && <span>{formatShortDate(dates[0].mjd)}</span>}
            {dates.length > 1 && <span>{formatShortDate(dates[dates.length - 1].mjd)}</span>}
          </div>
        </div>
        <label className="viewer-speed">
          <span className="sr-only">Playback speed</span>
          <select className="select" value={player.fps} onChange={(e) => dispatch({ type: 'speed', fps: Number(e.target.value) })}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s} obs/s
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="viewer-tools">
        <div className="segmented" role="group" aria-label="Image mode">
          <button type="button" aria-pressed={!isDiff} onClick={() => setToggles({ mode: 'original' })}>
            Original
          </button>
          <button
            type="button"
            aria-pressed={isDiff}
            disabled={combined || !ready || session.total < 2}
            title={combined ? 'Difference images are available in SPHEREx-only mode' : session.total < 2 ? 'Difference needs at least two observations' : 'Each image minus the first observation'}
            onClick={() => setToggles({ mode: 'difference' })}
          >
            Difference
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={toggles.crosshair}
          aria-label="Show predicted target position"
          title="Predicted position"
          onClick={() => setToggles({ crosshair: !toggles.crosshair })}
        >
          <Crosshair aria-hidden />
        </button>
        {combined && (
          <button
            type="button"
            className="icon-btn"
            aria-pressed={toggles.gaiaOverlays}
            aria-label="Show Gaia DR3 epoch overlays"
            title="Gaia DR3 epoch overlays (angular proper motion only)"
            onClick={() => setToggles({ gaiaOverlays: !toggles.gaiaOverlays })}
          >
            <Sparkles aria-hidden />
          </button>
        )}
        <label className="viewer-det">
          <span className="sr-only">Detector</span>
          <select className="select" value={props.detector} onChange={(e) => props.onDetector(Number(e.target.value))} title="Infrared detector">
            {DETECTORS.map((d) => (
              <option key={d.id} value={d.id}>
                D{d.id} · {d.range}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isDiff && (
        <p className="caption viewer-legend">
          Difference: each observation minus the first. Mid-grey means no change; a bright and dark pair marks a star that moved.
        </p>
      )}
      {combined && toggles.gaiaOverlays && props.gaiaOverlayMeta && (
        <p className="caption viewer-legend">
          {props.gaiaOverlayMeta.loading
            ? 'Loading frame-by-frame Gaia DR3 overlays…'
            : props.gaiaOverlayMeta.error
              ? 'Gaia DR3 frame overlays from sky_archive are unavailable.'
              : `Gaia DR3 frame overlays (${props.gaiaMarkers?.length ?? 0} in frame · ${props.gaiaOverlayMeta.propagatedCount} propagated, ${props.gaiaOverlayMeta.staticCount} static without pmRA/pmDE). Model: ${props.gaiaOverlayMeta.model}; annual parallax not included.`}
        </p>
      )}
    </>
  )

  return (
    <section className="viewer" aria-label="Observation sequence">
      {props.timelineControl && (
        <label>
          <span className="sr-only">Observation sources</span>
          <select className="select" value={combined ? 'combined' : 'spherex'} onChange={(e) => props.timelineControl?.setCombined(e.target.value === 'combined')}>
            <option value="combined">unWISE W2 + SPHEREx D6</option>
            <option value="spherex">SPHEREx only</option>
          </select>
        </label>
      )}
      <div className="viewer-frame">
        {canvas(canvasRef)}
        {stateLayer}
        {data && (
          <span className="viewer-mode-tag">
            {demo ? 'Illustrative demo' : isDiff ? 'Difference' : 'Original'}
          </span>
        )}
        {data && (
          <div className="viewer-zoom" role="group" aria-label="Image zoom">
        <button type="button" className="icon-btn" aria-label="Zoom out image" onClick={() => canvasRef.current?.zoomOut()} disabled={!data}>
          <Minus aria-hidden />
        </button>
        <span className="caption num viewer-fov" aria-label="Visible field of view">
          {visibleFov != null ? `${visibleFov.toFixed(1)}′` : '—'}
        </span>
        <button type="button" className="icon-btn" aria-label="Zoom in image" onClick={() => canvasRef.current?.zoomIn()} disabled={!data}>
          <Plus aria-hidden />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit image" title="Fit" onClick={() => canvasRef.current?.fit()} disabled={!data}>
          <Maximize aria-hidden />
        </button>
          </div>
        )}
        {data && (
          <button type="button" className="icon-btn icon-btn--sm viewer-expand" aria-label="Expand image" title="Expand" onClick={() => setExpanded(true)}>
            <Expand aria-hidden />
          </button>
        )}
      </div>
      {controls('main')}
      {expanded && (
        <div className="modal-backdrop" role="presentation" onClick={() => setExpanded(false)}>
          <div
            className="modal modal--image"
            role="dialog"
            aria-modal="true"
            aria-label={`${targetName} — expanded observation`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setExpanded(false)}
          >
            <div className="modal__head">
              <h3>{targetName}</h3>
              <button type="button" className="icon-btn" aria-label="Close expanded image" onClick={() => setExpanded(false)} autoFocus>
                <X aria-hidden />
              </button>
            </div>
            <div className="modal__image">
              {canvas(expandedRef, true)}
              {stateLayer}
              {demo && <span className="viewer-mode-tag">Illustrative demo</span>}
              {data && (
                <div className="viewer-zoom" role="group" aria-label="Image zoom">
        <button type="button" className="icon-btn" aria-label="Zoom out image" onClick={() => expandedRef.current?.zoomOut()} disabled={!data}>
          <Minus aria-hidden />
        </button>
        <span className="caption num viewer-fov" aria-label="Visible field of view">
          {visibleFov != null ? `${visibleFov.toFixed(1)}′` : '—'}
        </span>
        <button type="button" className="icon-btn" aria-label="Zoom in image" onClick={() => expandedRef.current?.zoomIn()} disabled={!data}>
          <Plus aria-hidden />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit image" title="Fit" onClick={() => expandedRef.current?.fit()} disabled={!data}>
          <Maximize aria-hidden />
        </button>
                </div>
              )}
            </div>
            {controls('expanded')}
          </div>
        </div>
      )}
    </section>
  )
}
