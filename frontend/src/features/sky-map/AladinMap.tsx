import A from 'aladin-lite'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useLanguage } from '../../shared/i18n/language'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { DR1_MAP_MJD, mapPosition } from '../../shared/config/epoch'
import { computePlanetPositions, type PlanetSkyPosition } from '../../shared/config/planets'
import { TARGETS, type TargetKey } from '../../shared/config/targets'
import {
  fetchVizierGaia,
  propagateGaiaCatalog,
  type GaiaCatalogStar,
} from './gaia'
import { customizeContextMenuActions, type SkyPoint } from './contextMenu'
import { discoverSurvey, observeFirstHipsTile, type BackgroundMode } from './survey-discovery'
import {
  aladinSliceArgument,
  sliceForDetector,
  SPHEREX_SURVEY,
  spherexSurveyFromHipsLayer,
  type SurveyInfo,
} from './surveys'
import './sky-map.css'

/**
 * Project-level wrapper around Aladin Lite. Method names here (focusTarget, setGridVisible, …)
 * are our own adapter API, not Aladin's.
 */

export interface GaiaStatusInfo {
  status: 'idle' | 'loading' | 'ready' | 'error'
  count?: number
  propagatedCount?: number
  staticCount?: number
  source?: 'sky_archive' | 'vizier'
  epochLabel?: string
}

export interface SelectedGaiaSource {
  ra: number
  dec: number
  catalogRa: number
  catalogDec: number
  sourceId: string | null
  gmag: number | null
  pmRa: number | null
  pmDec: number | null
  propagated: boolean
  epochLabel: string
  catalogSource: 'sky_archive' | 'vizier'
}

export interface SkyMapHandle {
  focus: (ra: number, dec: number, fovDeg?: number) => void
  setGridVisible: (visible: boolean) => void
  /** Illustrative diurnal motion: the view drifts in RA as if Earth were turning (sped up). */
  setSkyMotion: (on: boolean, degPerSecond?: number) => void
  setGaiaVisible: (visible: boolean, around?: { ra: number; dec: number }, targetKey?: TargetKey | null) => void
  setPlanetsVisible: (visible: boolean, epochMjd?: number) => void
  zoomIn: () => void
  zoomOut: () => void
  getFovDeg: () => number | null
  getCenter: () => { ra: number; dec: number } | null
}

interface Props {
  initial: { ra: number; dec: number; fovDeg: number }
  selectedKey: TargetKey | null
  onTargetSelected: (key: TargetKey) => void
  onFovChanged: (fovDeg: number) => void
  onStatus?: (status: 'loading' | 'ready' | 'error', message?: string) => void
  onGaiaStatus?: (info: GaiaStatusInfo) => void
  onSourceSelected?: (s: SelectedGaiaSource) => void
  onPlanetSelected?: (planet: PlanetSkyPosition) => void
  /** Right-click "View SPHEREx observations here" jumps the inspector to (ra, dec). */
  onInspectCoords?: (ra: number, dec: number) => void
  /** SPHEREx detector 1–6: the background shows that detector's middle wavelength. */
  detector?: number
  /** Active sky survey choice (`spherex` DR1 cube vs `wise` AllWISE infrared). */
  backgroundMode?: BackgroundMode
  /** Which background survey actually loaded (SPHEREx, WISE, or DSS2 fallback). */
  onSurvey?: (survey: SurveyInfo) => void
}

export const GAIA_RADIUS_DEG = 0.1

/**
 * Closest map zoom: the SPHEREx DR1 HiPS is only ~12.9″ per pixel, so zooming further shows big
 * blocks. Readout 1/tan(fov/2) = 300 → about 30,000%, half of the previous ~60,000% maximum.
 */
const MIN_FOV_DEG = (2 * Math.atan(1 / 300) * 180) / Math.PI
/** Sky motion view: the zoom readout shows about 27 % (tan 45° / tan 75° ≈ 0.27 of the default 90° view). */
const SKY_MOTION_FOV_DEG = 150
const SKY_MOTION_ZOOM_MS = 1200

async function loadArchiveSpherexSurvey(signal: AbortSignal): Promise<SurveyInfo> {
  const res = await api.hipsLayers(signal)
  const hit = res.layers.find((l) => l.layer_id === SPHEREX_SURVEY.id) ?? res.layers[0]
  return spherexSurveyFromHipsLayer(hit)
}

