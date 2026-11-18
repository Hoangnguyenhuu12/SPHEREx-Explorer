import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { AlertTriangle, Eye, Globe2, Grid3x3, HelpCircle, Layers, LocateFixed, Maximize2, Minimize2, Minus, Mountain, Orbit, Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { config, PATHS } from '../app/config'
import { api } from '../shared/api'
import { describeErrorLocalized } from '../shared/api/errors'
import { TARGET_BY_KEY, isTargetKey, type TargetKey } from '../shared/config/targets'
import { CompactFooter, NavDrawer, SiteHeader } from '../shared/layout/Shell'
import { LanguageSwitch, useLanguage } from '../shared/i18n/language'
import { StableLabel } from '../shared/i18n/StableLabel'
import { useOverlay } from '../shared/layout/overlay'
import { formatDecDms, formatRaHms } from '../features/target-search/coordinates'
import { usePlayer } from '../features/blink/player'
import { useFrameSession } from '../features/blink/useFrameSession'
import { readExperienceMode, writeExperienceMode, type ExperienceMode } from '../features/experience-mode/mode'
import { AladinMap, SURVEY, type GaiaStatusInfo, type SelectedGaiaSource, type SkyMapHandle, type SurveyInfo } from '../features/sky-map/AladinMap'
import { DR1_MAP_MJD, mapPosition } from '../shared/config/epoch'
import { computePlanetPositions, currentMjd, type PlanetKey, type PlanetSkyPosition } from '../shared/config/planets'
import { TargetPopup } from '../features/target-details/TargetPopup'
import type { ViewerToggles } from '../features/target-details/ObservationViewer'
import { TargetSearch } from '../features/target-search/TargetSearch'
import { parseSelection, resolveQuery, serializeSelection, type Selection } from '../features/target-search/explorer-url'
import { HelpDialog } from './eyes/Help'
import { GuideToggle, GuideTour, type TourStep } from '../features/guide/guide'
import { GuideProvider, readGuide, writeGuide } from '../features/guide/guide-state'
import { Horizon } from '../features/sky-map/Horizon'
import './eyes/eyes.css'
import { ORBIT_COPY } from './where/translations'
import { PLANET_CATEGORY_VI, PLANET_FACTS_VI } from './eyes/planetVi'
import { EyesCopy } from '../features/target-details/EyesCopy'

const DEFAULT_TOGGLES: ViewerToggles = { mode: 'original', crosshair: true, flags: false, trail: false, pick: true, gaiaOverlays: true }
const COMBINED_TARGETS = new Set<TargetKey>(['wise0855', 'epsindib', 'barnard', 'rwaur', 'rdra'])
const DEFAULT_MAP_FOV_DEG = 90
const zoomFormat = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 })

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function isInteractiveTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && !!t.closest('button, a, summary, [role="tab"], input, textarea, select')
}

function formatLightTime(minutes: number, vi = false): string {
  if (minutes < 0.05) return vi ? '0 phút' : '0 min'
  if (minutes < 60) return vi ? `${minutes.toFixed(1)} phút ánh sáng` : `${minutes.toFixed(1)} min light-time`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return vi ? `${h} giờ ${m} phút ánh sáng` : `${h}h ${m}m light-time`
}

