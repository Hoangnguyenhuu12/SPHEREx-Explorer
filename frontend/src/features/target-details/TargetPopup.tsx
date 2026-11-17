import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, ArrowLeft, LocateFixed, X } from 'lucide-react'
import { useCallback, useMemo, useState, type Dispatch } from 'react'
import type { TargetInfo } from '../../shared/config/targets'
import type { GaiaOverlayMarker, TrailPoint } from '../blink/BlinkCanvas'
import type { PlayerAction, PlayerState } from '../blink/player'
import type { FrameSession } from '../blink/useFrameSession'
import { pixelToSky, skyToPixel } from '../blink/wcs'
import { positionAt } from '../../shared/config/epoch'
import type { GaiaFrameOverlay } from '../../shared/api/types'
import type { ExperienceMode, RulerMeasurement } from '../experience-mode/mode'
import { useGuide } from '../guide/guide-state'
import type { GaiaStatusInfo, SurveyInfo } from '../sky-map/AladinMap'
import { fetchVizierGaia } from '../sky-map/gaia'
import { warningText } from './format'
import { MoreTools } from './MoreTools'
import {
  ObservationViewer,
  type CompareSelectionControl,
  type GaiaOverlayMeta,
  type ViewerToggles,
} from './ObservationViewer'
import { BrightnessPanel, DataPanel, MotionPanel, OverviewPanel, useFlagsOverlay } from './SciencePanels'
import { selectReferenceGaiaOverlays } from './timeline'
import { useQuery } from '@tanstack/react-query'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import './popup.css'

const TABS = ['Overview', 'Motion', 'Brightness', 'Details', 'More tools'] as const
type Tab = (typeof TABS)[number]

interface Props {
  target: TargetInfo | null
  title: string
  coords: { ra: number; dec: number }
  detector: number
  onDetector: (d: number) => void
  timelineControl?: { combined: boolean; setCombined: (value: boolean) => void }
  initialCompare?: boolean
  session: FrameSession
  player: PlayerState
  dispatch: Dispatch<PlayerAction>
  toggles: ViewerToggles
  setToggles: (patch: Partial<ViewerToggles>) => void
  fovArcmin: number | null
  onFovChange: (a: number, byUser: boolean) => void
  onClose: () => void
  onCenter: () => void
  gaia: boolean
  setGaia: (v: boolean) => void
  gaiaStatus: GaiaStatusInfo
  survey: SurveyInfo
  shareUrl: string
  embedUrl: string
  experienceMode?: ExperienceMode
  onExperienceModeChange?: (mode: ExperienceMode) => void
  compareSelection?: CompareSelectionControl
}

