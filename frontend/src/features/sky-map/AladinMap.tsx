import A from 'aladin-lite'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { TARGETS, type TargetKey } from '../../shared/config/targets'
import './sky-map.css'

/**
 * Project-level wrapper around Aladin Lite. Method names here (focusTarget, setGridVisible, …)
 * are our own adapter API, not Aladin's.
 */

export interface SkyMapHandle {
  focus: (ra: number, dec: number, fovDeg?: number) => void
  setGridVisible: (visible: boolean) => void
  /** Illustrative diurnal motion: the view drifts in RA as if Earth were turning (sped up). */
  setSkyMotion: (on: boolean, degPerSecond?: number) => void
  setGaiaVisible: (visible: boolean, around?: { ra: number; dec: number }) => void
  zoomIn: () => void
  zoomOut: () => void
  getFovDeg: () => number | null
}

interface Props {
  initial: { ra: number; dec: number; fovDeg: number }
  selectedKey: TargetKey | null
  onTargetSelected: (key: TargetKey) => void
  onStatus?: (status: 'loading' | 'ready' | 'error', message?: string) => void
  onGaiaStatus?: (status: 'loading' | 'ready' | 'error', count?: number) => void
  onSourceSelected?: (s: { ra: number; dec: number; sourceId: string | null; gmag: number | null }) => void
}

export const SURVEY = { id: 'CDS/P/DSS2/color', label: 'DSS2 color', credit: 'Digitized Sky Survey, HiPS by CDS' }

/** Official HiPS mirrors of CDS/P/DSS2/color, tried in order (CDS primary first). */
const SURVEY_MIRRORS = [
  'https://alasky.cds.unistra.fr/DSS/DSSColor',
  'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color',
  'https://skies.esac.esa.int/DSSColor',
  'https://alaskybis.cds.unistra.fr/DSS/DSSColor',
]

export const GAIA_RADIUS_DEG = 0.1

/** VizieR mirrors for Gaia DR3 (I/355/gaiadr3). */
const VIZIER_MIRRORS = ['https://vizier.cds.unistra.fr', 'https://vizier.cfa.harvard.edu', 'https://vizier.iucaa.in']

function gaiaUrl(base: string, ra: number, dec: number, radiusDeg: number): string {
  const q = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    '-c': `${ra} ${dec}`,
    '-c.rd': String(radiusDeg),
    '-out.max': '1500',
    '-out': 'RA_ICRS,DE_ICRS,Source,Gmag',
    Gmag: '<18',
    '-sort': 'Gmag',
  })
  return `${base}/viz-bin/votable?${q.toString()}`
}

async function pickVizier(ra: number, dec: number): Promise<string | null> {
  for (const base of VIZIER_MIRRORS) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(gaiaUrl(base, ra, dec, 0.01), { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return base
    } catch {
      // next mirror
    }
  }
  return null
}

async function pickSurveyUrl(): Promise<string> {
  for (const base of SURVEY_MIRRORS) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(`${base}/properties`, { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return base
    } catch {
      // try the next mirror
    }
  }
  return SURVEY_MIRRORS[0]
}

// oxlint-disable-next-line typescript/no-explicit-any
type AladinInstance = any

