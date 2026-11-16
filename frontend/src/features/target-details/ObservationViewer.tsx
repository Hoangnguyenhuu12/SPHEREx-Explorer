import {
  AlertTriangle,
  Check,
  Columns2,
  Copy,
  Crosshair,
  Expand,
  Layers,
  Loader2,
  MapPin,
  Maximize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCw,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PATHS } from '../../app/config'
import { describeError } from '../../shared/api/errors'
import { DETECTORS, type TargetInfo } from '../../shared/config/targets'
import { useGuide } from '../guide/guide-state'
import { BlinkCanvas, type BlinkCanvasHandle, type GaiaOverlayMarker, type RulerOverlay, type TrailPoint } from '../blink/BlinkCanvas'
import { canStep, SPEEDS, type PlayerAction, type PlayerState } from '../blink/player'
import type { FrameSession } from '../blink/useFrameSession'
import type { SyncedView } from '../blink/viewport'
import { formatDecDms, formatRaHms } from '../target-search/coordinates'
import {
  measureAngularOffset,
  type CanvasStretch,
  type ExperienceMode,
  type RulerMeasurement,
} from '../experience-mode/mode'
import { buildComparisonShareUrl, computeCompareMeasurement } from './compare'
import { formatShortDate, formatUtcDate } from './format'
import {
  analyzeTimeline,
  frameBand,
  frameMission,
  frameSourceLabel,
  framesDifferInMissionOrBand,
  resolveComparePair,
} from './timeline'
import { TimelineTrack } from './TimelineTrack'

export type ImageMode = 'original' | 'difference'

export interface ViewerToggles {
  mode: ImageMode
  crosshair?: boolean
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
  selectedCount: number
  totalInFrame: number
  loading?: boolean
  error?: boolean
}

export interface CompareSelectionControl {
  queryText: string
  frameAId?: string
  frameBId?: string
  markA?: [number, number] | null
  markB?: [number, number] | null
  onFramePairChange?: (frameAId: string, frameBId: string) => void
  onMarkChange?: (slot: 'A' | 'B', px: [number, number] | null) => void
  onClearAllMarks?: () => void
  onResetFrames?: () => void
}