export function TargetPopup(p: Props) {
  const reduce = useReducedMotion()
  const guideOn = useGuide()
  const [tab, setTab] = useState<Tab>('Overview')
  const [picked, setPicked] = useState<{ ra: number; dec: number; x: number; y: number } | null>(null)
  const [rulerMeasurement, setRulerMeasurement] = useState<RulerMeasurement | null>(null)
  const [spectrumOpen, setSpectrumOpen] = useState(false)
  const [wideCompare, setWideCompare] = useState(false)
  const experienceMode = p.experienceMode ?? 'explore'
  const data = p.session.data
  const frame = data?.frames[p.player.index] ?? null
  const flagsOverlay = useFlagsOverlay(frame?.id ?? null, p.toggles.flags)

  const astro = useQuery({
    queryKey: ['astrometry', config.useMock, p.coords.ra, p.coords.dec, p.detector, p.target?.key ?? null],
    queryFn: ({ signal }) => api.astrometry({ ra: p.coords.ra, dec: p.coords.dec, detector: p.detector, targetKey: p.target?.key }, signal),
    staleTime: Infinity,
    enabled: p.toggles.trail,
  })

  const combinedSequenceId = p.target ? `${p.target.key}:unwise_w2_to_spherex_d6` : null
  const combinedActive = Boolean(p.timelineControl?.combined && combinedSequenceId)
  const overlaysQ = useQuery({
    queryKey: ['combined-gaia-overlays', config.useMock, combinedSequenceId],
    queryFn: ({ signal }) => api.combinedGaiaOverlays(combinedSequenceId!, signal),
    staleTime: Infinity,
    enabled: combinedActive,
  })

  const spherexGaiaQ = useQuery({
    queryKey: ['sky-archive-gaia', config.useMock, p.target?.key ?? null],
    queryFn: ({ signal }) => api.skyArchiveGaia(p.target!.key, signal),
    staleTime: Infinity,
    enabled: Boolean(!combinedActive && p.target?.key),
  })

  const needVizierFallback =
    !config.useMock &&
    p.toggles.gaiaOverlays &&
    Boolean(data) &&
    ((combinedActive && (overlaysQ.isError || (overlaysQ.isSuccess && overlaysQ.data.overlays.length === 0))) ||
      (!combinedActive && (!p.target?.key || spherexGaiaQ.isError)))

  const vizierGaiaQ = useQuery({
    queryKey: ['vizier-frame-gaia', p.coords.ra.toFixed(4), p.coords.dec.toFixed(4)],
    queryFn: ({ signal }) => fetchVizierGaia(p.coords.ra, p.coords.dec, 0.14, signal),
    staleTime: 10 * 60_000,
    enabled: needVizierFallback,
  })

  const gridW = data?.grid.width ?? 105
  const gridH = data?.grid.height ?? 105

  const vizierOverlays = useMemo<GaiaFrameOverlay[] | null>(() => {
    if (!data || !vizierGaiaQ.data?.length) return null
    const out: GaiaFrameOverlay[] = []
    data.frames.forEach((f, idx) => {
      const frameIndex = idx + 1
      for (const s of vizierGaiaQ.data) {
        const hasPm =
          s.pmRa != null &&
          s.pmDec != null &&
          Number.isFinite(s.pmRa) &&
          Number.isFinite(s.pmDec)
        const prop = positionAt(
          {
            raDeg: s.ra,
            decDeg: s.dec,
            pmRaCosDecMasYr: s.pmRa,
            pmDecMasYr: s.pmDec,
            refEpochJyear: s.refEpochJyear || 2016.0,
          },
          f.mjd,
        )
        const [px, py] = skyToPixel(data.grid, prop.ra, prop.dec)
        const inFrame =
          Number.isFinite(px) &&
          Number.isFinite(py) &&
          px >= 0 &&
          px <= data.grid.width - 1 &&
          py >= 0 &&
          py <= data.grid.height - 1
        if (inFrame) {
          out.push({
            frame_index: frameIndex,
            source_id: String(s.sourceId || `${s.ra.toFixed(4)}:${s.dec.toFixed(4)}`),
            observed_mjd: f.mjd,
            catalog_ra_deg: s.ra,
            catalog_dec_deg: s.dec,
            propagated_ra_deg: prop.ra,
            propagated_dec_deg: prop.dec,
            pixel_x: px,
            pixel_y_png: py,
            in_frame: true,
            has_proper_motion: hasPm,
            motion_status: hasPm ? 'propagated_pm' : 'catalog_static_no_pm',
            g_mag: s.gmag,
          })
        }
      }
    })
    return out
  }, [data, vizierGaiaQ.data])

  const spherexOverlays = useMemo<GaiaFrameOverlay[] | null>(() => {
    if (combinedActive || !data || !spherexGaiaQ.data?.sources) return null
    const out: GaiaFrameOverlay[] = []
    const sources = spherexGaiaQ.data.sources
    data.frames.forEach((f, idx) => {
      const frameIndex = idx + 1
      for (const s of sources) {
        const hasPm =
          s.pmra_mas_yr != null &&
          s.pmdec_mas_yr != null &&
          Number.isFinite(s.pmra_mas_yr) &&
          Number.isFinite(s.pmdec_mas_yr)
        const prop = positionAt(
          {
            raDeg: s.ra,
            decDeg: s.dec,
            pmRaCosDecMasYr: s.pmra_mas_yr,
            pmDecMasYr: s.pmdec_mas_yr,
            refEpochJyear: s.ref_epoch_jyear || 2016.0,
          },
          f.mjd,
        )
        const [px, py] = skyToPixel(data.grid, prop.ra, prop.dec)
        const inFrame =
          Number.isFinite(px) &&
          Number.isFinite(py) &&
          px >= 0 &&
          px <= data.grid.width - 1 &&
          py >= 0 &&
          py <= data.grid.height - 1
        if (inFrame) {
          out.push({
            frame_index: frameIndex,
            source_id: String(s.source_id),
            observed_mjd: f.mjd,
            catalog_ra_deg: s.ra,
            catalog_dec_deg: s.dec,
            propagated_ra_deg: prop.ra,
            propagated_dec_deg: prop.dec,
            pixel_x: px,
            pixel_y_png: py,
            in_frame: true,
            has_proper_motion: hasPm,
            motion_status: hasPm ? 'propagated_pm' : 'catalog_static_no_pm',
            g_mag: s.g_mag,
          })
        }
      }
    })
    return out
  }, [combinedActive, data, spherexGaiaQ.data])

  const overlays = useMemo(() => {
    if (combinedActive && (overlaysQ.data?.overlays.length ?? 0) > 0) return overlaysQ.data!.overlays
    if (!combinedActive && spherexOverlays && spherexOverlays.length > 0) return spherexOverlays
    return vizierOverlays
  }, [combinedActive, overlaysQ.data, spherexOverlays, vizierOverlays])

  const getGaiaMarkers = useCallback(
    (frameIdx: number): GaiaOverlayMarker[] => {
      if (!overlays) return []
      const sel = selectReferenceGaiaOverlays(overlays, frameIdx + 1, gridW, gridH, 6)
      return sel.selected.map((o) => ({
        px: [o.pixel_x, o.pixel_y_png] as [number, number],
        sourceId: o.source_id,
        propagated: o.motion_status === 'propagated_pm',
        gMag: o.g_mag,
        catalogRa: o.catalog_ra_deg,
        catalogDec: o.catalog_dec_deg,
      }))
    },
    [overlays, gridW, gridH],
  )

  const { gaiaMarkers, gaiaOverlayMeta } = useMemo<{
    gaiaMarkers: GaiaOverlayMarker[]
    gaiaOverlayMeta: GaiaOverlayMeta | null
  }>(() => {
    const gaiaActive = combinedActive || Boolean(p.target?.key) || Boolean(data)
    if (!gaiaActive) return { gaiaMarkers: [], gaiaOverlayMeta: null }
    const primaryPending = combinedActive ? overlaysQ.isPending : (Boolean(p.target?.key) && spherexGaiaQ.isPending)
    const isPending = (primaryPending && !needVizierFallback) || (needVizierFallback && vizierGaiaQ.isPending)
    const isError = !overlays && !isPending && (needVizierFallback ? vizierGaiaQ.isError : (combinedActive ? overlaysQ.isError : spherexGaiaQ.isError))
    if (isPending) {
      return {
        gaiaMarkers: [],
        gaiaOverlayMeta: {
          model: 'angular_proper_motion_only',
          annualParallaxIncluded: false,
          propagatedCount: 0,
          staticCount: 0,
          selectedCount: 0,
          totalInFrame: 0,
          loading: true,
        },
      }
    }
    if (isError || !overlays) {
      return {
        gaiaMarkers: [],
        gaiaOverlayMeta: {
          model: 'angular_proper_motion_only',
          annualParallaxIncluded: false,
          propagatedCount: 0,
          staticCount: 0,
          selectedCount: 0,
          totalInFrame: 0,
          error: true,
        },
      }
    }
    const sel = selectReferenceGaiaOverlays(overlays, p.player.index + 1, gridW, gridH, 6)
    const markers: GaiaOverlayMarker[] = sel.selected.map((o) => ({
      px: [o.pixel_x, o.pixel_y_png],
      sourceId: o.source_id,
      propagated: o.motion_status === 'propagated_pm',
      gMag: o.g_mag,
      catalogRa: o.catalog_ra_deg,
      catalogDec: o.catalog_dec_deg,
    }))
    return {
      gaiaMarkers: markers,
      gaiaOverlayMeta: {
        model: (combinedActive ? overlaysQ.data?.gaia_propagation_model : null) || 'angular_proper_motion_only',
        annualParallaxIncluded: Boolean(combinedActive && overlaysQ.data?.annual_parallax_included),
        propagatedCount: sel.propagatedCount,
        staticCount: sel.staticCount,
        selectedCount: markers.length,
        totalInFrame: sel.inFrameCount,
      },
    }
  }, [
    combinedActive,
    p.target?.key,
    data,
    overlaysQ.isPending,
    overlaysQ.isError,
    overlaysQ.data,
    spherexGaiaQ.isPending,
    spherexGaiaQ.isError,
    needVizierFallback,
    vizierGaiaQ.isPending,
    vizierGaiaQ.isError,
    overlays,
    p.player.index,
    gridW,
    gridH,
  ])

  const trail: TrailPoint[] = useMemo(() => {
    if (!data || !astro.data) return []
    const out: TrailPoint[] = []
    for (const pt of astro.data.points) {
      const active = Math.abs((frame?.mjd ?? -1) - pt.mjd) < 2
      const meas = pt.measured_px ?? (pt.measured ? skyToPixel(data.grid, pt.measured.ra, pt.measured.dec) : null)
      if (meas) out.push({ px: [meas[0], meas[1]], kind: 'measured', active })
    }
    return out
  }, [astro.data, data, frame?.mjd])

  const onPixelClick = (x: number, y: number) => {
    if (!data) return
    const s = pixelToSky(data.grid, x, y)
    setPicked({ ...s, x, y })
  }

  const common = { target: p.target, coords: p.coords, detector: p.detector, data, activeIndex: p.player.index }

  return (
    <motion.aside
      className={wideCompare ? 'popup popup--wide' : 'popup'}
      aria-label={`${p.title} details`}
      initial={reduce || guideOn ? { opacity: 0 } : { opacity: 0, x: -24 }}
      animate={reduce || guideOn ? { opacity: 1 } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <header className="popup__head">
        <div>
          <h2 className="popup__title">{p.title}</h2>
          <p className="popup__kind">
            {p.target?.kind ?? 'Custom position'}
            {p.target?.aliases.length ? <span className="caption"> · {p.target.aliases.join(' · ')}</span> : null}
          </p>
        </div>
        <div className="popup__actions">
          {p.onExperienceModeChange && (
            <div className="segmented" role="group" aria-label="Experience mode">
              <button
                type="button"
                aria-pressed={experienceMode === 'explore'}
                title="Beginner & student mode: plain-language guides and Spot-the-Star feedback"
                onClick={() => p.onExperienceModeChange?.('explore')}
              >
                Explore
              </button>
              <button
                type="button"
                aria-pressed={experienceMode === 'science'}
                title="Research mode: astrometry ruler, contrast stretch, CSV/FITS/Python export"
                onClick={() => p.onExperienceModeChange?.('science')}
              >
                Science
              </button>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn--compact" onClick={p.onClose}>
            <ArrowLeft aria-hidden />
            <span>Back to map</span>
          </button>
          <button type="button" className="icon-btn" aria-label="Center map on target" title="Center on map" onClick={p.onCenter}>
            <LocateFixed aria-hidden />
          </button>
          <button type="button" className="icon-btn" aria-label="Close details" title="Close (Esc)" onClick={p.onClose}>
            <X aria-hidden />
          </button>
        </div>
      </header>

      <div className="popup__body">
        <ObservationViewer
          key={`${p.target?.key ?? `${p.coords.ra}:${p.coords.dec}`}-${p.initialCompare ? 'cmp' : 'tl'}`}
          timelineControl={p.timelineControl}
          session={p.session}
          player={p.player}
          dispatch={p.dispatch}
          toggles={p.toggles}
          setToggles={p.setToggles}
          target={p.target}
          targetName={p.title}
          experienceMode={experienceMode}
          flagsOverlay={flagsOverlay}
          trail={trail}
          gaiaMarkers={gaiaMarkers}
          getGaiaMarkers={getGaiaMarkers}
          gaiaOverlayMeta={gaiaOverlayMeta}
          picked={picked ? [picked.x, picked.y] : null}
          onPixelClick={onPixelClick}
          onClearPick={() => setPicked(null)}
          onRulerChange={setRulerMeasurement}
          onShowSpectrum={() => {
            const enabled = !spectrumOpen
            setSpectrumOpen(enabled)
            if (enabled) {
              setTab('Details')
              requestAnimationFrame(() => document.getElementById('viewer-spectrum-details')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
            }
          }}
          spectrumEnabled={spectrumOpen}
          detector={p.detector}
          onDetectorChange={p.onDetector}
          fovArcmin={p.fovArcmin}
          onFovChange={p.onFovChange}
          initialCompare={p.initialCompare}
          compareSelection={p.compareSelection}
          onWideChange={setWideCompare}
        />

        {data && data.warnings.length > 0 && (
          <ul className="warnings" aria-label="Data notes">
            {data.warnings.map((w) => (
              <li key={w} className="notice notice--warn">
                <AlertTriangle aria-hidden />
                <span>{warningText(w)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="tabs" role="tablist" aria-label="Target details">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={(e) => {
                setTab(t)
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
              onKeyDown={(e) => {
                const i = TABS.indexOf(t)
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                  setTab(n)
                  const nextTab = document.getElementById(`tab-${n}`)
                  nextTab?.focus()
                  nextTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
          {tab === 'Overview' && <OverviewPanel {...common} experienceMode={experienceMode} />}
          {tab === 'Motion' && <MotionPanel {...common} showTrail={p.toggles.trail} setShowTrail={(v) => p.setToggles({ trail: v })} />}
          {tab === 'Brightness' && <BrightnessPanel {...common} />}
          {tab === 'Details' && (
            <DataPanel
              {...common}
              onDetector={p.onDetector}
              flags={p.toggles.flags}
              setFlags={(v) => p.setToggles({ flags: v })}
              picked={picked}
              combined={combinedActive}
              spectrumOpen={spectrumOpen}
              onSpectrumOpenChange={setSpectrumOpen}
            />
          )}
          {tab === 'More tools' && (
            <MoreTools
              target={p.target}
              coords={p.coords}
              detector={p.detector}
              picked={picked}
              rulerMeasurement={rulerMeasurement}
              data={data}
              originals={p.session.originals}
              activeIndex={p.player.index}
              gaia={p.gaia}
              setGaia={p.setGaia}
              gaiaStatus={p.gaiaStatus}
              survey={p.survey}
              shareUrl={p.shareUrl}
              embedUrl={p.embedUrl}
            />
          )}
        </div>
      </div>
    </motion.aside>
  )
}