export const AladinMap = forwardRef<SkyMapHandle, Props>(function AladinMap(
  { initial, selectedKey, onTargetSelected, onStatus, onGaiaStatus, onSourceSelected },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const aladinRef = useRef<AladinInstance>(null)
  const targetCatRef = useRef<AladinInstance>(null)
  const selectedCatRef = useRef<AladinInstance>(null)
  const gaiaCatRef = useRef<AladinInstance>(null)
  const gaiaTokenRef = useRef<object | null>(null)
  const motionRef = useRef<number | null>(null)
  const onSelectRef = useRef(onTargetSelected)
  const [ready, setReady] = useState(false)
  onSelectRef.current = onTargetSelected
  const onSourceRef = useRef(onSourceSelected)
  onSourceRef.current = onSourceSelected

  useEffect(() => {
    let disposed = false
    const host = hostRef.current
    if (!host) return
    onStatus?.('loading')
    Promise.all([A.init, pickSurveyUrl()])
      .then(([, surveyUrl]) => {
        if (disposed || !host) return
        const aladin = A.aladin(host, {
          survey: surveyUrl,
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
          showContextMenu: false,
          showStatusBar: false,
          showCooGrid: false,
          showCooLocation: false,
          showFov: false,
        })
        aladinRef.current = aladin

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
        cat.addSources(TARGETS.map((t) => A.source(t.raDeg, t.decDeg, { name: t.shortName, key: t.key })))
        aladin.addCatalog(cat)
        targetCatRef.current = cat

        const sel = A.catalog({ name: 'Selected', shape: 'square', sourceSize: 34, color: '#E948AC' })
        aladin.addCatalog(sel)
        selectedCatRef.current = sel

        aladin.on('objectClicked', (obj: AladinInstance) => {
          const key = obj?.data?.key as TargetKey | undefined
          if (key) {
            onSelectRef.current(key)
            return
          }
          if (obj && typeof obj.ra === 'number' && obj.catalog?.name === 'Gaia DR3') {
            const d = obj.data ?? {}
            const g = Number(d.Gmag)
            onSourceRef.current?.({ ra: obj.ra, dec: obj.dec, sourceId: d.Source != null ? String(d.Source) : null, gmag: Number.isFinite(g) ? g : null })
          }
        })
        setReady(true)
        onStatus?.('ready')
      })
      .catch((err: unknown) => {
        if (!disposed) onStatus?.('error', err instanceof Error ? err.message : 'The sky map could not start.')
      })
    return () => {
      disposed = true
      if (motionRef.current !== null) cancelAnimationFrame(motionRef.current)
      aladinRef.current = null
      if (host) host.innerHTML = ''
    }
    // Initial view only; later moves go through the handle.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  useEffect(() => {
    const sel = selectedCatRef.current
    if (!ready || !sel) return
    sel.removeAll()
    const t = TARGETS.find((x) => x.key === selectedKey)
    if (t) sel.addSources([A.source(t.raDeg, t.decDeg, { key: t.key })])
  }, [ready, selectedKey])

  useImperativeHandle(
    ref,
    () => ({
      focus(ra, dec, fovDeg) {
        const a = aladinRef.current
        if (!a) return
        if (fovDeg) a.setFoV(fovDeg)
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
        const step = (now: number) => {
          const a = aladinRef.current
          if (!a) return
          const dt = Math.min(0.1, (now - last) / 1000)
          last = now
          // Aladin returns a typed array [ra, dec].
          const rd = a.getRaDec?.() as ArrayLike<number> | undefined
          if (rd && rd.length >= 2 && Number.isFinite(rd[0])) {
            // Stars rise in the east and set in the west: the view's RA increases with time.
            a.gotoRaDec((((rd[0] + degPerSecond * dt) % 360) + 360) % 360, rd[1])
          }
          motionRef.current = requestAnimationFrame(step)
        }
        motionRef.current = requestAnimationFrame(step)
      },
      setGridVisible(visible) {
        aladinRef.current?.setCooGrid({ enabled: visible, color: '#C9C2B7', opacity: 0.55, labelSize: 13 })
      },
      setGaiaVisible(visible, around) {
        const a = aladinRef.current
        if (!a) return
        if (gaiaCatRef.current) {
          a.removeLayer?.(gaiaCatRef.current)
          gaiaCatRef.current.hide?.()
          gaiaCatRef.current = null
        }
        gaiaTokenRef.current = null
        if (!visible || !around) return
        onGaiaStatus?.('loading')
        const token = {}
        gaiaTokenRef.current = token
        void pickVizier(around.ra, around.dec).then((base) => {
          if (gaiaTokenRef.current !== token || !aladinRef.current) return
          if (!base) {
            onGaiaStatus?.('error')
            return
          }
          const cat = A.catalogFromURL(
            gaiaUrl(base, around.ra, around.dec, GAIA_RADIUS_DEG),
            { name: 'Gaia DR3', shape: 'cross', sourceSize: 9, color: '#2F9DD0' },
            (c: AladinInstance) => onGaiaStatus?.('ready', c?.getSources?.().length),
            () => onGaiaStatus?.('error'),
            false,
          )
          gaiaCatRef.current = cat
          aladinRef.current.addCatalog(cat)
        })
      },
      zoomIn() {
        aladinRef.current?.increaseZoom()
      },
      zoomOut() {
        aladinRef.current?.decreaseZoom()
      },
      getFovDeg() {
        const f = aladinRef.current?.getFov?.()
        return Array.isArray(f) ? f[1] : null
      },
    }),
    [onGaiaStatus],
  )

  return (
    <div className="sky-map-wrap" role="application" aria-label="Sky map (Aladin Lite). Drag to pan, scroll to zoom.">
      <div ref={hostRef} className="sky-map" />
    </div>
  )
})
