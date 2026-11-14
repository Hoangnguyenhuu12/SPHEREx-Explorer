import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, LocateFixed, X } from 'lucide-react'
import { useMemo, useState, type Dispatch } from 'react'
import type { TargetInfo } from '../../shared/config/targets'
import type { TrailPoint } from '../blink/BlinkCanvas'
import type { PlayerAction, PlayerState } from '../blink/player'
import type { FrameSession } from '../blink/useFrameSession'
import { pixelToSky, skyToPixel } from '../blink/wcs'
import { warningText } from './format'
import { MoreTools } from './MoreTools'
import { ObservationViewer, type ViewerToggles } from './ObservationViewer'
import { BrightnessPanel, DataPanel, DemoTag, MotionPanel, OverviewPanel, useFlagsOverlay } from './SciencePanels'
import { useQuery } from '@tanstack/react-query'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import './popup.css'

const TABS = ['Overview', 'Motion', 'Brightness', 'Data', 'More tools'] as const
type Tab = (typeof TABS)[number]

interface Props {
  target: TargetInfo | null
  title: string
  coords: { ra: number; dec: number }
  detector: number
  onDetector: (d: number) => void
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
  gaiaStatus: { status: 'idle' | 'loading' | 'ready' | 'error'; count?: number }
  shareUrl: string
  embedUrl: string
}

export function TargetPopup(p: Props) {
  const reduce = useReducedMotion()
  const [tab, setTab] = useState<Tab>('Overview')
  const [picked, setPicked] = useState<{ ra: number; dec: number; x: number; y: number } | null>(null)
  const data = p.session.data
  const frame = data?.frames[p.player.index] ?? null
  const flagsOverlay = useFlagsOverlay(frame?.id ?? null, p.toggles.flags)

  const astro = useQuery({
    queryKey: ['astrometry', config.useMock, p.coords.ra, p.coords.dec, p.detector, p.target?.key ?? null],
    queryFn: ({ signal }) => api.astrometry({ ra: p.coords.ra, dec: p.coords.dec, detector: p.detector, targetKey: p.target?.key }, signal),
    staleTime: Infinity,
    enabled: p.toggles.trail,
  })

  const trail: TrailPoint[] = useMemo(() => {
    if (!data || !astro.data) return []
    const out: TrailPoint[] = []
    for (const pt of astro.data.points) {
      const active = Math.abs((frame?.mjd ?? -1) - pt.mjd) < 2
      const pred = pt.predicted_px ?? (pt.predicted ? skyToPixel(data.grid, pt.predicted.ra, pt.predicted.dec) : null)
      const meas = pt.measured_px ?? (pt.measured ? skyToPixel(data.grid, pt.measured.ra, pt.measured.dec) : null)
      if (pred) out.push({ px: [pred[0], pred[1]], kind: 'predicted', active })
      if (meas) out.push({ px: [meas[0], meas[1]], kind: 'measured', active })
    }
    return out
  }, [astro.data, data, frame?.mjd])

  const onPixelClick = (x: number, y: number) => {
    if (!data) return
    const s = pixelToSky(data.grid, x, y)
    setPicked({ ...s, x, y })
    setTab('More tools')
  }

  const common = { target: p.target, coords: p.coords, detector: p.detector, data, activeIndex: p.player.index }

  return (
    <motion.aside
      className="popup"
      aria-label={`${p.title} details`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
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
          <button type="button" className="icon-btn" aria-label="Center map on target" title="Center on map" onClick={p.onCenter}>
            <LocateFixed aria-hidden />
          </button>
          <button type="button" className="icon-btn" aria-label="Close details" title="Close (Esc)" onClick={p.onClose}>
            <X aria-hidden />
          </button>
        </div>
      </header>

      <div className="popup__body">
        <DemoTag mode={data?.mode} />
        <ObservationViewer
          session={p.session}
          player={p.player}
          dispatch={p.dispatch}
          toggles={p.toggles}
          setToggles={p.setToggles}
          targetName={p.title}
          flagsOverlay={flagsOverlay}
          trail={trail}
          picked={picked ? [picked.x, picked.y] : null}
          onPixelClick={onPixelClick}
          detector={p.detector}
          onDetector={p.onDetector}
          fovArcmin={p.fovArcmin}
          onFovChange={p.onFovChange}
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
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(t)
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                  setTab(n)
                  document.getElementById(`tab-${n}`)?.focus()
                }
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
          {tab === 'Overview' && <OverviewPanel {...common} />}
          {tab === 'Motion' && <MotionPanel {...common} showTrail={p.toggles.trail} setShowTrail={(v) => p.setToggles({ trail: v })} />}
          {tab === 'Brightness' && <BrightnessPanel {...common} />}
          {tab === 'Data' && <DataPanel {...common} onDetector={p.onDetector} flags={p.toggles.flags} setFlags={(v) => p.setToggles({ flags: v })} />}
          {tab === 'More tools' && (
            <MoreTools
              target={p.target}
              coords={p.coords}
              data={data}
              activeIndex={p.player.index}
              gaia={p.gaia}
              setGaia={p.setGaia}
              gaiaStatus={p.gaiaStatus}
              shareUrl={p.shareUrl}
              embedUrl={p.embedUrl}
            />
          )}
        </div>
      </div>
    </motion.aside>
  )
}