interface Props {
  session: FrameSession
  player: PlayerState
  dispatch: Dispatch<PlayerAction>
  toggles: ViewerToggles
  setToggles: (patch: Partial<ViewerToggles>) => void
  target?: TargetInfo | null
  targetName: string
  experienceMode?: ExperienceMode
  flagsOverlay: HTMLImageElement | null
  trail: TrailPoint[]
  gaiaMarkers?: GaiaOverlayMarker[]
  getGaiaMarkers?: (frameIndex: number) => GaiaOverlayMarker[]
  gaiaOverlayMeta?: GaiaOverlayMeta | null
  picked: [number, number] | null
  onPixelClick: (x: number, y: number) => void
  onClearPick?: () => void
  onRulerChange?: (measurement: RulerMeasurement | null) => void
  onShowSpectrum?: () => void
  spectrumEnabled?: boolean
  detector: number
  onDetectorChange?: (detector: number) => void
  timelineControl?: { combined: boolean; setCombined: (value: boolean) => void }
  fovArcmin: number | null
  onFovChange: (arcmin: number, byUser: boolean) => void
  initialCompare?: boolean
  onCompareActiveChange?: (active: boolean) => void
  onWideChange?: (wide: boolean) => void
  compareSelection?: CompareSelectionControl
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

function subscribeWideViewport(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia('(min-width: 920px)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getWideViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(min-width: 920px)').matches
}

export function ObservationViewer(props: Props) {
  const { session, player, dispatch, toggles, setToggles, targetName } = props
  const guideOn = useGuide()
  const canvasRef = useRef<BlinkCanvasHandle>(null)
  const canvasBRef = useRef<BlinkCanvasHandle>(null)
  const expandedRef = useRef<BlinkCanvasHandle>(null)

  const [expanded, setExpanded] = useState(false)
  const [visibleFov, setVisibleFov] = useState<number | null>(null)
  const [syncedView, setSyncedView] = useState<SyncedView | null>(null)
  const [viewMode, setViewMode] = useState<'compare' | 'timeline'>(() => (props.initialCompare ? 'compare' : 'timeline'))
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')
  const [layoutPref, setLayoutPref] = useState<'side' | 'flip'>('side')
  const [stretch, setStretch] = useState<CanvasStretch>('default')
  const [rulerActive, setRulerActive] = useState(false)
  const [rulerStart, setRulerStart] = useState<{ px: [number, number]; mjd: number | null } | null>(null)
  const [rulerMeasurement, setRulerMeasurement] = useState<RulerMeasurement | null>(null)
  const [markingSlot, setMarkingSlot] = useState<'A' | 'B' | null>(null)
  const [localMarkA, setLocalMarkA] = useState<[number, number] | null>(null)
  const [localMarkB, setLocalMarkB] = useState<[number, number] | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [identifyStars, setIdentifyStars] = useState(true)
  const [starSelection, setStarSelection] = useState<{ key: string; star: GaiaOverlayMarker | null } | null>(null)
  const experienceMode = props.experienceMode ?? 'explore'

  const isWideViewport = useSyncExternalStore(subscribeWideViewport, getWideViewport, () => false)
  const data = session.data
  const frames = useMemo(() => data?.frames ?? [], [data])
  const hasPredictedCrosshair = useMemo(() => frames.some((item) => item.predicted_px != null), [frames])
  const seqKey = data ? `${data.target?.name ?? ''}:${data.detector}:${frames.length}:${frames[0]?.id ?? ''}:${frames[frames.length - 1]?.id ?? ''}` : ''

  const pairResolution = useMemo(
    () =>
      resolveComparePair(
        frames,
        props.compareSelection?.frameAId,
        props.compareSelection?.frameBId,
        props.target?.change ?? 'motion',
      ),
    [frames, props.compareSelection?.frameAId, props.compareSelection?.frameBId, props.target?.change],
  )
  const [pairState, setPairState] = useState<{ key: string; pair: [number, number] } | null>(null)
  const hasExplicitFrameIds = Boolean(props.compareSelection?.frameAId || props.compareSelection?.frameBId)
  const comparePair: [number, number] =
    !hasExplicitFrameIds && pairState && pairState.key === seqKey ? pairState.pair : pairResolution.pair

  const indexA = comparePair[0]
  const indexB = comparePair[1]
  const frameA = frames[indexA] ?? null
  const frameB = frames[indexB] ?? null

  const markA = props.compareSelection?.markA !== undefined ? props.compareSelection.markA : localMarkA
  const markB = props.compareSelection?.markB !== undefined ? props.compareSelection.markB : localMarkB

  const setMark = (slot: 'A' | 'B', px: [number, number] | null) => {
    if (props.compareSelection?.onMarkChange) {
      props.compareSelection.onMarkChange(slot, px)
    } else if (slot === 'A') {
      setLocalMarkA(px)
    } else {
      setLocalMarkB(px)
    }
  }

  const hasMultipleFrames = frames.length >= 2
  const inCompare = viewMode === 'compare' && hasMultipleFrames
  const sideBySide = inCompare && isWideViewport && layoutPref === 'side'

  const { onWideChange, onCompareActiveChange } = props
  useEffect(() => {
    onWideChange?.(sideBySide)
    return () => onWideChange?.(false)
  }, [sideBySide, onWideChange])

  useEffect(() => {
    onCompareActiveChange?.(viewMode === 'compare')
  }, [viewMode, onCompareActiveChange])

  // Keyboard F flips A <-> B cleanly when comparing two dates.
  useEffect(() => {
    if (!inCompare) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setActiveSlot((s) => (s === 'A' ? 'B' : 'A'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inCompare])

  const combined = props.timelineControl?.combined ?? false
  const timelineSummary = useMemo(() => analyzeTimeline(frames, data?.detector ?? props.detector), [frames, data?.detector, props.detector])
  const mixedSequence = timelineSummary.hasMixedMissionsOrBands
  const compareDiffersInMissionOrBand = framesDifferInMissionOrBand(frameA, frameB)
  const differenceAllowed = !combined && !mixedSequence

  const activeTimelineIndex = player.index
  const activeFlipIndex = activeSlot === 'A' ? indexA : indexB
  const displayIndex = inCompare && !sideBySide ? activeFlipIndex : activeTimelineIndex
  const frame = frames[displayIndex] ?? null

  const elapsed = useElapsed(session.startedAt, session.status === 'fetching')
  const hasDiffs = useMemo(() => frames.some((f) => Boolean(f.diff_png)), [frames])
  const isDiff = differenceAllowed && hasDiffs && !inCompare && toggles.mode === 'difference'
  const demo = data?.mode === 'mock' || frame?.data_mode === 'fixture'
  const ready = session.status === 'ready'
  const canPlay = player.readyIndices.length >= 2
  const canSeek = hasMultipleFrames && session.status !== 'fetching'
  const secondaryCompareIndex = activeSlot === 'A' ? indexB : indexA
  const { prioritizeFrames, ensureDiffs } = session

  useLayoutEffect(() => {
    // Commit the visible dates before the session starts its background downloads.
    prioritizeFrames(inCompare ? [activeFlipIndex, secondaryCompareIndex] : [displayIndex])
  }, [prioritizeFrames, inCompare, activeFlipIndex, secondaryCompareIndex, displayIndex])

  useEffect(() => {
    if (isDiff) ensureDiffs()
  }, [isDiff, ensureDiffs])

  // Keep Original A/B as default whenever two frames differ in mission or band.
  useEffect(() => {
    if ((!differenceAllowed || (data && !hasDiffs)) && toggles.mode === 'difference') {
      setToggles({ mode: 'original' })
    }
  }, [data, differenceAllowed, hasDiffs, toggles.mode, setToggles])

  const onFov = (a: number, byUser: boolean) => {
    setVisibleFov(a)
    props.onFovChange(a, byUser)
  }

  const markersFor = (frameIdx: number): GaiaOverlayMarker[] | undefined => {
    if (!toggles.gaiaOverlays) return undefined
    if (props.getGaiaMarkers) return props.getGaiaMarkers(frameIdx)
    return props.gaiaMarkers
  }

  const catalogAvailable = Boolean(props.gaiaOverlayMeta)
  const starFrameIndex = inCompare ? activeFlipIndex : displayIndex
  const visibleStars = markersFor(starFrameIndex) ?? []
  const selection = starSelection?.key === seqKey ? starSelection : null
  const selectedStar = selection?.star ?? null
  const currentStar = selectedStar ? visibleStars.find((s) => s.sourceId === selectedStar.sourceId) : null
  const selectStar = (star: GaiaOverlayMarker | null, slot?: 'A' | 'B') => {
    setStarSelection({ key: seqKey, star })
    if (slot) setActiveSlot(slot)
    dispatch({ type: 'pause' })
  }

  const setCompareSlotIndex = (slot: 'A' | 'B', nextIdx: number) => {
    const next: [number, number] = slot === 'A' ? [nextIdx, comparePair[1]] : [comparePair[0], nextIdx]
    setPairState({ key: seqKey, pair: next })
    setActiveSlot(slot)
    const idA = frames[next[0]]?.id
    const idB = frames[next[1]]?.id
    if (idA && idB) {
      props.compareSelection?.onFramePairChange?.(idA, idB)
    }
  }

  const compareMeasurement = useMemo(
    () =>
      computeCompareMeasurement({
        grid: data?.grid,
        frameA,
        frameB,
        markA,
        markB,
        warnings: data?.warnings,
        demo,
      }),
    [data?.grid, frameA, frameB, markA, markB, data?.warnings, demo],
  )

  const shareUrl = useMemo(() => {
    const q = props.compareSelection?.queryText?.trim() || props.target?.key || targetName
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const pathname = typeof window !== 'undefined' ? window.location.pathname : PATHS.explorer
    return buildComparisonShareUrl({
      origin,
      pathname,
      q,
      detector: data?.detector ?? props.detector,
      seq: combined ? 'combined' : 'spherex',
      frameA,
      frameB,
      markA,
      markB,
      gaia: toggles.gaiaOverlays,
      fovArcmin: visibleFov ?? props.fovArcmin,
    })
  }, [
    props.compareSelection?.queryText,
    props.target?.key,
    targetName,
    data?.detector,
    props.detector,
    combined,
    frameA,
    frameB,
    markA,
    markB,
    toggles.gaiaOverlays,
    visibleFov,
    props.fovArcmin,
  ])

  const startMarking = (slot: 'A' | 'B') => {
    if (viewMode !== 'compare' && hasMultipleFrames) switchToMode('compare')
    setActiveSlot(slot)
    setMarkingSlot((curr) => (curr === slot ? null : slot))
  }

  const handleCopyComparisonLink = async () => {
    setCopiedLink(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      }
    } catch {
      // Share URL input below remains selectable if clipboard write fails.
    }
    window.setTimeout(() => setCopiedLink(false), 3000)
  }

  const switchToMode = (next: 'compare' | 'timeline') => {
    if (next === 'compare' && player.playing) dispatch({ type: 'pause' })
    if (next === 'timeline') {
      dispatch({ type: 'seek', index: activeFlipIndex })
      setMarkingSlot(null)
    }
    setViewMode(next)
  }

  const renderCanvasFor = (
    frameIdx: number,
    ref: React.RefObject<BlinkCanvasHandle | null>,
    slotTag: string,
    opts?: { big?: boolean; reportFov?: boolean; compareSlot?: 'A' | 'B' },
  ) => {
    if (!data) return null
    const f = frames[frameIdx] ?? null
    const slotBitmap = isDiff && !inCompare ? (session.diffs[frameIdx] ?? null) : (session.originals[frameIdx] ?? null)
    const srcLabel = f ? frameSourceLabel(f, data.detector) : 'Observation'
    const fDemo = data.mode === 'mock' || f?.data_mode === 'fixture'
    const cSlot = opts?.compareSlot
    const slotPicked = cSlot === 'A' ? markA : cSlot === 'B' ? markB : props.picked
    const rulerOverlay: RulerOverlay | null = rulerMeasurement
      ? {
          p1: rulerMeasurement.p1,
          p2: rulerMeasurement.p2,
          label: `${rulerMeasurement.sepArcsec.toFixed(1)}″ · PA ${rulerMeasurement.paDeg.toFixed(0)}°`,
        }
      : rulerStart
        ? { p1: rulerStart.px, p2: rulerStart.px, label: 'Click point B' }
        : null
    const onCanvasPixel = (x: number, y: number) => {
      if (experienceMode === 'science' && rulerActive) {
        if (!rulerStart || rulerMeasurement) {
          setRulerStart({ px: [x, y], mjd: f?.mjd ?? null })
          setRulerMeasurement(null)
          props.onRulerChange?.(null)
        } else {
          const m = measureAngularOffset(data.grid, rulerStart.px, [x, y], rulerStart.mjd, f?.mjd ?? null)
          setRulerMeasurement(m)
          props.onRulerChange?.(m)
        }
        return
      }
      if (inCompare && cSlot) {
        setMark(cSlot, [x, y])
        setActiveSlot(cSlot)
        if (sideBySide && cSlot === 'A' && !markB) {
          setMarkingSlot('B')
        } else if (sideBySide && cSlot === 'B' && !markA) {
          setMarkingSlot('A')
        } else {
          setMarkingSlot(null)
        }
      }
      props.onPixelClick(x, y)
    }
    return (
      <BlinkCanvas
        ref={ref}
        bitmap={slotBitmap}
        gridW={data.grid.width}
        gridH={data.grid.height}
        pixArcsec={data.grid.pixscale_arcsec}
        crosshair={f?.predicted_px ?? null}
        showCrosshair={Boolean(toggles.crosshair)}
        flagsOverlay={toggles.flags ? props.flagsOverlay : null}
        trail={toggles.trail ? props.trail : undefined}
        gaiaMarkers={markersFor(frameIdx)}
        guide={guideOn}
        selectedSourceId={selectedStar?.sourceId}
        onStarSelect={identifyStars && catalogAvailable && toggles.gaiaOverlays && !rulerActive && !markingSlot && !isDiff && (markersFor(frameIdx)?.length ?? 0) > 0
          ? (star) => selectStar(star, cSlot)
          : undefined}
        ruler={experienceMode === 'science' && rulerActive ? rulerOverlay : null}
        stretch={experienceMode === 'science' ? stretch : 'default'}
        clickMode={toggles.pick || rulerActive || (Boolean(cSlot) && markingSlot === cSlot)}
        picked={slotPicked}
        pickedLabel={cSlot === 'A' ? 'You A' : cSlot === 'B' ? 'You B' : 'You'}
        initialFovArcmin={opts?.big ? null : props.fovArcmin}
        syncedView={opts?.big ? undefined : syncedView}
        onSyncedViewChange={opts?.big ? undefined : setSyncedView}
        label={`${fDemo ? 'Illustrative demo' : srcLabel} image (${slotTag}) of ${targetName}${f ? `, ${formatUtcDate(f.iso)} UTC` : ''}.`}
        onFovChange={opts?.big || opts?.reportFov === false ? undefined : onFov}
        onPixelClick={onCanvasPixel}
      />
    )
  }

  const renderFrameState = (frameIdx: number) => {
    const slotFailed = isDiff
      ? !frames[frameIdx]?.diff_png || session.diffStatus === 'ready' || session.diffStatus === 'error'
      : session.failed.includes(frameIdx)
    const slotBitmap = isDiff && !inCompare ? (session.diffs[frameIdx] ?? null) : (session.originals[frameIdx] ?? null)
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
          <p className="caption">Choose another detector in the Details tab below.</p>
        </div>
      )
    if (!slotBitmap && slotFailed)
      return (
        <div className="viewer-state" role="alert">
          <AlertTriangle className="is-warn" aria-hidden />
          <p>{isDiff ? 'Difference image' : 'Observation'} {frameIdx + 1} could not be loaded.</p>
          <button type="button" className="btn btn-secondary" onClick={session.retry}>
            <RotateCw aria-hidden /> Reload observations
          </button>
        </div>
      )
    if (!slotBitmap && isDiff)
      return (
        <div className="viewer-state viewer-state--soft" role="status">
          <Loader2 className="spin" aria-hidden />
          <p>Loading difference images…</p>
        </div>
      )
    if (!slotBitmap && session.status === 'decoding')
      return (
        <div className="viewer-state" role="status">
          <Loader2 className="spin" aria-hidden />
          <p>
            Loading images <span className="num">{session.loaded}</span> / <span className="num">{session.total}</span>
          </p>
          <progress max={session.total} value={session.loaded} aria-label="Observation images loaded" />
        </div>
      )
    return null
  }

  const compareSlotHeader = (slot: 'A' | 'B', fIdx: number) => {
    const f = frames[fIdx]
    const fDemo = data?.mode === 'mock' || f?.data_mode === 'fixture'
    return (
      <div className={`compare-card__meta${!sideBySide && activeSlot === slot ? ' is-active' : ''}`}>
        <div className="compare-card__head">
          <span className="compare-badge num">Date {slot}</span>
          <span className={`mission-tag mission-tag--${f ? frameMission(f).toLowerCase() : 'spherex'}`}>
            {f ? frameSourceLabel(f, data?.detector) : '—'}
          </span>
          {fDemo && <span className="compare-demo-badge">Illustrative demo</span>}
        </div>
        <div className="compare-card__date num">{f ? `${formatUtcDate(f.iso)} UTC` : 'Loading…'}</div>
        <label className="compare-card__select">
          <span className="sr-only">Choose Date {slot}</span>
          <select
            className="select select--compact"
            value={fIdx}
            disabled={frames.length < 2}
            onChange={(e) => setCompareSlotIndex(slot, Number(e.target.value))}
          >
            {frames.map((item, i) => (
              <option key={item.id} value={i}>
                {formatShortDate(item.mjd)} · {frameSourceLabel(item, data?.detector)}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }

  const timelineControls = (idSuffix: string) => (
    <>
      <div className="viewer-meta">
        {frame ? (
          <>
            <span className="num viewer-meta__date">{formatUtcDate(frame.iso)} UTC</span>
            <span className="num">
              Observation {displayIndex + 1} / {session.total}
            </span>
            <span className={`mission-tag mission-tag--${frameMission(frame).toLowerCase()}`}>
              {frameSourceLabel(frame, data?.detector)}
              {frame.wavelength_um != null ? ` · ${frame.wavelength_um.toFixed(2)} µm` : ''}
            </span>
          </>
        ) : (
          <span className="caption">No observation selected</span>
        )}
      </div>

      <div className="viewer-player" data-tour={idSuffix === 'main' ? 'player' : undefined}>
        <button type="button" className="icon-btn" aria-label="Previous observation" disabled={!canStep(player)} onClick={() => dispatch({ type: 'prev' })}>
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
        <button type="button" className="icon-btn" aria-label="Next observation" disabled={!canStep(player)} onClick={() => dispatch({ type: 'next' })}>
          <SkipForward aria-hidden />
        </button>
        <div className="viewer-scrub">
          <input
            type="range"
            min={0}
            max={Math.max(0, session.total - 1)}
            step={1}
            value={player.index}
            disabled={!canSeek}
            aria-label="Observation date"
            aria-valuetext={frame ? `${formatUtcDate(frame.iso)}, observation ${player.index + 1} of ${session.total}` : undefined}
            onChange={(e) => dispatch({ type: 'seek', index: Number(e.target.value) })}
            list={`obs-ticks-${idSuffix}`}
          />
          <datalist id={`obs-ticks-${idSuffix}`}>
            {frames.map((_, i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          <div className="viewer-scrub__labels caption num" aria-hidden>
            {frames.length > 0 && <span>{formatShortDate(frames[0].mjd)}</span>}
            {frames.length > 1 && <span>{formatShortDate(frames[frames.length - 1].mjd)}</span>}
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

      {frames.length > 0 && (
        <TimelineTrack
          frames={frames}
          activeIndex={displayIndex}
          compareIndices={inCompare ? comparePair : null}
          detector={data?.detector ?? props.detector}
          onSelect={(idx) => dispatch({ type: 'seek', index: idx })}
        />
      )}

      <div className="viewer-tools">
        <div className="segmented" role="group" aria-label="Image display" data-tour={idSuffix === 'main' ? 'display' : undefined}>
          <button type="button" aria-pressed={!isDiff} onClick={() => setToggles({ mode: 'original' })}>
            Original
          </button>
          <button
            type="button"
            aria-pressed={isDiff}
            disabled={!differenceAllowed || !hasDiffs || !canSeek}
            title={
              !differenceAllowed
                ? 'Original A/B is the default when observations come from different missions or bands'
                : session.total < 2
                  ? 'Difference needs at least two observations'
                  : 'Each observation minus the first; check bright-dark pairs against the originals'
            }
            onClick={() => setToggles({ mode: 'difference' })}
          >
            Difference
          </button>
        </div>
      </div>

      {isDiff ? (
        <p className="caption viewer-legend">
          Difference: each observation minus the first. A bright–dark pair is a sign to check back against the original A/B images to separate true motion from artifacts.
        </p>
      ) : (
        !differenceAllowed &&
        hasMultipleFrames && (
          <p className="caption viewer-legend">
            Original images remain the default here because this sequence spans different missions or bands, where subtraction mixes instrument signatures (bright–dark pairs always need checking against the original images).
          </p>
        )
      )}
    </>
  )

  return (
    <section className="viewer" aria-label="Observation viewer">
      {/* Priority bar: Compare / Play / Source timeline switcher */}
      <div className="viewer-priority">
        <div className="segmented" role="group" aria-label="Comparison view" data-tour="view-mode">
          <button
            type="button"
            aria-pressed={viewMode === 'compare'}
            disabled={!hasMultipleFrames}
            onClick={() => switchToMode('compare')}
          >
            Compare two dates
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'timeline'}
            onClick={() => switchToMode('timeline')}
          >
            Timeline
          </button>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn--compact"
          disabled={!canPlay}
          aria-pressed={player.playing && viewMode === 'timeline'}
          onClick={() => {
            if (viewMode === 'compare') {
              setViewMode('timeline')
              if (!player.playing) dispatch({ type: 'toggle' })
            } else {
              dispatch({ type: 'toggle' })
            }
          }}
        >
          {player.playing && viewMode === 'timeline' ? <Pause aria-hidden /> : <Play aria-hidden />}
          <span>{player.playing && viewMode === 'timeline' ? 'Pause' : 'Play'}</span>
        </button>

        {props.onDetectorChange && (
          <div className="segmented segmented--detectors" role="group" aria-label="SPHEREx detector" data-tour="detectors">
            {DETECTORS.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={props.detector === d.id}
                title={`D${d.id} · ${d.range} (${d.label})`}
                onClick={() => props.onDetectorChange?.(d.id)}
              >
                D{d.id}
              </button>
            ))}
          </div>
        )}

        {props.timelineControl && (
          <label className="viewer-source-select" data-tour="source">
            <span className="sr-only">Observation sources</span>
            <select
              className="select select--compact"
              value={combined ? 'combined' : 'spherex'}
              onChange={(e) => props.timelineControl?.setCombined(e.target.value === 'combined')}
            >
              <option value="combined">unWISE W2 + SPHEREx D6</option>
              <option value="spherex">SPHEREx only</option>
            </select>
          </label>
        )}
      </div>

      {inCompare ? (
        <div className="compare-block">
          {ready && (pairResolution.missingA || pairResolution.missingB) && (
            <div className="notice notice--warn" role="alert">
              <div>
                <strong>Saved frame unavailable — showing nearest verified pair</strong>
                <p className="caption">
                  {[
                    pairResolution.missingA ? `Date A frame (${pairResolution.missingA})` : null,
                    pairResolution.missingB ? `Date B frame (${pairResolution.missingB})` : null,
                  ]
                    .filter(Boolean)
                    .join(' and ')}{' '}
                  could not be found in this sequence or detector. Select different dates below or reset to the default pair.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                onClick={() => {
                  setPairState(null)
                  props.compareSelection?.onResetFrames?.()
                }}
              >
                Use default dates
              </button>
            </div>
          )}

          <div className="compare-bar">
            {!sideBySide && (
              <div className="segmented segmented--ab" role="group" aria-label="Flip between Date A and Date B">
                <button
                  type="button"
                  aria-pressed={activeSlot === 'A'}
                  onClick={() => setActiveSlot('A')}
                >
                  A · {frameA ? formatShortDate(frameA.mjd) : 'Date A'}
                </button>
                <button
                  type="button"
                  aria-pressed={activeSlot === 'B'}
                  onClick={() => setActiveSlot('B')}
                >
                  B · {frameB ? formatShortDate(frameB.mjd) : 'Date B'}
                </button>
              </div>
            )}

            <div className="compare-bar__right">
              {isWideViewport && (
                <button
                  type="button"
                  className="btn btn-secondary btn--compact"
                  aria-pressed={layoutPref === 'side'}
                  onClick={() => setLayoutPref((v) => (v === 'side' ? 'flip' : 'side'))}
                >
                  <Columns2 aria-hidden />
                  <span>{layoutPref === 'side' ? 'A / B flip' : 'Side by side'}</span>
                </button>
              )}
              {!sideBySide && (
                <button
                  type="button"
                  className="btn btn-secondary btn--compact"
                  title="Flip between A and B (F)"
                  onClick={() => setActiveSlot((s) => (s === 'A' ? 'B' : 'A'))}
                >
                  <Layers aria-hidden />
                  <span>Flip A / B</span>
                </button>
              )}
            </div>
          </div>

          {compareDiffersInMissionOrBand && (
            <p className="caption">
              Original A/B is active because Date A and Date B are from different missions or bands.
            </p>
          )}

          {sideBySide ? (
            <div className="compare-grid" data-tour="image" aria-label="Side-by-side comparison at matched zoom and center">
              <div className="compare-card">
                {compareSlotHeader('A', indexA)}
                <div className={`viewer-frame${markingSlot === 'A' ? ' viewer-frame--marking' : ''}`}>
                  {renderCanvasFor(indexA, canvasRef, 'Date A', { reportFov: true, compareSlot: 'A' })}
                  {renderFrameState(indexA)}
                  {data && (
                    <span className="viewer-mode-tag">
                      A · {frameA ? frameSourceLabel(frameA, data.detector) : ''}
                    </span>
                  )}
                  {data && (
                    <div className="viewer-zoom" role="group" aria-label="Synchronized image zoom">
                      <button type="button" className="icon-btn" aria-label="Zoom out images" onClick={() => canvasRef.current?.zoomOut()} disabled={!data}>
                        <Minus aria-hidden />
                      </button>
                      <span className="caption num viewer-fov" aria-label="Visible field of view">
                        {visibleFov != null ? `${visibleFov.toFixed(1)}′` : '—'}
                      </span>
                      <button type="button" className="icon-btn" aria-label="Zoom in images" onClick={() => canvasRef.current?.zoomIn()} disabled={!data}>
                        <Plus aria-hidden />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Fit images" title="Fit" onClick={() => canvasRef.current?.fit()} disabled={!data}>
                        <Maximize aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="compare-card">
                {compareSlotHeader('B', indexB)}
                <div className={`viewer-frame${markingSlot === 'B' ? ' viewer-frame--marking' : ''}`}>
                  {renderCanvasFor(indexB, canvasBRef, 'Date B', { reportFov: false, compareSlot: 'B' })}
                  {renderFrameState(indexB)}
                  {data && (
                    <span className="viewer-mode-tag">
                      B · {frameB ? frameSourceLabel(frameB, data.detector) : ''}
                    </span>
                  )}
                  {data && (
                    <button type="button" className="icon-btn icon-btn--sm viewer-expand" aria-label="Expand image" title="Expand" onClick={() => setExpanded(true)}>
                      <Expand aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="compare-single" data-tour="image">
              <div className={`viewer-frame${markingSlot === activeSlot ? ' viewer-frame--marking' : ''}`}>
                {renderCanvasFor(activeFlipIndex, canvasRef, `Date ${activeSlot}`, { reportFov: true, compareSlot: activeSlot })}
                {renderFrameState(activeFlipIndex)}
                {data && (
                  <span className="viewer-mode-tag">
                    {demo ? `Illustrative demo · ${activeSlot}` : `${activeSlot} · ${frame ? frameSourceLabel(frame, data.detector) : ''}`}
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
              <div className="compare-meta-pair">
                {compareSlotHeader('A', indexA)}
                {compareSlotHeader('B', indexB)}
              </div>
            </div>
          )}

          {/* Mark positions in A / B & Shareable comparison readout */}
          <div className="compare-mark-controls" role="group" aria-label="Mark and share comparison">
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              aria-pressed={markingSlot === 'A'}
              onClick={() => startMarking('A')}
              disabled={!ready || frames.length < 2}
            >
              <MapPin aria-hidden />
              <span>{markA ? 'Move mark in A' : 'Mark position in A'}</span>
            </button>
            {markA && (
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                aria-label="Clear mark in A"
                onClick={() => {
                  setMark('A', null)
                  if (markingSlot === 'A') setMarkingSlot(null)
                }}
              >
                <X aria-hidden />
                <span>Clear A</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn--compact"
              aria-pressed={markingSlot === 'B'}
              onClick={() => startMarking('B')}
              disabled={!ready || frames.length < 2}
            >
              <MapPin aria-hidden />
              <span>{markB ? 'Move mark in B' : 'Mark position in B'}</span>
            </button>
            {markB && (
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                aria-label="Clear mark in B"
                onClick={() => {
                  setMark('B', null)
                  if (markingSlot === 'B') setMarkingSlot(null)
                }}
              >
                <X aria-hidden />
                <span>Clear B</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn--compact compare-copy-btn"
              onClick={() => void handleCopyComparisonLink()}
              disabled={!ready || frames.length < 2}
            >
              {copiedLink ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span>{copiedLink ? 'Copied comparison link' : 'Copy comparison link'}</span>
            </button>
          </div>

          {markingSlot && (
            <p className="caption compare-mark-hint" role="status">
              Click or tap inside Date {markingSlot} (or focus the image and press Enter) to place your mark on Date {markingSlot}.
            </p>
          )}

          {copiedLink && (
            <div className="compare-copy-url" role="status">
              <span className="caption">Shareable comparison URL ready:</span>
              <input
                type="text"
                className="input input--compact num"
                readOnly
                value={shareUrl}
                aria-label="Shareable comparison URL"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}

          <div className="compare-result" aria-label="Comparison measurement summary">
            <div className="compare-result__head">
              <div>
                <span className="compare-result__kicker">Estimate from your user-selected marks</span>
                {compareMeasurement.formattedOffset ? (
                  <p className="compare-result__offset num" data-testid="compare-offset-value">
                    Angular shift: <strong>{compareMeasurement.formattedOffset}</strong>
                  </p>
                ) : !compareMeasurement.hasWcs && ready ? (
                  <p className="compare-result__missing" role="status">
                    WCS astrometry is missing or incomplete on this grid — angular separation cannot be calculated from marks.
                  </p>
                ) : (
                  <p className="compare-result__pending">
                    {!markA && !markB
                      ? 'Click “Mark position in A” and “Mark position in B” (or click both images) to estimate the angular shift in arcseconds.'
                      : !markA
                        ? 'Mark placed in Date B — now place your mark in Date A to estimate the angular shift.'
                        : 'Mark placed in Date A — now place your mark in Date B to estimate the angular shift.'}
                  </p>
                )}
              </div>
              {compareMeasurement.hasWcs && compareMeasurement.markA?.sky && compareMeasurement.markB?.sky && (
                <span className="badge badge--ready">Estimated from user marks</span>
              )}
            </div>

            <dl className="compare-result__facts">
              <div>
                <dt>Date A</dt>
                <dd className="num">
                  {frameA ? `${formatUtcDate(frameA.iso)} UTC` : '—'} ·{' '}
                  {frameA ? `${frameSourceLabel(frameA, data?.detector)} (${frameBand(frameA, data?.detector)})` : '—'}
                </dd>
              </div>
              <div>
                <dt>Your mark A (◇)</dt>
                <dd className="num">
                  {markA
                    ? compareMeasurement.markA?.sky
                      ? `${formatRaHms(compareMeasurement.markA.sky.ra)} ${formatDecDms(compareMeasurement.markA.sky.dec)} (${compareMeasurement.markA.sky.ra.toFixed(5)}°, ${compareMeasurement.markA.sky.dec >= 0 ? '+' : ''}${compareMeasurement.markA.sky.dec.toFixed(5)}°) · px (${markA[0].toFixed(1)}, ${markA[1].toFixed(1)})`
                      : `px (${markA[0].toFixed(1)}, ${markA[1].toFixed(1)}) · WCS unavailable`
                    : 'Not marked'}
                </dd>
              </div>
              <div>
                <dt>Date B</dt>
                <dd className="num">
                  {frameB ? `${formatUtcDate(frameB.iso)} UTC` : '—'} ·{' '}
                  {frameB ? `${frameSourceLabel(frameB, data?.detector)} (${frameBand(frameB, data?.detector)})` : '—'}
                </dd>
              </div>
              <div>
                <dt>Your mark B (◇)</dt>
                <dd className="num">
                  {markB
                    ? compareMeasurement.markB?.sky
                      ? `${formatRaHms(compareMeasurement.markB.sky.ra)} ${formatDecDms(compareMeasurement.markB.sky.dec)} (${compareMeasurement.markB.sky.ra.toFixed(5)}°, ${compareMeasurement.markB.sky.dec >= 0 ? '+' : ''}${compareMeasurement.markB.sky.dec.toFixed(5)}°) · px (${markB[0].toFixed(1)}, ${markB[1].toFixed(1)})`
                      : `px (${markB[0].toFixed(1)}, ${markB[1].toFixed(1)}) · WCS unavailable`
                    : 'Not marked'}
                </dd>
              </div>
            </dl>

            {compareMeasurement.qualityLimitations.length > 0 && (
              <ul className="compare-result__limits caption" aria-label="Measurement assumptions and quality limits">
                {compareMeasurement.qualityLimitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            )}

            {props.target?.key !== 'rwaur' && (
              <p className="caption compare-result__alt">
                Want to see brightness change without motion?{' '}
                <Link to={`${PATHS.explorer}?q=rwaur&compare=1&seq=combined&det=6`}>
                  Compare RW Aurigae (same-band variable brightness)
                </Link>
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="viewer-frame" data-tour="image">
            {renderCanvasFor(displayIndex, canvasRef, `Observation ${displayIndex + 1}`, { reportFov: true })}
            {renderFrameState(displayIndex)}
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
          {timelineControls('main')}
        </>
      )}

      {/* Guiding question & Gaia overlay legend */}
      <div className="viewer-prompt">
        <p className="viewer-prompt__question">
          {props.target?.change === 'brightness'
            ? 'Did this star stay at the same position while changing brightness?'
            : 'Which point moved relative to the surrounding stars?'}
        </p>
        <p className="caption">
          {inCompare
            ? 'Use “Mark position in A” and “Mark position in B” (or click directly on each image), check the estimated shift in arcseconds.'
            : 'Watch the surrounding field stars stay nearly fixed, click to mark what moves across observation dates.'}
        </p>

        <div className="viewer-prompt__actions" data-tour="markers">
          {hasPredictedCrosshair && (
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              aria-pressed={Boolean(toggles.crosshair)}
              title="Toggle predicted target crosshair (+) from API coordinates"
              onClick={() => setToggles({ crosshair: !toggles.crosshair })}
            >
              <Crosshair aria-hidden />
              <span>Target crosshair</span>
            </button>
          )}
          {catalogAvailable && (
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              aria-pressed={toggles.gaiaOverlays}
              onClick={() => setToggles({ gaiaOverlays: !toggles.gaiaOverlays })}
            >
              <Sparkles aria-hidden />
              <span>Gaia reference stars</span>
            </button>
          )}

          {experienceMode === 'science' && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                aria-pressed={props.spectrumEnabled}
                onClick={props.onShowSpectrum}
                title="Read measured SPHEREx flux by wavelength at the selected position"
              >
                <Sparkles aria-hidden />
                <span>Spectrum at point</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn--compact"
                aria-pressed={rulerActive}
                onClick={() => {
                  const next = !rulerActive
                  setRulerActive(next)
                  if (!next) {
                    setRulerStart(null)
                    setRulerMeasurement(null)
                    props.onRulerChange?.(null)
                  }
                }}
              >
                <span>{rulerActive ? 'Ruler A→B (active)' : 'Measure offset (A→B)'}</span>
              </button>
              <label className="viewer-source-select">
                <span className="sr-only">Image contrast stretch</span>
                <select
                  className="select select--compact"
                  value={stretch}
                  onChange={(e) => setStretch(e.target.value as CanvasStretch)}
                  aria-label="Image contrast stretch"
                >
                  <option value="default">Stretch: Standard</option>
                  <option value="high-contrast">Stretch: High contrast</option>
                  <option value="invert">Stretch: Inverted (print)</option>
                </select>
              </label>
            </>
          )}

          {inCompare && (markA || markB) ? (
            <button
              type="button"
              className="btn btn-secondary btn--compact"
              onClick={() => {
                setMarkingSlot(null)
                if (props.compareSelection?.onClearAllMarks) {
                  props.compareSelection.onClearAllMarks()
                } else {
                  setLocalMarkA(null)
                  setLocalMarkB(null)
                }
                props.onClearPick?.()
              }}
            >
              <X aria-hidden />
              <span>Clear marks</span>
            </button>
          ) : (
            props.picked &&
            props.onClearPick && (
              <button type="button" className="btn btn-secondary btn--compact" onClick={props.onClearPick}>
                <X aria-hidden />
                <span>Clear mark</span>
              </button>
            )
          )}
        </div>

        {catalogAvailable && toggles.gaiaOverlays && (
          <div className="star-picker" aria-label="Identify catalog stars">
            <label className="check">
              <input type="checkbox" checked={identifyStars} onChange={(e) => setIdentifyStars(e.target.checked)} />
              Select a star on the image
            </label>
            <p className="caption">Click a blue circle or choose a star below. Turn off star selection to mark freely. Catalog positions do not confirm a detection in this image.</p>
            {props.gaiaOverlayMeta?.loading ? <p role="status">Loading star catalog…</p>
              : props.gaiaOverlayMeta?.error ? <p role="status">Star identification is unavailable because the catalog could not be loaded.</p>
              : visibleStars.length === 0 ? <p role="status">No selectable catalog stars in this frame.</p>
              : (
                <label className="star-picker__select">
                  <span className="sr-only">Choose catalog star</span>
                  <select className="select" aria-label="Choose catalog star" value={currentStar?.sourceId ?? ''}
                    onChange={(e) => selectStar(visibleStars.find((s) => s.sourceId === e.target.value) ?? null)}>
                    <option value="">Choose a star ({visibleStars.length})</option>
                    {visibleStars.map((s) => <option key={s.sourceId} value={s.sourceId}>
                      {demo ? 'Demo star' : 'Gaia DR3'} {s.sourceId}{s.gMag != null ? ` · G ${s.gMag.toFixed(1)}` : ''}
                    </option>)}
                  </select>
                </label>
              )}
            {selection && !selectedStar && <p className="caption" role="status">No catalog star selected. Choose a marked circle; unmarked points have no identification here.</p>}
            {selectedStar && (
              <div className="star-picker__details" role="status">
                <strong>{demo ? 'Selected demo star' : 'Selected Gaia DR3 star'}</strong>
                <span className="num star-picker__id">{selectedStar.sourceId}</span>
                {selectedStar.catalogRa != null && selectedStar.catalogDec != null && <span className="caption num">
                  Catalog RA {selectedStar.catalogRa.toFixed(6)}° · Dec {selectedStar.catalogDec.toFixed(6)}°
                </span>}
                <span className="caption">G magnitude: {selectedStar.gMag?.toFixed(2) ?? 'Unavailable'}</span>
                {!currentStar && <span className="caption">This star is not among the displayed markers for this frame.</span>}
                <div className="viewer-prompt__actions">
                  <button type="button" className="btn btn-secondary btn--compact" disabled={!currentStar}
                    onClick={() => {
                      if (!currentStar) return
                      const ref = sideBySide && activeSlot === 'B' ? canvasBRef : canvasRef
                      ref.current?.centerOnPixel(currentStar.px)
                    }}>Center on selected star</button>
                  <button type="button" className="btn btn-secondary btn--compact" onClick={() => setStarSelection(null)}>Clear selection</button>
                </div>
              </div>
            )}
          </div>
        )}

        {experienceMode === 'science' && rulerActive && (
          <div className="notice" role="status">
            <div>
              {rulerMeasurement ? (
                <>
                  <strong>
                    Ruler A → B: Δθ = {rulerMeasurement.sepArcsec.toFixed(2)}″ (ΔRA* = {rulerMeasurement.draArcsec.toFixed(2)}″, ΔDec = {rulerMeasurement.ddecArcsec.toFixed(2)}″) · PA = {rulerMeasurement.paDeg.toFixed(1)}°
                  </strong>
                  <p className="caption num">
                    {rulerMeasurement.properMotionMasYr != null && rulerMeasurement.baselineYears != null
                      ? `Baseline Δt = ${rulerMeasurement.baselineYears.toFixed(2)} yr → apparent motion μ ≈ ${rulerMeasurement.properMotionMasYr.toFixed(0)} mas/yr. Click again to start a new measurement.`
                      : 'Measured on the same epoch. Tip: click point A on Date A, switch to Date B, and click point B to compute proper motion (mas/yr).'}
                  </p>
                </>
              ) : rulerStart ? (
                <p className="caption">
                  Point A set at pixel ({rulerStart.px[0]}, {rulerStart.px[1]}). Now click point B (you can switch to Date B first to measure motion across time).
                </p>
              ) : (
                <p className="caption">
                  Astrometry Ruler active: click point A on the image, then click point B to measure angular separation (″), position angle (°), and proper motion (mas/yr).
                </p>
              )}
            </div>
          </div>
        )}

        <ul className="marker-legend" aria-label="Image marker symbols">
          {hasPredictedCrosshair && (
            <li>
              <span className="marker-sym marker-sym--pred" aria-hidden>+</span>
              <span>Predicted {targetName} ({toggles.crosshair ? 'shown' : 'hidden'})</span>
            </li>
          )}
          {catalogAvailable && (
            <li>
              <span className="marker-sym marker-sym--gaia" aria-hidden>○</span>
              <span>Gaia DR3 reference star ({toggles.gaiaOverlays ? 'shown' : 'hidden'})</span>
            </li>
          )}
          <li>
            <span className="marker-sym marker-sym--user" aria-hidden>◇</span>
            <span>
              {inCompare
                ? `Your marks (A: ${markA ? `px ${Math.round(markA[0])}, ${Math.round(markA[1])}` : '—'} · B: ${markB ? `px ${Math.round(markB[0])}, ${Math.round(markB[1])}` : '—'})`
                : `Your mark (${props.picked ? `px ${Math.round(props.picked[0])}, ${Math.round(props.picked[1])}` : 'click image to mark'})`}
            </span>
          </li>
        </ul>

        {catalogAvailable && toggles.gaiaOverlays && (
          <p className="caption viewer-gaia-note">
            {props.gaiaOverlayMeta?.loading ? (
              'Loading Gaia DR3 reference positions…'
            ) : props.gaiaOverlayMeta?.error ? (
              'Gaia DR3 frame overlays from sky_archive are unavailable.'
            ) : (
              <>
                <strong>Gaia DR3 reference positions adjusted to this observation date</strong>
                {props.gaiaOverlayMeta
                  ? ` · showing ${props.gaiaOverlayMeta.selectedCount} recognizable reference stars (${props.gaiaOverlayMeta.totalInFrame} catalog stars in frame).`
                  : '.'}
              </>
            )}
          </p>
        )}
      </div>

      {/* Portal: the details panel is transformed, which would pin a fixed overlay to the panel and clip it. */}
      {expanded && createPortal(
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
              {renderCanvasFor(displayIndex, expandedRef, `Expanded ${activeSlot}`, {
                big: true,
                compareSlot: inCompare ? activeSlot : undefined,
              })}
              {renderFrameState(displayIndex)}
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
            {!inCompare && timelineControls('expanded')}
          </div>
        </div>,
        document.fullscreenElement ?? document.body,
      )}
    </section>
  )
}