export default function TheEyesPage() {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const label = (en: string, vn: string) => <StableLabel text={vi ? vn : en} alt={vi ? en : vn} />
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
  const [mapFovDeg, setMapFovDeg] = useState<number | null>(null)
  const [grid, setGrid] = useState(false)
  const [ground, setGround] = useState(false)
  const [skyMotion, setSkyMotion] = useState(false)
  const [gaia, setGaia] = useState(false)
  const [gaiaStatus, setGaiaStatus] = useState<GaiaStatusInfo>({ status: 'idle' })
  const [planets, setPlanets] = useState(true)
  const [planetEpochMode, setPlanetEpochMode] = useState<'survey' | 'now'>('survey')
  const [selectedPlanetKey, setSelectedPlanetKey] = useState<PlanetKey | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const fsAttemptRef = useRef(0)
  const fsFallbackTimerRef = useRef<number | null>(null)
  const isFullscreen = fullscreen || fallbackFullscreen
  const [help, setHelp] = useState(false)
  const [guide, setGuideState] = useState(() => !embed && readGuide(location.search))
  const setGuide = useCallback((on: boolean) => {
    setGuideState(on)
    writeGuide(on)
  }, [])
  const [source, setSource] = useState<SelectedGaiaSource | null>(null)
  const [backgroundMode, setBackgroundMode] = useState<'spherex' | 'wise' | 'twomass'>('spherex')
  const [survey, setSurvey] = useState<SurveyInfo>(SURVEY)
  const [experienceMode, setExperienceModeState] = useState<ExperienceMode>(() => readExperienceMode(location.search))
  const setExperienceMode = useCallback((next: ExperienceMode) => {
    setExperienceModeState(next)
    writeExperienceMode(next)
  }, [])
  const [toggles, setTogglesState] = useState<ViewerToggles>(() => ({
    ...DEFAULT_TOGGLES,
    gaiaOverlays: sel.gaia !== undefined ? sel.gaia : true,
  }))

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

  // The map shows the active sky survey epoch (SPHEREx DR1 or AllWISE), so centre it where the target is in that epoch.
  // The frames request keeps J2000 coordinates: the backend moves the star to each observation date itself.
  const mapCoords = useMemo(
    () => (target ? mapPosition(target, survey.epochMjd ?? DR1_MAP_MJD) : coords),
    [target, coords, survey.epochMjd],
  )

  const title = target?.name ?? (rq.kind === 'name' && resolved.data ? resolved.data.name : coords ? (vi ? 'Vị trí tùy chọn' : 'Custom position') : '')
  const detector = sel.detector || target?.recommendedDetector || 6
  const spherexOnly = sel.seq === 'spherex' || detector !== 6
  const canCombine = target != null && COMBINED_TARGETS.has(target.key)
  const timeline = canCombine && !spherexOnly ? 'combined' as const : undefined

  const framesParams = useMemo(
    () =>
      coords
        ? { ra: coords.ra, dec: coords.dec, detector, size: config.cutoutSizeDeg, maxFrames: timeline ? config.combinedMaxFrames : config.maxFrames, targetKey: target?.key, timeline }
        : null,
    [coords, detector, target?.key, timeline],
  )
  const session = useFrameSession(framesParams)
  const { state: player, dispatch } = usePlayer(
    session.data,
    toggles.mode === 'difference' ? session.diffs : session.originals,
  )

  // Selection change → back to the original image, no stale tool state.
  useEffect(() => {
    setTogglesState((t) => ({ ...DEFAULT_TOGGLES, crosshair: t.crosshair, gaiaOverlays: t.gaiaOverlays }))
  }, [framesParams])

  // Open details for a selection that arrives from the URL (deep link / Back).
  const lastQ = useRef<string | null>(null)
  useEffect(() => {
    if (!coords || lastQ.current === sel.q) return
    lastQ.current = sel.q
    setSkyMotion(false)
    setSelectedPlanetKey(null)
    setSource(null)
    setTogglesState({
      ...DEFAULT_TOGGLES,
      gaiaOverlays: sel.gaia !== undefined ? sel.gaia : true,
    })
    open('target')
    if (mapCoords) mapRef.current?.focus(mapCoords.ra, mapCoords.dec, 0.6)
  }, [coords, mapCoords, sel.q, sel.compare, sel.gaia, target?.key, open])

  const commit = useCallback(
    (next: Partial<Selection>, replace = false) => {
      const merged: Selection = { ...sel, ...next }
      setSearchParams(serializeSelection(merged).replace(/^\?/, '') + (embed ? '&embed=1' : ''), { replace })
    },
    [sel, setSearchParams, embed],
  )

  const setToggles = useCallback(
    (patch: Partial<ViewerToggles>) => {
      setTogglesState((t) => ({ ...t, ...patch }))
      const urlPatch: Partial<Selection> = {}
      if (patch.gaiaOverlays !== undefined) urlPatch.gaia = patch.gaiaOverlays
      if (Object.keys(urlPatch).length > 0 && (sel.compare || target?.key === 'wise0855' || sel.frameA || sel.frameB || sel.markA || sel.markB)) {
        commit(urlPatch, true)
      }
    },
    [commit, sel.compare, sel.frameA, sel.frameB, sel.markA, sel.markB, target?.key],
  )

  const compareSelection = useMemo(
    () => ({
      queryText: sel.q,
      frameAId: sel.frameA,
      frameBId: sel.frameB,
      markA: sel.markA ?? null,
      markB: sel.markB ?? null,
      onFramePairChange: (frameAId: string, frameBId: string) =>
        commit(
          {
            compare: true,
            frameA: frameAId,
            frameB: frameBId,
            markA: frameAId === sel.frameA ? sel.markA : undefined,
            markB: frameBId === sel.frameB ? sel.markB : undefined,
          },
          true,
        ),
      onMarkChange: (slot: 'A' | 'B', px: [number, number] | null) =>
        commit(slot === 'A' ? { compare: true, markA: px ?? undefined } : { compare: true, markB: px ?? undefined }, true),
      onClearAllMarks: () => commit({ markA: undefined, markB: undefined }, true),
      onResetFrames: () => commit({ frameA: undefined, frameB: undefined, markA: undefined, markB: undefined }, true),
    }),
    [commit, sel.q, sel.frameA, sel.frameB, sel.markA, sel.markB],
  )

  const selectTarget = useCallback(
    (key: TargetKey) => {
      const t = TARGET_BY_KEY.get(key)!
      open('target')
      setSelectedPlanetKey(null)
      setSource(null)
      if (sel.q === key) {
        const p = mapPosition(t)
        mapRef.current?.focus(p.ra, p.dec, 0.6)
        return
      }
      commit(
        {
          q: key,
          detector: 0,
          fovArcmin: null,
          compare: undefined,
          seq: undefined,
          band: undefined,
          frameA: undefined,
          frameB: undefined,
          markA: undefined,
          markB: undefined,
          gaia: undefined,
        },
      )
    },
    [commit, open, sel.q],
  )

  const submitQuery = useCallback(
    (q: string) => {
      setSelectedPlanetKey(null)
      setSource(null)
      commit({
        q,
        detector: 0,
        fovArcmin: null,
        compare: undefined,
        seq: undefined,
        band: undefined,
        frameA: undefined,
        frameB: undefined,
        markA: undefined,
        markB: undefined,
        gaia: undefined,
      })
    },
    [commit],
  )

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

  const [liveMjd, setLiveMjd] = useState(() => currentMjd())
  const activePlanetEpochMjd = planetEpochMode === 'now' ? liveMjd : (survey.epochMjd ?? DR1_MAP_MJD)
  const planetPositions = useMemo(() => computePlanetPositions(activePlanetEpochMjd), [activePlanetEpochMjd])
  const selectedPlanet = useMemo(
    () => (selectedPlanetKey ? (planetPositions.find((p) => p.key === selectedPlanetKey) ?? null) : null),
    [planetPositions, selectedPlanetKey],
  )

  useEffect(() => {
    if (mapStatus.s === 'ready') mapRef.current?.setGridVisible(grid)
  }, [grid, mapStatus.s])

  useEffect(() => {
    if (mapStatus.s === 'ready') mapRef.current?.setSkyMotion(skyMotion && !reduceMotion)
  }, [skyMotion, mapStatus.s, reduceMotion])

  useEffect(() => {
    if (mapStatus.s !== 'ready') return
    const around = mapCoords ?? mapRef.current?.getCenter() ?? undefined
    mapRef.current?.setGaiaVisible(gaia, around, target?.key ?? null)
    if (!gaia) setGaiaStatus({ status: 'idle' })
  }, [gaia, mapCoords, target?.key, mapStatus.s])

  useEffect(() => {
    if (mapStatus.s !== 'ready') return
    mapRef.current?.setPlanetsVisible(planets, activePlanetEpochMjd)
  }, [planets, activePlanetEpochMjd, mapStatus.s])

  const focusPlanet = useCallback((p: PlanetSkyPosition) => {
    close('target')
    setSource(null)
    setSelectedPlanetKey(p.key)
    setSkyMotion(false)
    if (p.isObserver) {
      setGround(true)
      return
    }
    if (!planets) setPlanets(true)
    mapRef.current?.focus(p.ra, p.dec, 28)
  }, [close, planets])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current)
    const onFsError = () => {
      if (fsAttemptRef.current > 0) setFallbackFullscreen(true)
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('fullscreenerror', onFsError)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('fullscreenerror', onFsError)
      if (fsFallbackTimerRef.current !== null) window.clearTimeout(fsFallbackTimerRef.current)
    }
  }, [])

  const clearFsFallbackTimer = () => {
    if (fsFallbackTimerRef.current !== null) {
      window.clearTimeout(fsFallbackTimerRef.current)
      fsFallbackTimerRef.current = null
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement || fallbackFullscreen) {
      fsAttemptRef.current += 1
      clearFsFallbackTimer()
      if (document.fullscreenElement) void document.exitFullscreen()
      setFallbackFullscreen(false)
      return
    }
    const el = stageRef.current
    if (!document.fullscreenEnabled || !el?.requestFullscreen) {
      setFallbackFullscreen(true)
      return
    }
    const attemptId = ++fsAttemptRef.current
    clearFsFallbackTimer()
    // Some embedded webviews resolve requestFullscreen() cleanly and then exit fullscreen
    // immediately on the next tick, or leave it pending; re-check after settling.
    fsFallbackTimerRef.current = window.setTimeout(() => {
      fsFallbackTimerRef.current = null
      if (fsAttemptRef.current === attemptId && document.fullscreenElement !== el) {
        setFallbackFullscreen(true)
      }
    }, 220)
    try {
      Promise.resolve(el.requestFullscreen())
        .then(() => {
          clearFsFallbackTimer()
          fsFallbackTimerRef.current = window.setTimeout(() => {
            fsFallbackTimerRef.current = null
            if (fsAttemptRef.current === attemptId && document.fullscreenElement !== el) {
              setFallbackFullscreen(true)
            }
          }, 120)
        })
        .catch(() => {
          if (fsAttemptRef.current === attemptId) {
            clearFsFallbackTimer()
            setFallbackFullscreen(true)
          }
        })
    } catch {
      if (fsAttemptRef.current === attemptId) {
        clearFsFallbackTimer()
        setFallbackFullscreen(true)
      }
    }
  }

  const center = useCallback(() => {
    setSkyMotion(false)
    if (mapCoords) mapRef.current?.focus(mapCoords.ra, mapCoords.dec, 0.6)
  }, [mapCoords])

  const popupOpen = overlay === 'target' && !!coords

  // Page shortcuts; never while typing, and the image canvas handles its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || help) return
      if (document.querySelector('dialog:modal')) return
      switch (e.key) {
        case ' ':
          if (!popupOpen || isInteractiveTarget(e.target)) return
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
          if (popupOpen && !timeline && session.total >= 2) setToggles({ mode: toggles.mode === 'original' ? 'difference' : 'original' })
          break
        case 'Escape':
          if (fallbackFullscreen) {
            fsAttemptRef.current += 1
            clearFsFallbackTimer()
            setFallbackFullscreen(false)
          } else if (overlay === 'target') close('target')
          break
        case '?':
          setHelp(true)
          break
        case 't':
        case 'T':
          if (!embed) setGuide(!guide)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popupOpen, help, dispatch, center, session.total, toggles.mode, setToggles, overlay, close, reduceMotion, timeline, embed, guide, setGuide, fallbackFullscreen])

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${PATHS.explorer}${serializeSelection(sel)}` : ''
  const embedUrl = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}embed=1`
  const isMock = config.useMock || session.data?.mode === 'mock'
  const dataLabel = isMock ? (vi ? 'Dữ liệu quan sát: minh họa (tạo giả lập)' : 'Observation data: Illustrative demo (generated)') : timeline ? (vi ? 'Dữ liệu quan sát: unWISE và SPHEREx' : 'Observation data: unWISE and SPHEREx') : (vi ? 'Dữ liệu quan sát: NASA/IPAC IRSA, SPHEREx' : 'Observation data: NASA/IPAC IRSA, SPHEREx')
  // In the TAN projection, scale is proportional to the inverse tangent of half the field of view.
  const zoomLabel = mapFovDeg === null ? '—' : zoomFormat.format(
    Math.tan(DEFAULT_MAP_FOV_DEG * Math.PI / 360) / Math.tan(mapFovDeg * Math.PI / 360),
  )

  const tourCombined = canCombine && !spherexOnly
  const hasGaiaOverlay = tourCombined || Boolean(target?.key)
  const tourSteps = useMemo<TourStep[]>(() => {
    const steps: TourStep[] = [
      {
        anchors: ['targets'],
        title: 'Choose a target',
        body: (
          <p>
            <strong>Try it:</strong> click one of the featured stars, or type a star name or RA/Dec and press <strong>Go</strong>. The tutorial moves on when the
            star opens{popupOpen ? '' : ' (Next opens Barnard’s Star for you)'}.
          </p>
        ),
        done: 'Target chosen.',
      },
      {
        anchors: ['detectors'],
        needsTarget: true,
        title: 'Pick an infrared channel',
        body: <p><strong>Try it:</strong> click another detector. D1 is the shortest wavelength (0.75 µm), D6 the longest (5 µm); cold brown dwarfs show best in D5–D6.</p>,
        done: 'The images reload for that detector. D6 is the default for the featured stars.',
      },
      {
        anchors: ['player', 'view-mode'],
        needsTarget: true,
        title: 'Step through the dates',
        body: <p><strong>Try it:</strong> press <strong>Play</strong>, drag the slider or use ← →. The date above the image is when that frame was taken.</p>,
        done: 'Watch the image: field stars stay put while a moving target shifts.',
      },
      {
        anchors: ['image'],
        needsTarget: true,
        title: 'Read the image',
        body: hasGaiaOverlay ? (
          <>
            <p>
              <span className="sym-gaia">○ Blue circles</span> mark Gaia DR3 reference stars on this date. They barely move, so use them as reference: your target is
              the one that shifts or changes brightness.
            </p>
            <p>
              <strong>Try it:</strong> click a circle to identify a Gaia star, or turn off <strong>Select a star on the image</strong> below to mark any point yourself,
              and scroll to zoom.
            </p>
          </>
        ) : (
          <p><strong>Try it:</strong> click a star on the image to mark it, or scroll to zoom.</p>
        ),
        done: 'Selected or marked on the image. Scroll or use − / + to inspect the field closely.',
      },
    ]
    if (canCombine) {
      steps.push({
        anchors: ['source'],
        needsTarget: true,
        title: 'Switch observation source',
        body: (
          <p>
            <strong>unWISE W2 + SPHEREx D6</strong> spans more than a decade so motion stands out. <strong>Try it:</strong> choose{' '}
            <strong>SPHEREx only</strong> to compare SPHEREx epochs alone and unlock <strong>Difference</strong>.
          </p>
        ),
        done: 'Switch back to the combined sequence any time for the longer baseline.',
      })
    }
    if (hasGaiaOverlay) {
      steps.push({
        anchors: ['markers'],
        needsTarget: true,
        title: 'Markers on or off',
        body: (
          <p>
            <strong>Try it:</strong> toggle <strong>Gaia reference stars</strong> off to inspect the raw infrared image, then turn it back on to see the catalog
            circles.
          </p>
        ),
        done: 'Look at the image: the blue Gaia reference circles appear or disappear.',
      })
    }
    steps.push(
      {
        anchors: ['display', 'view-mode'],
        needsTarget: true,
        title: 'Spot what changed',
        body: (
          <p>
            <strong>Try it:</strong> <strong>Compare two dates</strong> puts two observations side by side. In Timeline, <strong>Difference</strong> subtracts the first
            date: still stars vanish and a bright–dark pair marks something that moved.
          </p>
        ),
        done: 'Compare the result with the original images before you trust a change.',
      },
      {
        anchors: ['tour-toggle'],
        title: 'That’s it',
        body: <p>Open this tutorial again any time with the <strong>Tutorial</strong> button or the T key.</p>,
      },
    )
    const translated: Record<string, { title: string; body: string; done?: string }> = {
      'Choose a target': { title: 'Chọn mục tiêu', body: 'Hãy chọn một ngôi sao nổi bật hoặc nhập tên sao hay tọa độ RA/Dec rồi nhấn Tìm. Hướng dẫn sẽ tiếp tục khi mục tiêu mở ra.', done: 'Đã chọn mục tiêu.' },
      'Pick an infrared channel': { title: 'Chọn kênh hồng ngoại', body: 'Hãy chọn cảm biến khác. D1 có bước sóng ngắn nhất (0,75 µm), D6 dài nhất (5 µm); sao lùn nâu lạnh hiện rõ hơn ở D5–D6.', done: 'Ảnh sẽ tải lại theo cảm biến đã chọn. D6 là mặc định cho các sao nổi bật.' },
      'Step through the dates': { title: 'Xem các thời điểm', body: 'Nhấn Phát, kéo thanh trượt hoặc dùng phím ← →. Ngày phía trên ảnh là ngày chụp của khung hình.', done: 'Các sao nền gần như đứng yên, còn mục tiêu có thể dịch chuyển.' },
      'Read the image': { title: 'Đọc hình ảnh', body: hasGaiaOverlay ? 'Các vòng tròn xanh đánh dấu sao tham chiếu Gaia DR3. Nhấn vào vòng tròn để nhận diện sao, hoặc tắt chọn sao để đánh dấu một điểm; cuộn để phóng to.' : 'Nhấn vào một ngôi sao trên ảnh để đánh dấu, hoặc cuộn để phóng to.', done: 'Đã chọn hoặc đánh dấu trên ảnh. Cuộn hoặc dùng − / + để quan sát kỹ hơn.' },
      'Switch observation source': { title: 'Đổi nguồn quan sát', body: 'Chuỗi unWISE W2 + SPHEREx D6 kéo dài hơn một thập kỷ. Chọn chỉ SPHEREx để so sánh các thời điểm SPHEREx và dùng chế độ ảnh hiệu.', done: 'Bạn có thể chuyển lại chuỗi kết hợp bất cứ lúc nào.' },
      'Markers on or off': { title: 'Bật hoặc tắt dấu sao', body: 'Tắt sao tham chiếu Gaia để xem ảnh hồng ngoại gốc, rồi bật lại để hiện các vòng tròn danh mục.', done: 'Các vòng tròn tham chiếu Gaia đã hiện hoặc ẩn trên ảnh.' },
      'Spot what changed': { title: 'Tìm sự thay đổi', body: 'So sánh hai ngày đặt hai ảnh cạnh nhau. Trong dòng thời gian, ảnh hiệu trừ ảnh đầu tiên: sao đứng yên biến mất và một cặp sáng–tối có thể cho thấy chuyển động.', done: 'Hãy đối chiếu kết quả với ảnh gốc trước khi kết luận.' },
      'That’s it': { title: 'Hoàn tất', body: 'Bạn có thể mở lại hướng dẫn bất cứ lúc nào bằng nút Hướng dẫn hoặc phím T.' },
    }
    return steps.map((step) => {
      const item = translated[step.title]
      if (!item) return step
      return vi
        ? { ...step, title: item.title, alternateTitle: step.title, body: <p>{item.body}</p>, alternateBody: step.body, done: item.done }
        : { ...step, alternateTitle: item.title, alternateBody: <p>{item.body}</p> }
    })
  }, [canCombine, hasGaiaOverlay, popupOpen, vi])

  const ensureTourTarget = useCallback(() => {
    if (coords) open('target')
    else selectTarget('barnard')
  }, [coords, open, selectTarget])

  return (
    <GuideProvider value={guide}>
    <div className={`eyes${embed ? ' eyes--embed' : ''}`}>
      <a href="#sky" className="skip-link">
        {vi ? 'Chuyển đến bản đồ bầu trời' : 'Skip to sky map'}
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
            <LanguageSwitch />
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

      <main id="sky" className={fallbackFullscreen ? 'eyes__stage eyes__stage--fullscreen' : 'eyes__stage'} ref={stageRef}>
        <AladinMap
          ref={mapRef}
          initial={mapCoords ? { ra: mapCoords.ra, dec: mapCoords.dec, fovDeg: 0.6 } : { ra: 266.4, dec: -12, fovDeg: DEFAULT_MAP_FOV_DEG }}
          selectedKey={target?.key ?? null}
          onTargetSelected={selectTarget}
          onFovChanged={setMapFovDeg}
          onStatus={(s, msg) => setMapStatus({ s, msg })}
          onGaiaStatus={setGaiaStatus}
          onSourceSelected={(s) => {
            close('navigation')
            close('target')
            setSelectedPlanetKey(null)
            setSource(s)
          }}
          onPlanetSelected={(p) => {
            close('navigation')
            close('target')
            setSource(null)
            setSelectedPlanetKey(p.key)
          }}
          onInspectCoords={(ra, dec) => {
            setSelectedPlanetKey(null)
            setSource(null)
            submitQuery(`${ra.toFixed(6)} ${dec >= 0 ? '+' : ''}${dec.toFixed(6)}`)
          }}
          detector={detector}
          backgroundMode={backgroundMode}
          onSurvey={setSurvey}
        />

        {mapStatus.s !== 'ready' && (
          <div className={`map-status${mapStatus.s === 'error' ? ' is-error' : ''}`} role={mapStatus.s === 'error' ? 'alert' : 'status'}>
            {mapStatus.s === 'loading' ? (vi ? 'Đang tải bản đồ bầu trời…' : 'Loading the sky map…') : vi ? `Không thể mở bản đồ bầu trời. ${mapStatus.msg ?? ''} Bạn vẫn có thể tìm ảnh quan sát SPHEREx.` : `The sky map could not start. ${mapStatus.msg ?? ''} The SPHEREx observations still work from the search.`}
          </div>
        )}

        {mapStatus.s === 'ready' && survey.key === 'dss2' && (
          <div className="map-epoch-warn notice notice--warn" role="status">
            <AlertTriangle aria-hidden />
            <span>
              <strong>{vi ? 'DSS2 dự phòng (các tấm quang học thập niên 1950–1990):' : 'DSS2 fallback (1950s–1990s optical plates):'}</strong> {vi ? `dấu mục tiêu (DR1 MJD ${DR1_MAP_MJD}) và sao Gaia DR3 (J2016.0) chưa được căn theo thời điểm tấm DSS2.` : `target markers (DR1 MJD ${DR1_MAP_MJD}) and Gaia DR3 stars (J2016.0) are not aligned to the DSS2 plate epoch.`}
            </span>
          </div>
        )}

        {ground && <Horizon />}
        {skyMotion && (
          <p className="sky-motion-note" role="status">
            {vi ? 'Chuyển động bầu trời đang bật: khung nhìn xoay theo chuyển động do Trái Đất tự quay, nhanh hơn khoảng 700 lần. Đây là hình minh họa, không phải dữ liệu SPHEREx.' : 'Sky motion on: the view turns the way the sky does as Earth rotates, sped up about 700 times. This is a visualisation, not SPHEREx data.'}
          </p>
        )}

        {!popupOpen && coords && title && (
          <button
            type="button"
            className="reopen"
            onClick={() => {
              setSelectedPlanetKey(null)
              setSource(null)
              open('target')
            }}
          >
            <Eye aria-hidden /> {vi ? `Hiện ${title}` : `Show ${title}`}
          </button>
        )}

        {rq.kind === 'name' && resolved.isError && (
          <div className="map-toast notice notice--warn" role="alert">
            <span>
              <strong>{describeErrorLocalized(resolved.error, lang).title}.</strong> {describeErrorLocalized(resolved.error, lang).body}
            </span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={vi ? 'Đóng thông báo' : 'Dismiss'} onClick={() => commit({ q: '' }, true)}>
              <X aria-hidden />
            </button>
          </div>
        )}

        {!popupOpen && !selectedPlanet && !embed && planets && mapStatus.s === 'ready' && (
          <nav className="planet-strip" aria-label={vi ? 'Các hành tinh trong Hệ Mặt Trời' : 'Solar System planets'}>
            {planetPositions.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`planet-chip${selectedPlanetKey === p.key ? ' is-selected' : ''}`}
                aria-pressed={selectedPlanetKey === p.key}
                title={p.isObserver ? (vi ? 'Trái Đất (người quan sát dưới quỹ đạo thấp)' : 'Earth (observer beneath low-Earth orbit)') : `${vi ? ORBIT_COPY.vi[p.key] : p.name} · ${p.geoAu.toFixed(2)} AU ${vi ? 'từ Trái Đất' : 'from Earth'}`}
                onClick={() => focusPlanet(p)}
              >
                <span className="planet-chip__sym" style={{ color: p.color }} aria-hidden>
                  {p.symbol}
                </span>
                {label(p.name, ORBIT_COPY.vi[p.key])}
              </button>
            ))}
          </nav>
        )}

        {selectedPlanet && (
          <section className="source-card planet-card" aria-label={vi ? 'Hành tinh trong Hệ Mặt Trời' : 'Solar System planet'}>
            <div className="source-card__head">
              <h2 className="source-card__title">
                <span style={{ color: selectedPlanet.color }} aria-hidden>
                  {selectedPlanet.symbol}{' '}
                </span>
                {label(selectedPlanet.name, ORBIT_COPY.vi[selectedPlanet.key])}
              </h2>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={vi ? 'Đóng chi tiết hành tinh' : 'Close planet details'} onClick={() => setSelectedPlanetKey(null)}>
                <X aria-hidden />
              </button>
            </div>
            <div className="planet-card__meta">
              <span className="pill">{label(selectedPlanet.category, PLANET_CATEGORY_VI[selectedPlanet.category])}</span>
              {!selectedPlanet.isObserver && (
                <div className="planet-card__epoch" role="group" aria-label="Planet position epoch">
                  <button
                    type="button"
                    className={`planet-epoch-btn${planetEpochMode === 'survey' ? ' is-on' : ''}`}
                    aria-pressed={planetEpochMode === 'survey'}
                    onClick={() => setPlanetEpochMode('survey')}
                  >
                    {survey.epochLabel ?? (vi ? 'Khảo sát' : 'Survey')}
                  </button>
                  <button
                    type="button"
                    className={`planet-epoch-btn${planetEpochMode === 'now' ? ' is-on' : ''}`}
                    aria-pressed={planetEpochMode === 'now'}
                    onClick={() => {
                      setLiveMjd(currentMjd())
                      setPlanetEpochMode('now')
                    }}
                  >
                    {label('Today', 'Hôm nay')}
                  </button>
                </div>
              )}
            </div>

            {experienceMode === 'explore' ? (
              <>
                <dl className="facts">
                  <div>
                    <dt>{vi ? 'Khoảng cách từ Trái Đất' : 'Distance from Earth'}</dt>
                    <dd className="num">
                      {selectedPlanet.isObserver
                        ? (vi ? '0 AU — SPHEREx bay ở độ cao khoảng 650 km' : '0 AU — SPHEREx flies ~650 km overhead')
                        : `${selectedPlanet.geoAu.toFixed(2)} AU (${formatLightTime(selectedPlanet.lightTimeMin, vi)})`}
                    </dd>
                  </div>
                  <div>
                    <dt>{vi ? 'Khoảng cách từ Mặt Trời' : 'Distance from the Sun'}</dt>
                    <dd className="num">{selectedPlanet.helioAu.toFixed(2)} AU</dd>
                  </div>
                </dl>
                <p className="caption planet-card__fact"><EyesCopy alternate={vi ? selectedPlanet.funFact : PLANET_FACTS_VI[selectedPlanet.key].fun}>{vi ? PLANET_FACTS_VI[selectedPlanet.key].fun : selectedPlanet.funFact}</EyesCopy></p>
              </>
            ) : (
              <>
                <dl className="facts">
                  {selectedPlanet.isObserver ? (
                    <>
                      <div>
                        <dt>{vi ? 'Bán kính quỹ đạo (r)' : 'Orbital radius (r)'}</dt>
                        <dd className="num">{selectedPlanet.helioAu.toFixed(4)} AU</dd>
                      </div>
                      <div>
                        <dt>{vi ? 'Quỹ đạo quan sát' : 'Observer orbit'}</dt>
                        <dd>{vi ? 'Quỹ đạo thấp đồng bộ Mặt Trời ở độ cao khoảng 650 km, dọc ranh giới ngày đêm' : '~650 km Sun-synchronous LEO along the terminator'}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>
                          {vi ? 'ICRS biểu kiến' : 'Apparent ICRS'} ({planetEpochMode === 'now' ? (vi ? 'Hôm nay' : 'Live today') : (survey.epochLabel ?? `MJD ${DR1_MAP_MJD}`)})
                        </dt>
                        <dd className="num">
                          {formatRaHms(selectedPlanet.ra)} {formatDecDms(selectedPlanet.dec)}
                        </dd>
                      </div>
                      <div>
                        <dt>{vi ? 'Nhật tâm r / địa tâm Δ' : 'Heliocentric r / Geocentric Δ'}</dt>
                        <dd className="num">
                          {selectedPlanet.helioAu.toFixed(3)} AU / {selectedPlanet.geoAu.toFixed(3)} AU
                        </dd>
                      </div>
                      <div>
                        <dt>{vi ? 'Góc ly Mặt Trời · Thời gian ánh sáng' : 'Solar elongation · Light time'}</dt>
                        <dd className="num">
                          {selectedPlanet.elongationDeg.toFixed(1)}° · {formatLightTime(selectedPlanet.lightTimeMin, vi)}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                <p className="caption planet-card__fact"><EyesCopy alternate={vi ? selectedPlanet.spherexNote : PLANET_FACTS_VI[selectedPlanet.key].science}>{vi ? PLANET_FACTS_VI[selectedPlanet.key].science : selectedPlanet.spherexNote}</EyesCopy></p>
              </>
            )}

            <div className="planet-card__actions">
              {selectedPlanet.isObserver ? (
                <button type="button" className="btn btn-secondary" onClick={() => setGround((g) => !g)}>
                  <Mountain aria-hidden /> {ground ? label('Hide Earth horizon', 'Ẩn chân trời Trái Đất') : label('Show Earth horizon', 'Hiện chân trời Trái Đất')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!planets) setPlanets(true)
                    mapRef.current?.focus(selectedPlanet.ra, selectedPlanet.dec, 28)
                  }}
                >
                  <LocateFixed aria-hidden /> {vi ? `Căn giữa tại ${ORBIT_COPY.vi[selectedPlanet.key]}` : `Center on ${selectedPlanet.name}`}
                </button>
              )}
              <div className="planet-card__jumper" aria-label={vi ? 'Chuyển đến hành tinh khác' : 'Jump to another planet'}>
                {planetPositions.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`planet-jump-btn${p.key === selectedPlanet.key ? ' is-selected' : ''}`}
                    title={vi ? ORBIT_COPY.vi[p.key] : p.name}
                    aria-label={vi ? ORBIT_COPY.vi[p.key] : p.name}
                    onClick={() => focusPlanet(p)}
                  >
                    <span style={{ color: p.color }}>{p.symbol}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {source && (
          <section className="source-card" aria-label={vi ? 'Sao Gaia DR3' : 'Gaia DR3 star'}>
            <div className="source-card__head">
              <h2 className="source-card__title">{vi ? 'Sao Gaia DR3' : 'Gaia DR3 star'}</h2>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={vi ? 'Đóng chi tiết sao' : 'Close star details'} onClick={() => setSource(null)}>
                <X aria-hidden />
              </button>
            </div>
            <dl className="facts">
              {source.sourceId && (
                <div>
                  <dt>{vi ? 'Mã nguồn' : 'Source ID'}</dt>
                  <dd className="num">{source.sourceId}</dd>
                </div>
              )}
              <div>
                <dt>{vi ? 'RA / Dec (ICRS, thời điểm danh mục J2016.0)' : 'RA / Dec (ICRS, catalog epoch J2016.0)'}</dt>
                <dd className="num">
                  {formatRaHms(source.catalogRa)} {formatDecDms(source.catalogDec)}
                </dd>
              </div>
              {source.propagated && (
                <div>
                  <dt>{vi ? 'Vị trí trên bản đồ' : 'Map position'} ({source.epochLabel})</dt>
                  <dd className="num">
                    {formatRaHms(source.ra)} {formatDecDms(source.dec)}
                  </dd>
                </div>
              )}
              <div>
                <dt>{vi ? 'Độ sáng' : 'Brightness'}</dt>
                <dd className="num">{source.gmag != null ? `G = ${source.gmag.toFixed(2)} mag` : (vi ? 'Không có dữ liệu' : 'Not available')}</dd>
              </div>
            </dl>
            <p className="caption">
              {vi ? 'Nguồn' : 'Source'}: ESA Gaia DR3 {vi ? 'qua' : 'via'} {source.catalogSource === 'sky_archive' ? 'Supabase sky_archive' : 'VizieR'}
              {source.propagated ? (vi ? ' (đã quy đổi theo chuyển động góc)' : ' (propagated with angular_proper_motion_only)') : (vi ? ' (thiếu pmRA/pmDE hoặc dùng DSS2: giữ tại J2016.0)' : ' (pmRA/pmDE absent or DSS2 fallback: kept at J2016.0)')}. {vi ? 'Không phải phép đo SPHEREx.' : 'Not a SPHEREx measurement.'}
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => { submitQuery(`${source.catalogRa.toFixed(6)} ${source.catalogDec >= 0 ? '+' : ''}${source.catalogDec.toFixed(6)}`); setSource(null) }}>
              {label('View SPHEREx observations here', 'Xem quan sát SPHEREx tại đây')}
            </button>
          </section>
        )}

        {!embed && <GuideToggle on={guide} onChange={setGuide} />}
        {guide && !embed && <GuideTour steps={tourSteps} hasTarget={popupOpen} ensureTarget={ensureTourTarget} onClose={() => setGuide(false)} />}


        {popupOpen && coords && (
            <TargetPopup
              timelineControl={
                canCombine
                  ? {
                      combined: !spherexOnly,
                      setCombined: (value) =>
                        commit(
                          {
                            seq: value ? 'combined' : 'spherex',
                            ...(value ? { detector: 6 } : {}),
                            frameA: undefined,
                            frameB: undefined,
                            markA: undefined,
                            markB: undefined,
                          },
                          true,
                        ),
                    }
                  : undefined
              }
              initialCompare={Boolean(sel.compare)}
              compareSelection={compareSelection}
              key={`${coords.ra}:${coords.dec}`}
              target={target}
              title={title}
              coords={coords}
              detector={detector}
              onDetector={(d) => commit({ detector: d, frameA: undefined, frameB: undefined, markA: undefined, markB: undefined })}
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
              survey={survey}
              shareUrl={shareUrl}
              embedUrl={embedUrl}
              experienceMode={experienceMode}
              onExperienceModeChange={setExperienceMode}
            />
          )}
        <div className="dock" role="toolbar" aria-label={vi ? 'Công cụ bầu trời' : 'Sky tools'}>
          {!popupOpen && (
            <>
              <div className="dock__switch dock__switch--mode" role="group" aria-label={vi ? 'Chế độ trải nghiệm' : 'Experience mode'}>
                <button
                  type="button"
                  className="dock__btn"
                  aria-pressed={experienceMode === 'explore'}
                  title={vi ? 'Chế độ khám phá cho người mới và học sinh' : 'Explore mode for beginners & students'}
                  onClick={() => setExperienceMode('explore')}
                >
                  {label('Explore', 'Khám phá')}
                </button>
                <button
                  type="button"
                  className="dock__btn"
                  aria-pressed={experienceMode === 'science'}
                  title={vi ? 'Chế độ khoa học cho nhà nghiên cứu và cộng đồng' : 'Science mode for citizen scientists & researchers'}
                  onClick={() => setExperienceMode('science')}
                >
                  {label('Science', 'Khoa học')}
                </button>
              </div>
              <span className="dock__sep" role="separator" aria-orientation="vertical" />
            </>
          )}
          <button type="button" className="dock__btn" aria-pressed={grid} title={vi ? 'Lưới RA/Dec (G)' : 'RA/Dec grid (G)'} onClick={() => setGrid((g) => !g)}>
            <Grid3x3 aria-hidden /> <span>RA/Dec</span>
          </button>
          <button
            type="button"
            className="dock__btn dock__wide-only"
            aria-pressed={skyMotion}
            title={reduceMotion ? (vi ? 'Đã tắt vì thiết bị bật chế độ giảm chuyển động' : 'Turned off because reduced motion is on') : (vi ? 'Xoay bầu trời theo chuyển động Trái Đất (M)' : 'Turn the whole sky as Earth rotates (M)')}
            disabled={!!reduceMotion || mapStatus.s !== 'ready'}
            onClick={() => setSkyMotion((m) => !m)}
          >
            <Orbit aria-hidden /> {label('Sky motion', 'Bầu trời xoay')}
          </button>
          <button type="button" className="dock__btn dock__wide-only" aria-pressed={ground} title={vi ? 'Hiện mặt đất và chân trời' : 'Show the ground and horizon'} onClick={() => setGround((g) => !g)}>
            <Mountain aria-hidden /> {label('Ground', 'Chân trời')}
          </button>
          <button type="button" className="dock__btn" aria-pressed={gaia} title={vi ? 'Sao Gaia DR3 quanh khung nhìn hoặc mục tiêu' : 'Gaia DR3 stars around the view or target'} disabled={mapStatus.s !== 'ready'} onClick={() => setGaia((g) => !g)}>
            <Sparkles aria-hidden /> {label('Gaia stars', 'Sao Gaia')}
          </button>
          <button
            type="button"
            className="dock__btn"
            aria-pressed={planets}
            title={
              experienceMode === 'explore'
                ? (vi ? 'Hiện hoặc ẩn 9 thiên thể Hệ Mặt Trời trên bầu trời' : 'Show or hide the 9 Solar System planets along the sky')
                : (vi ? 'Hiện các hành tinh dọc hoàng đạo tại thời điểm đang chọn' : 'Overlay Solar System planets along the ecliptic at the active epoch')
            }
            disabled={mapStatus.s !== 'ready'}
            onClick={() => setPlanets((p) => !p)}
          >
            <Globe2 aria-hidden /> {label('Planets', 'Hành tinh')}
          </button>
          <span className="dock__sep" role="separator" aria-orientation="vertical" />
          <div className="dock__switch" role="group" aria-label="Sky background survey">
            <button
              type="button"
              className="dock__btn"
              aria-pressed={backgroundMode === 'spherex'}
              title="SPHEREx DR1 all-sky infrared cube (Nov 2025)"
              disabled={mapStatus.s !== 'ready'}
              onClick={() => setBackgroundMode('spherex')}
            >
              <Layers aria-hidden /> <span>SPHEREx DR1</span>
            </button>
            <button
              type="button"
              className="dock__btn"
              aria-pressed={backgroundMode === 'wise'}
              title="WISE / AllWISE infrared sky (2010)"
              disabled={mapStatus.s !== 'ready'}
              onClick={() => setBackgroundMode('wise')}
            >
              <span>WISE</span>
            </button>
            <button
              type="button"
              className="dock__btn"
              aria-pressed={backgroundMode === 'twomass'}
              title="2MASS high-resolution near-infrared color sky atlas (J/H/Ks)"
              disabled={mapStatus.s !== 'ready'}
              onClick={() => setBackgroundMode('twomass')}
            >
              <span>2MASS</span>
            </button>
          </div>
          <span className="dock__sep" role="separator" aria-orientation="vertical" />
          {coords && (
            <button type="button" className="dock__btn" title={vi ? 'Căn giữa tại mục tiêu đã chọn (C)' : 'Center on the selected target (C)'} onClick={center}>
              <LocateFixed aria-hidden /> {label('Center', 'Căn giữa')}
            </button>
          )}
          <button type="button" className="dock__icon dock__wide-only" aria-label={vi ? 'Thu nhỏ bản đồ' : 'Zoom out map'} title={vi ? 'Thu nhỏ bản đồ' : 'Zoom out map'} onClick={() => mapRef.current?.zoomOut()}>
            <Minus aria-hidden />
          </button>
          <span className="dock__zoom dock__wide-only" aria-label={`Map zoom ${mapFovDeg === null ? 'unavailable' : zoomLabel}`} title="Zoom relative to the default sky view">
            {zoomLabel}
          </span>
          <button type="button" className="dock__icon dock__wide-only" aria-label={vi ? 'Phóng to bản đồ' : 'Zoom in map'} title={vi ? 'Phóng to bản đồ' : 'Zoom in map'} onClick={() => mapRef.current?.zoomIn()}>
            <Plus aria-hidden />
          </button>
          <span className="dock__sep" role="separator" aria-orientation="vertical" />
          <button type="button" className="dock__icon" aria-label={vi ? 'Trợ giúp và phím tắt' : 'Help and shortcuts'} title={vi ? 'Trợ giúp (?)' : 'Help (?)'} onClick={() => setHelp(true)}>
            <HelpCircle aria-hidden />
          </button>
          <button type="button" className="dock__icon dock__wide-only" aria-label={isFullscreen ? (vi ? 'Thoát toàn màn hình' : 'Exit full screen') : (vi ? 'Toàn màn hình' : 'Full screen')} aria-pressed={isFullscreen} title={vi ? 'Toàn màn hình' : 'Full screen'} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
        </div>
      </main>

      <CompactFooter>
        <span className="sep">·</span>
        <span>
          {vi ? 'Khảo sát bầu trời' : 'Sky survey'}: {survey.label}
          {survey.cube ? `, ${vi ? 'cảm biến' : 'detector'} D${detector}` : ''}
          {survey.epochLabel ? ` · ${survey.epochLabel}` : ''} ({survey.credit})
          {survey.fromArchive ? ' · sky_archive' : ''}
        </span>
        <span className="sep">·</span>
        <span className={isMock ? 'demo-tag' : undefined}>{dataLabel}</span>
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
    </GuideProvider>
  )
}