async function fetchGaiaCatalog(
  around: { ra: number; dec: number },
  targetKey?: TargetKey | null,
): Promise<{ stars: GaiaCatalogStar[]; source: 'sky_archive' | 'vizier' }> {
  if (targetKey && !config.useMock) {
    try {
      const res = await api.skyArchiveGaia(targetKey)
      if (res.sources.length > 0) {
        return {
          source: 'sky_archive',
          stars: res.sources.map((s) => ({
            sourceId: s.source_id,
            ra: s.ra,
            dec: s.dec,
            gmag: s.g_mag,
            pmRa: s.pmra_mas_yr,
            pmDec: s.pmdec_mas_yr,
            refEpochJyear: s.ref_epoch_jyear || 2016.0,
          })),
        }
      }
    } catch {
      // fall back to VizieR when DB is unavailable
    }
  }
  const stars = await fetchVizierGaia(around.ra, around.dec, GAIA_RADIUS_DEG)
  return { stars, source: 'vizier' }
}

// oxlint-disable-next-line typescript/no-explicit-any
type AladinInstance = any

export { SURVEY, type SurveyInfo } from './surveys'

export const AladinMap = forwardRef<SkyMapHandle, Props>(function AladinMap(
  {
    initial,
    selectedKey,
    onTargetSelected,
    onFovChanged,
    onStatus,
    onGaiaStatus,
    onSourceSelected,
    onPlanetSelected,
    onInspectCoords,
    detector = 6,
    backgroundMode = 'spherex',
    onSurvey,
  },
  ref,
) {
  const { lang } = useLanguage()
  const hostRef = useRef<HTMLDivElement>(null)
  const aladinRef = useRef<AladinInstance>(null)
  const startupRef = useRef<Promise<AladinInstance> | null>(null)
  const targetCatRef = useRef<AladinInstance>(null)
  const selectedCatRef = useRef<AladinInstance>(null)
  const gaiaCatRef = useRef<AladinInstance>(null)
  const planetsCatRef = useRef<AladinInstance>(null)
  const planetsDesiredRef = useRef<{ visible: boolean; epochMjd: number }>({ visible: true, epochMjd: DR1_MAP_MJD })
  const gaiaTokenRef = useRef<object | null>(null)
  const gaiaDesiredRef = useRef<{ around: { ra: number; dec: number }; targetKey: TargetKey | null } | null>(null)
  const gaiaCacheRef = useRef<Map<string, { stars: GaiaCatalogStar[]; source: 'sky_archive' | 'vizier' }>>(new Map())
  const motionRef = useRef<number | null>(null)
  const onSelectRef = useRef(onTargetSelected)
  const [ready, setReady] = useState(false)
  const [surveyState, setSurveyState] = useState<SurveyInfo | null>(null)
  const surveyRef = useRef<SurveyInfo | null>(null)
  const modeRef = useRef(backgroundMode)
  modeRef.current = backgroundMode
  onSelectRef.current = onTargetSelected
  const onSourceRef = useRef(onSourceSelected)
  onSourceRef.current = onSourceSelected
  const onPlanetSelectedRef = useRef(onPlanetSelected)
  onPlanetSelectedRef.current = onPlanetSelected
  const onInspectCoordsRef = useRef(onInspectCoords)
  onInspectCoordsRef.current = onInspectCoords
  const onGaiaStatusRef = useRef(onGaiaStatus)
  onGaiaStatusRef.current = onGaiaStatus
  const onSurveyRef = useRef(onSurvey)
  onSurveyRef.current = onSurvey

  const syncTargetMarkers = useCallback((epochMjd: number | undefined, currentSelectedKey: TargetKey | null) => {
    const markerEpoch = epochMjd ?? DR1_MAP_MJD
    const cat = targetCatRef.current
    if (cat) {
      cat.removeAll()
      cat.addSources(
        TARGETS.map((t) => {
          const p = mapPosition(t, markerEpoch)
          return A.source(p.ra, p.dec, { name: t.shortName, key: t.key })
        }),
      )
    }
    const sel = selectedCatRef.current
    if (sel) {
      sel.removeAll()
      const t = TARGETS.find((x) => x.key === currentSelectedKey)
      if (t) {
        const p = mapPosition(t, markerEpoch)
        sel.addSources([A.source(p.ra, p.dec, { key: t.key })])
      }
    }
  }, [])

  const drawGaiaCatalog = useCallback(
    (stars: GaiaCatalogStar[], source: 'sky_archive' | 'vizier', survey: SurveyInfo | null) => {
      const a = aladinRef.current
      if (!a) return
      if (gaiaCatRef.current) {
        a.removeLayer?.(gaiaCatRef.current)
        gaiaCatRef.current.hide?.()
        gaiaCatRef.current = null
      }
      const targetEpochMjd = survey?.epochMjd
      const summary = propagateGaiaCatalog(stars, targetEpochMjd)
      const cat = A.catalog({ name: 'Gaia DR3', shape: 'cross', sourceSize: 9, color: '#2F9DD0' })
      cat.addSources(
        summary.stars.map((s) =>
          A.source(s.displayRa, s.displayDec, {
            Source: s.sourceId,
            Gmag: s.gmag,
            pmRA: s.pmRa,
            pmDE: s.pmDec,
            catalogRa: s.ra,
            catalogDec: s.dec,
            propagated: s.propagated,
            epochLabel: s.propagated ? (survey?.epochLabel ?? 'DR1 (MJD 60982)') : 'J2016.0',
            catalogSource: source,
          }),
        ),
      )
      gaiaCatRef.current = cat
      a.addCatalog(cat)
      onGaiaStatusRef.current?.({
        status: 'ready',
        count: summary.total,
        propagatedCount: summary.propagatedCount,
        staticCount: summary.staticCount,
        source,
        epochLabel: targetEpochMjd != null ? survey?.epochLabel : 'J2016.0 (catalog)',
      })
    },
    [],
  )

  const drawPlanetsCatalog = useCallback((visible: boolean, epochMjd: number) => {
    const a = aladinRef.current
    if (!a) return
    if (planetsCatRef.current) {
      a.removeLayer?.(planetsCatRef.current)
      planetsCatRef.current.hide?.()
      planetsCatRef.current = null
    }
    if (!visible) return
    const planets = computePlanetPositions(epochMjd).filter((p) => !p.isObserver)
    const cat = A.catalog({
      name: 'Solar System planets',
      shape: 'circle',
      sourceSize: 16,
      color: '#F6C453',
      displayLabel: true,
      labelColumn: 'label',
      labelColor: '#FFD980',
      labelFont: '12px Andika, "Segoe UI Symbol", "Noto Sans Symbols", sans-serif',
    })
    cat.addSources(
      planets.map((p) =>
        A.source(p.ra, p.dec, {
          label: `${p.symbol} ${p.name}`,
          planetKey: p.key,
          planet: p,
        }),
      ),
    )
    planetsCatRef.current = cat
    a.addCatalog(cat)
  }, [])

  useEffect(() => {
    let disposed = false
    const host = hostRef.current
    if (!host) return
    const startedAt = performance.now()
    onStatus?.('loading')
    startupRef.current = A.init
      .then(() => {
        if (disposed) return null
        const aladin = A.aladin(host, {
          // An empty survey list lets Aladin start without requesting its default HiPS.
          survey: [],
          projection: 'TAN',
          fov: initial.fovDeg,
          target: `${initial.ra} ${initial.dec}`,
          cooFrame: 'ICRS',
          showReticle: false,
          showZoomControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showFrame: false,
          showCooGridControl: false,
          showSimbadPointerControl: false,
          showProjectionControl: false,
          showSettingsControl: false,
          showShareControl: false,
          showContextMenu: true,
          log: false,
          showStatusBar: false,
          showCooGrid: false,
          showCooLocation: false,
          showFov: false,
        })
        aladinRef.current = aladin
        if (aladin.contextMenu && typeof aladin.contextMenu.attach === 'function') {
          const origAttach = aladin.contextMenu.attach.bind(aladin.contextMenu)
          aladin.contextMenu.attach = (actions: unknown, target: unknown) => {
            const patched = customizeContextMenuActions(
              actions,
              aladin,
              () => lastRightClickSky,
              () => surveyRef.current?.epochMjd ?? DR1_MAP_MJD,
              (ra, dec) => onInspectCoordsRef.current?.(ra, dec),
            )
            return origAttach(patched, target)
          }
        }
        performance.measure('spherex:sky-map-constructed', { start: startedAt, end: performance.now() })
        let clamping = false
        const reportFov = (fovDeg: number) => {
          if (disposed || !Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180) return
          if (fovDeg < MIN_FOV_DEG && !clamping) {
            // Wheel, pinch or buttons went past the limit: snap back to it.
            clamping = true
            aladin.setFoV(MIN_FOV_DEG)
            clamping = false
            onFovChanged(MIN_FOV_DEG)
            return
          }
          onFovChanged(fovDeg)
        }
        aladin.on('zoomChanged', reportFov)
        reportFov(aladin.getFov()[0])

        const cat = A.catalog({
          name: 'SPHEREx targets',
          shape: 'circle',
          sourceSize: 22,
          color: '#F4EF83',
          displayLabel: true,
          labelColumn: 'name',
          labelColor: '#FFF3D6',
          labelFont: '14px Andika, sans-serif',
        })
        aladin.addCatalog(cat)
        targetCatRef.current = cat

        const sel = A.catalog({ name: 'Selected', shape: 'square', sourceSize: 34, color: '#E948AC' })
        aladin.addCatalog(sel)
        selectedCatRef.current = sel

        if (planetsDesiredRef.current.visible) {
          drawPlanetsCatalog(true, planetsDesiredRef.current.epochMjd)
        }

        aladin.on('objectClicked', (obj: AladinInstance) => {
          const d = obj?.data ?? {}
          if (d.planetKey && d.planet) {
            onPlanetSelectedRef.current?.(d.planet as PlanetSkyPosition)
            return
          }
          const key = d.key as TargetKey | undefined
          if (key) {
            onSelectRef.current(key)
            return
          }
          if (obj && typeof obj.ra === 'number' && obj.catalog?.name === 'Gaia DR3') {
            const g = Number(d.Gmag)
            const pmRa = d.pmRA != null && Number.isFinite(Number(d.pmRA)) ? Number(d.pmRA) : null
            const pmDec = d.pmDE != null && Number.isFinite(Number(d.pmDE)) ? Number(d.pmDE) : null
            onSourceRef.current?.({
              ra: obj.ra,
              dec: obj.dec,
              catalogRa: typeof d.catalogRa === 'number' ? d.catalogRa : obj.ra,
              catalogDec: typeof d.catalogDec === 'number' ? d.catalogDec : obj.dec,
              sourceId: d.Source != null && String(d.Source) ? String(d.Source) : null,
              gmag: Number.isFinite(g) ? g : null,
              pmRa,
              pmDec,
              propagated: Boolean(d.propagated),
              epochLabel: typeof d.epochLabel === 'string' ? d.epochLabel : 'J2016.0',
              catalogSource: d.catalogSource === 'sky_archive' ? 'sky_archive' : 'vizier',
            })
          }
        })
        setReady(true)
        onStatus?.('ready')
        return aladin
      })
      .catch((err: unknown) => {
        if (!disposed) onStatus?.('error', err instanceof Error ? err.message : 'The sky map could not start.')
        return null
      })
    let lastRightClickSky: SkyPoint | null = null
    const onHostContextMenuCapture = (e: MouseEvent) => {
      const a = aladinRef.current
      if (!a) return
      const rect = host.getBoundingClientRect()
      const rd = a.pix2world?.(e.clientX - rect.left, e.clientY - rect.top, 'icrs')
      if (Array.isArray(rd) && Number.isFinite(rd[0]) && Number.isFinite(rd[1])) {
        lastRightClickSky = { ra: rd[0], dec: rd[1] }
      }
    }
    const hideContextMenu = () => {
      aladinRef.current?.contextMenu?._hide?.()
      host.querySelectorAll<HTMLElement>('.aladin-context-menu').forEach((el) => {
        el.style.display = 'none'
      })
    }
    const onGlobalPointerDown = (e: PointerEvent) => {
      if (e.button === 2) return
      const targetEl = e.target as Element | null
      if (targetEl?.closest?.('.aladin-context-menu')) return
      hideContextMenu()
    }
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu()
    }
    host.addEventListener('contextmenu', onHostContextMenuCapture, true)
    window.addEventListener('pointerdown', onGlobalPointerDown, true)
    window.addEventListener('keydown', onGlobalKeyDown, true)
    window.addEventListener('blur', hideContextMenu)

    return () => {
      disposed = true
      host.removeEventListener('contextmenu', onHostContextMenuCapture, true)
      window.removeEventListener('pointerdown', onGlobalPointerDown, true)
      window.removeEventListener('keydown', onGlobalKeyDown, true)
      window.removeEventListener('blur', hideContextMenu)
      if (motionRef.current !== null) cancelAnimationFrame(motionRef.current)
      startupRef.current = null
      aladinRef.current = null
      host.innerHTML = ''
    }
    // Initial view only; later moves and survey switches go through dedicated effects and handle.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  // Discover imagery during Aladin startup and reuse the map when the user switches surveys.
  useEffect(() => {
    const startup = startupRef.current
    if (!startup) return
    const controller = new AbortController()
    const startedAt = performance.now()
    const discovery = discoverSurvey(backgroundMode, controller.signal, config.useMock ? undefined : loadArchiveSpherexSurvey)
    let stopTileObserver: (() => void) | undefined
    void Promise.all([startup, discovery]).then(([aladin, nextSurvey]) => {
      if (controller.signal.aborted || modeRef.current !== backgroundMode || !aladin || !nextSurvey) return
      if (surveyRef.current?.url !== nextSurvey.url) {
        stopTileObserver = observeFirstHipsTile(nextSurvey, startedAt)
        aladin.setBaseImageLayer(nextSurvey.url)
      }
      surveyRef.current = nextSurvey
      setSurveyState(nextSurvey)
      onSurveyRef.current?.(nextSurvey)
      const desired = gaiaDesiredRef.current
      if (desired) {
        const cacheKey = desired.targetKey
          ? `target:${desired.targetKey}`
          : `cone:${desired.around.ra.toFixed(4)},${desired.around.dec.toFixed(4)}`
        const cached = gaiaCacheRef.current.get(cacheKey)
        if (cached) {
          drawGaiaCatalog(cached.stars, cached.source, nextSurvey)
        }
      }
    })
    return () => {
      controller.abort()
      stopTileObserver?.()
    }
  }, [backgroundMode, drawGaiaCatalog])

  // Cube background: show the frame for the chosen detector. Aladin picks the cube's first frame when
  // the layer is added, so listen for Aladin's `AL:Layer.added` event instead of timing out on slow loads.
  useEffect(() => {
    const a = aladinRef.current
    if (!ready || !a || !surveyState?.cube) return
    const slice = sliceForDetector(detector)
    const applyIfReady = () => {
      const layer = a.getBaseImageLayer?.()
      if (layer?.added && typeof layer.setSliceNumber === 'function') {
        layer.setSliceNumber(aladinSliceArgument(slice, layer))
        return true
      }
      return false
    }
    if (applyIfReady()) return
    const div: HTMLElement | undefined = a.aladinDiv ?? hostRef.current ?? undefined
    const onLayerAdded = () => {
      if (applyIfReady()) {
        div?.removeEventListener('AL:Layer.added', onLayerAdded)
      }
    }
    div?.addEventListener('AL:Layer.added', onLayerAdded)
    return () => {
      div?.removeEventListener('AL:Layer.added', onLayerAdded)
    }
  }, [ready, detector, surveyState])

  useEffect(() => {
    if (!ready) return
    syncTargetMarkers(surveyState?.epochMjd, selectedKey)
  }, [ready, selectedKey, surveyState?.epochMjd, syncTargetMarkers])

  useImperativeHandle(
    ref,
    () => ({
      focus(ra, dec, fovDeg) {
        const a = aladinRef.current
        if (!a) return
        if (fovDeg) a.setFoV(Math.max(MIN_FOV_DEG, fovDeg))
        if (typeof a.animateToRaDec === 'function') a.animateToRaDec(ra, dec, 0.8)
        else a.gotoRaDec(ra, dec)
      },
      setSkyMotion(on, degPerSecond = 3) {
        if (motionRef.current !== null) {
          cancelAnimationFrame(motionRef.current)
          motionRef.current = null
        }
        if (!on) return
        let last = performance.now()
        const started = last
        const f0 = aladinRef.current?.getFov?.()
        const startFov = Array.isArray(f0) && Number.isFinite(f0[0]) ? f0[0] : SKY_MOTION_FOV_DEG
        // Zoom out first (to about 27 %), so the whole sky turns slowly instead of racing past a deep zoom.
        const zoomOut = startFov < SKY_MOTION_FOV_DEG
        const step = (now: number) => {
          const a = aladinRef.current
          if (!a) return
          const dt = Math.min(0.1, (now - last) / 1000)
          last = now
          if (zoomOut) {
            const t = Math.min(1, (now - started) / SKY_MOTION_ZOOM_MS)
            if (t < 1 || now - started < SKY_MOTION_ZOOM_MS + 100) {
              const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
              a.setFoV(startFov + (SKY_MOTION_FOV_DEG - startFov) * e)
            }
          }
          // Keep the on-screen speed steady: if someone zooms in while it turns, turn slower.
          const f = a.getFov?.()
          const fov = Array.isArray(f) && Number.isFinite(f[0]) ? f[0] : SKY_MOTION_FOV_DEG
          const speed = degPerSecond * Math.min(1, fov / SKY_MOTION_FOV_DEG)
          // Aladin returns a typed array [ra, dec].
          const rd = a.getRaDec?.() as ArrayLike<number> | undefined
          if (rd && rd.length >= 2 && Number.isFinite(rd[0])) {
            // Stars rise in the east and set in the west: the view's RA increases with time.
            a.gotoRaDec((((rd[0] + speed * dt) % 360) + 360) % 360, rd[1])
          }
          motionRef.current = requestAnimationFrame(step)
        }
        motionRef.current = requestAnimationFrame(step)
      },
      setGridVisible(visible) {
        aladinRef.current?.setCooGrid({ enabled: visible, color: '#C9C2B7', opacity: 0.55, labelSize: 13 })
      },
      setGaiaVisible(visible, around, targetKey = null) {
        const a = aladinRef.current
        if (!a) return
        if (gaiaCatRef.current) {
          a.removeLayer?.(gaiaCatRef.current)
          gaiaCatRef.current.hide?.()
          gaiaCatRef.current = null
        }
        gaiaTokenRef.current = null
        if (!visible || !around) {
          gaiaDesiredRef.current = null
          return
        }
        gaiaDesiredRef.current = { around, targetKey }
        const cacheKey = targetKey
          ? `target:${targetKey}`
          : `cone:${around.ra.toFixed(4)},${around.dec.toFixed(4)}`
        const cached = gaiaCacheRef.current.get(cacheKey)
        if (cached) {
          drawGaiaCatalog(cached.stars, cached.source, surveyRef.current)
          return
        }
        onGaiaStatusRef.current?.({ status: 'loading' })
        const token = {}
        gaiaTokenRef.current = token
        void fetchGaiaCatalog(around, targetKey)
          .then(({ stars, source }) => {
            gaiaCacheRef.current.set(cacheKey, { stars, source })
            if (gaiaTokenRef.current !== token || !aladinRef.current) return
            drawGaiaCatalog(stars, source, surveyRef.current)
          })
          .catch(() => {
            if (gaiaTokenRef.current === token) onGaiaStatusRef.current?.({ status: 'error' })
          })
      },
      setPlanetsVisible(visible, epochMjd) {
        const targetEpoch = epochMjd ?? surveyRef.current?.epochMjd ?? DR1_MAP_MJD
        planetsDesiredRef.current = { visible, epochMjd: targetEpoch }
        drawPlanetsCatalog(visible, targetEpoch)
      },
      zoomIn() {
        const a = aladinRef.current
        if (!a) return
        a.increaseZoom()
        const f = a.getFov?.()
        if (Array.isArray(f) && f[0] < MIN_FOV_DEG) a.setFoV(MIN_FOV_DEG)
      },
      zoomOut() {
        aladinRef.current?.decreaseZoom()
      },
      getFovDeg() {
        const f = aladinRef.current?.getFov?.()
        return Array.isArray(f) ? f[1] : null
      },
      getCenter() {
        const rd = aladinRef.current?.getRaDec?.()
        return Array.isArray(rd) && Number.isFinite(rd[0]) && Number.isFinite(rd[1])
          ? { ra: rd[0], dec: rd[1] }
          : null
      },
    }),
    [drawGaiaCatalog, drawPlanetsCatalog],
  )

  return (
    <div className="sky-map-wrap" role="application" aria-label={lang === 'vi' ? 'Bầu trời nhìn từ tâm thiên cầu. Kéo để quan sát xung quanh, cuộn để thu phóng.' : 'Sky as seen from the center of the celestial sphere. Drag to look around, scroll to zoom.'}>
      <div ref={hostRef} className="sky-map" />
    </div>
  )
})
