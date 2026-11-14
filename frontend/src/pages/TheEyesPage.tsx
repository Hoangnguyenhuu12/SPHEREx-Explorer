import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { Eye, Grid3x3, HelpCircle, LocateFixed, Maximize2, Minimize2, Minus, Mountain, Orbit, Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { config, PATHS } from '../app/config'
import { api } from '../shared/api'
import { describeError } from '../shared/api/errors'
import { TARGET_BY_KEY, isTargetKey, type TargetKey } from '../shared/config/targets'
import { CompactFooter, NavDrawer, SiteHeader } from '../shared/layout/Shell'
import { useOverlay } from '../shared/layout/overlay'
import { formatDecDms, formatRaHms } from '../features/target-search/coordinates'
import { usePlayer } from '../features/blink/player'
import { useFrameSession } from '../features/blink/useFrameSession'
import { AladinMap, SURVEY, type SkyMapHandle } from '../features/sky-map/AladinMap'
import { TargetPopup } from '../features/target-details/TargetPopup'
import type { ViewerToggles } from '../features/target-details/ObservationViewer'
import { TargetSearch } from '../features/target-search/TargetSearch'
import { parseSelection, resolveQuery, serializeSelection, type Selection } from '../features/target-search/explorer-url'
import { HelpDialog, Tutorial } from './eyes/Help'
import { Horizon } from '../features/sky-map/Horizon'
import './eyes/eyes.css'

const DEFAULT_TOGGLES: ViewerToggles = { mode: 'original', crosshair: true, flags: false, trail: false, pick: false }

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

export default function TheEyesPage() {
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const sel = useMemo(() => parseSelection(location.search), [location.search])
  const embed = new URLSearchParams(location.search).get('embed') === '1'
  const rq = useMemo(() => resolveQuery(sel.q), [sel.q])
  const { overlay, open, close } = useOverlay()
  const reduceMotion = useReducedMotion()
  const mapRef = useRef<SkyMapHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [mapStatus, setMapStatus] = useState<{ s: 'loading' | 'ready' | 'error'; msg?: string }>({ s: 'loading' })
  const [grid, setGrid] = useState(false)
  const [ground, setGround] = useState(true)
  const [skyMotion, setSkyMotion] = useState(false)
  const [gaia, setGaia] = useState(false)
  const [gaiaStatus, setGaiaStatus] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; count?: number }>({ status: 'idle' })
  const [fullscreen, setFullscreen] = useState(false)
  const [help, setHelp] = useState(false)
  const [source, setSource] = useState<{ ra: number; dec: number; sourceId: string | null; gmag: number | null } | null>(null)
  const [toggles, setTogglesState] = useState<ViewerToggles>(DEFAULT_TOGGLES)
  const setToggles = useCallback((patch: Partial<ViewerToggles>) => setTogglesState((t) => ({ ...t, ...patch })), [])

  // One health check per visit for build/mode diagnostics; never blocks frame requests.
  const health = useQuery({ queryKey: ['health', config.apiBaseUrl], queryFn: ({ signal }) => api.health(signal), enabled: !config.useMock, staleTime: Infinity })

  // Name resolution only for free-text names; coordinates and presets bypass it.
  const resolved = useQuery({
    queryKey: ['resolve', config.useMock, rq.kind === 'name' ? rq.name.toLowerCase() : null],
    queryFn: ({ signal }) => api.resolve((rq as { name: string }).name, signal),
    enabled: rq.kind === 'name',
    staleTime: Infinity,
  })

  const target = useMemo(() => {
    if (rq.kind === 'target') return TARGET_BY_KEY.get(rq.key) ?? null
    if (rq.kind === 'name' && isTargetKey(resolved.data?.target_key)) return TARGET_BY_KEY.get(resolved.data!.target_key as TargetKey) ?? null
    return null
  }, [rq, resolved.data])

  const coords = useMemo(() => {
    if (target) return { ra: target.raDeg, dec: target.decDeg }
    if (rq.kind === 'coords') return rq.coords
    if (rq.kind === 'name' && resolved.data) return { ra: resolved.data.ra, dec: resolved.data.dec }
    return null
  }, [target, rq, resolved.data])

  const title = target?.name ?? (rq.kind === 'name' && resolved.data ? resolved.data.name : coords ? 'Custom position' : '')
  const detector = sel.detector || target?.recommendedDetector || 6

  const framesParams = useMemo(
    () =>
      coords
        ? { ra: coords.ra, dec: coords.dec, detector, size: config.cutoutSizeDeg, maxFrames: config.maxFrames, targetKey: target?.key }
        : null,
    [coords, detector, target?.key],
  )
  const session = useFrameSession(framesParams)
  const { state: player, dispatch, reset } = usePlayer()

  // New sequence → reset the single player clock.
  useEffect(() => {
    reset(session.data?.frames.length ?? 0)
  }, [session.data, reset])

  // Selection change → back to the original image, no stale tool state.
  useEffect(() => {
    setTogglesState((t) => ({ ...DEFAULT_TOGGLES, crosshair: t.crosshair }))
  }, [framesParams])

  // Open details for a selection that arrives from the URL (deep link / Back).
  const lastQ = useRef<string | null>(null)
  useEffect(() => {
    if (!coords || lastQ.current === sel.q) return
    lastQ.current = sel.q
    setSkyMotion(false)
    open('target')
    mapRef.current?.focus(coords.ra, coords.dec, 0.6)
  }, [coords, sel.q, open])

  const commit = useCallback(
    (next: Partial<Selection>, replace = false) => {
      const merged: Selection = { ...sel, ...next }
      setSearchParams(serializeSelection(merged).replace(/^\?/, '') + (embed ? '&embed=1' : ''), { replace })
    },
    [sel, setSearchParams, embed],
  )

  const selectTarget = useCallback(
    (key: TargetKey) => {
      const t = TARGET_BY_KEY.get(key)!
      if (sel.q === key) {
        open('target')
        mapRef.current?.focus(t.raDeg, t.decDeg, 0.6)
        return
      }
      commit({ q: key, detector: 0, fovArcmin: null })
    },
    [commit, open, sel.q],
  )

  const submitQuery = useCallback((q: string) => commit({ q, detector: 0, fovArcmin: null }), [commit])

  // FOV of the image viewer is display-only; record it in the URL lazily.
  const fovTimer = useRef<number | undefined>(undefined)
  const onFovChange = useCallback(
    (a: number, byUser: boolean) => {
      if (!byUser) return
      window.clearTimeout(fovTimer.current)
      fovTimer.current = window.setTimeout(() => {
        const rounded = Math.min(10, Math.max(1, +a.toFixed(1)))
        if (rounded !== sel.fovArcmin) commit({ fovArcmin: rounded }, true)
      }, 600)
    },
    [commit, sel.fovArcmin],
  )
  useEffect(() => () => window.clearTimeout(fovTimer.current), [])

  useEffect(() => {
    if (mapStatus.s === 'ready') mapRef.current?.setGridVisible(grid)
  }, [grid, mapStatus.s])

  useEffect(() => {
    if (mapStatus.s === 'ready') mapRef.current?.setSkyMotion(skyMotion && !reduceMotion)
  }, [skyMotion, mapStatus.s, reduceMotion])

  useEffect(() => {
    if (mapStatus.s !== 'ready') return
    mapRef.current?.setGaiaVisible(gaia, coords ?? undefined)
    if (!gaia) setGaiaStatus({ status: 'idle' })
  }, [gaia, coords, mapStatus.s])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen?.()
  }

  const center = useCallback(() => {
    setSkyMotion(false)
    if (coords) mapRef.current?.focus(coords.ra, coords.dec, 0.6)
  }, [coords])

  const popupOpen = overlay === 'target' && !!coords

  // Page shortcuts; never while typing, and the image canvas handles its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || help) return
      if (document.querySelector('.modal-backdrop')) return
      switch (e.key) {
        case ' ':
          if (!popupOpen) return
          e.preventDefault()
          dispatch({ type: 'toggle' })
          break
        case 'ArrowRight':
          if (popupOpen) dispatch({ type: 'next' })
          break
        case 'ArrowLeft':
          if (popupOpen) dispatch({ type: 'prev' })
          break
        case 'g':
        case 'G':
          setGrid((g) => !g)
          break
        case 'm':
        case 'M':
          if (!reduceMotion) setSkyMotion((m) => !m)
          break
        case 'c':
        case 'C':
          center()
          break
        case 'd':
        case 'D':
          if (popupOpen && session.total >= 2) setToggles({ mode: toggles.mode === 'original' ? 'difference' : 'original' })
          break
        case 'Escape':
          if (overlay === 'target') close('target')
          break
        case '?':
          setHelp(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popupOpen, help, dispatch, center, session.total, toggles.mode, setToggles, overlay, close, reduceMotion])

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${PATHS.explorer}${serializeSelection(sel)}` : ''
  const embedUrl = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}embed=1`
  const dataLabel = config.useMock ? 'Observation data: Illustrative demo (generated, not SPHEREx)' : 'Observation data: NASA/IPAC IRSA, SPHEREx'

  return (
    <div className={`eyes${embed ? ' eyes--embed' : ''}`}>
      <a href="#sky" className="skip-link">
        Skip to sky map
      </a>
      {embed ? (
        <header className="eyes-embed-head">
          <Link to={`${PATHS.explorer}${serializeSelection(sel)}`} target="_blank" className="wordmark">
            SPHEREx Explorer
          </Link>
        </header>
      ) : (
        <>
          <SiteHeader variant="eyes">
            <TargetSearch
              key={sel.q}
              value={rq.kind === 'target' ? '' : sel.q}
              selectedKey={target?.key ?? null}
              busy={resolved.isFetching}
              onSubmit={submitQuery}
              onPreset={selectTarget}
            />
          </SiteHeader>
          <NavDrawer />
        </>
      )}

      <main id="sky" className="eyes__stage" ref={stageRef}>
        <AladinMap
          ref={mapRef}
          initial={coords ? { ra: coords.ra, dec: coords.dec, fovDeg: 0.6 } : { ra: 266.4, dec: -12, fovDeg: 110 }}
          selectedKey={target?.key ?? null}
          onTargetSelected={selectTarget}
          onStatus={(s, msg) => setMapStatus({ s, msg })}
          onGaiaStatus={(status, count) => setGaiaStatus({ status, count })}
          onSourceSelected={(s) => {
            close('navigation')
            setSource(s)
          }}
        />

        {mapStatus.s !== 'ready' && (
          <div className={`map-status${mapStatus.s === 'error' ? ' is-error' : ''}`} role={mapStatus.s === 'error' ? 'alert' : 'status'}>
            {mapStatus.s === 'loading' ? 'Loading the sky map…' : `The sky map could not start. ${mapStatus.msg ?? ''} The SPHEREx observations still work from the search.`}
          </div>
        )}

        {ground && <Horizon />}
        {skyMotion && (
          <p className="sky-motion-note" role="status">
            Sky motion on: the view turns the way the sky does as Earth rotates, sped up about 700 times. This is a visualisation,
            not SPHEREx data.
          </p>
        )}

        {!popupOpen && coords && title && (
          <button type="button" className="reopen" onClick={() => open('target')}>
            <Eye aria-hidden /> Show {title}
          </button>
        )}

        {rq.kind === 'name' && resolved.isError && (
          <div className="map-toast notice notice--warn" role="alert">
            <span>
              <strong>{describeError(resolved.error).title}.</strong> {describeError(resolved.error).body}
            </span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick={() => commit({ q: '' }, true)}>
              <X aria-hidden />
            </button>
          </div>
        )}

        {source && (
          <section className="source-card" aria-label="Gaia DR3 star">
            <div className="source-card__head">
              <h2 className="source-card__title">Gaia DR3 star</h2>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Close star details" onClick={() => setSource(null)}>
                <X aria-hidden />
              </button>
            </div>
            <dl className="facts">
              {source.sourceId && (
                <div>
                  <dt>Source ID</dt>
                  <dd className="num">{source.sourceId}</dd>
                </div>
              )}
              <div>
                <dt>RA / Dec (ICRS, epoch J2016)</dt>
                <dd className="num">
                  {formatRaHms(source.ra)} {formatDecDms(source.dec)}
                </dd>
              </div>
              <div>
                <dt>Brightness</dt>
                <dd className="num">{source.gmag != null ? `G = ${source.gmag.toFixed(2)} mag` : 'Not available'}</dd>
              </div>
            </dl>
            <p className="caption">Source: ESA Gaia DR3 via VizieR. Not a SPHEREx measurement.</p>
            <button type="button" className="btn btn-secondary" onClick={() => { submitQuery(`${source.ra.toFixed(6)} ${source.dec >= 0 ? '+' : ''}${source.dec.toFixed(6)}`); setSource(null) }}>
              View SPHEREx observations here
            </button>
          </section>
        )}

        {!embed && <Tutorial hidden={overlay !== 'none'} />}

        {popupOpen && coords && (
            <TargetPopup
              key={`${coords.ra}:${coords.dec}`}
              target={target}
              title={title}
              coords={coords}
              detector={detector}
              onDetector={(d) => commit({ detector: d })}
              session={session}
              player={player}
              dispatch={dispatch}
              toggles={toggles}
              setToggles={setToggles}
              fovArcmin={sel.fovArcmin}
              onFovChange={onFovChange}
              onClose={() => close('target')}
              onCenter={center}
              gaia={gaia}
              setGaia={setGaia}
              gaiaStatus={gaiaStatus}
              shareUrl={shareUrl}
              embedUrl={embedUrl}
            />
          )}
        <div className="dock" role="toolbar" aria-label="Sky tools">
          <button type="button" className="dock__btn" aria-pressed={grid} title="RA/Dec grid (G)" onClick={() => setGrid((g) => !g)}>
            <Grid3x3 aria-hidden /> <span>RA/Dec</span>
          </button>
          <button
            type="button"
            className="dock__btn"
            aria-pressed={skyMotion}
            title={reduceMotion ? 'Turned off because reduced motion is on' : 'Turn the whole sky as Earth rotates (M)'}
            disabled={!!reduceMotion || mapStatus.s !== 'ready'}
            onClick={() => setSkyMotion((m) => !m)}
          >
            <Orbit aria-hidden /> <span>Sky motion</span>
          </button>
          <button type="button" className="dock__btn" aria-pressed={ground} title="Show the ground and horizon" onClick={() => setGround((g) => !g)}>
            <Mountain aria-hidden /> <span>Ground</span>
          </button>
          <button type="button" className="dock__btn" aria-pressed={gaia} title="Gaia DR3 stars around the target" disabled={!coords} onClick={() => setGaia((g) => !g)}>
            <Sparkles aria-hidden /> <span>Gaia stars</span>
          </button>
          <span className="dock__sep" aria-hidden />
          <button type="button" className="dock__btn" title="Center on the selected target (C)" disabled={!coords} onClick={center}>
            <LocateFixed aria-hidden /> <span>Center</span>
          </button>
          <button type="button" className="dock__icon" aria-label="Zoom out map" title="Zoom out map" onClick={() => mapRef.current?.zoomOut()}>
            <Minus aria-hidden />
          </button>
          <button type="button" className="dock__icon" aria-label="Zoom in map" title="Zoom in map" onClick={() => mapRef.current?.zoomIn()}>
            <Plus aria-hidden />
          </button>
          <span className="dock__sep" aria-hidden />
          <button type="button" className="dock__icon" aria-label="Help and shortcuts" title="Help (?)" onClick={() => setHelp(true)}>
            <HelpCircle aria-hidden />
          </button>
          <button type="button" className="dock__icon" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title="Full screen" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
        </div>
      </main>

      <CompactFooter>
        <span className="sep">·</span>
        <span>
          Sky survey: {SURVEY.label} ({SURVEY.credit})
        </span>
        <span className="sep">·</span>
        <span className={config.useMock ? 'demo-tag' : undefined}>{dataLabel}</span>
        {!config.useMock && (
          <>
            <span className="sep">·</span>
            <span>
              Service: {health.data ? `${health.data.mode} mode${health.data.git_sha && health.data.git_sha !== 'unknown' ? ` · ${health.data.git_sha.slice(0, 7)}` : ''}` : health.isError ? 'unreachable' : 'checking…'}
            </span>
          </>
        )}
      </CompactFooter>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  )
}
