import { useReducedMotion } from 'motion/react'
import { ArrowRight, Globe2, Pause, Play, Sun } from 'lucide-react'
import { lazy, Suspense, useCallback, useRef, useState, type RefObject } from 'react'
import { PATHS } from '../app/config'
import { useRouteTransition } from '../features/route-transition/TransitionHost'
import { webglAvailable } from '../features/earth-scene/webgl'
import { StarfieldCanvas } from '../features/artwork/StarfieldCanvas'
import type { BodyName, SceneView } from '../features/earth-scene/EarthScene'
import { NavDrawer, SiteFooter, SiteHeader } from '../shared/layout/Shell'
import { useLanguage } from '../shared/i18n/language'
import { ORBIT_COPY } from './where/translations'
import './where/where.css'

const EarthScene = lazy(() => import('../features/earth-scene/EarthScene'))

export default function WhereAreYouPage() {
  const { lang } = useLanguage()
  const t = ORBIT_COPY[lang]
  const alt = ORBIT_COPY[lang === 'en' ? 'vi' : 'en']
  const reduce = useReducedMotion()
  const [userPaused, setUserPaused] = useState(false)
  const [hover, setHover] = useState(false)
  const [earthReady, setEarthReady] = useState(false)
  // Open on the whole Solar System first; Earth and the SPHEREx orbit are one click away.
  const [view, setView] = useState<SceneView>('solar')
  const onReady = useCallback(() => setEarthReady(true), [])
  const sunRef = useRef<HTMLSpanElement>(null)
  const earthRef = useRef<HTMLSpanElement>(null)
  const spherexRef = useRef<HTMLSpanElement>(null)
  const mercuryRef = useRef<HTMLSpanElement>(null)
  const venusRef = useRef<HTMLSpanElement>(null)
  const marsRef = useRef<HTMLSpanElement>(null)
  const jupiterRef = useRef<HTMLSpanElement>(null)
  const saturnRef = useRef<HTMLSpanElement>(null)
  const uranusRef = useRef<HTMLSpanElement>(null)
  const neptuneRef = useRef<HTMLSpanElement>(null)
  const plutoRef = useRef<HTMLSpanElement>(null)
  const labels: Partial<Record<BodyName, RefObject<HTMLSpanElement | null>>> = {
    sun: sunRef,
    earth: earthRef,
    spherex: spherexRef,
    mercury: mercuryRef,
    venus: venusRef,
    mars: marsRef,
    jupiter: jupiterRef,
    saturn: saturnRef,
    uranus: uranusRef,
    neptune: neptuneRef,
    pluto: plutoRef,
  }
  const [gl] = useState(webglAvailable)
  const { phase, launch } = useRouteTransition()
  const launching = phase === 'launching'
  const paused = userPaused || !!reduce
  const solar = view === 'solar'

  const explore = useCallback(() => launch(PATHS.explorer), [launch])
  const toggleView = useCallback(() => setView((v) => (v === 'solar' ? 'earth' : 'solar')), [])
  // In the solar view, clicking Earth brings it back to the centre; in the Earth view it explores.
  const onEarthClick = useCallback(() => (solar ? setView('earth') : explore()), [solar, explore])

  return (
    <>
      <a href="#main" className="skip-link">
        {t.skip}
      </a>
      <SiteHeader />
      <NavDrawer />
      <main id="main" className={`where${launching && !reduce ? ' is-launching' : ''}${solar ? ' is-solar' : ''}`}>
        <StarfieldCanvas className="where__stars" density={1.1} shootingEverySec={2.2} drift={false} />
        <div className="where__scene">
          <h1 className="where__title"><StableOrbitText text={t.title} alt={alt.title} /></h1>

          <div className={`where__earth${hover ? ' is-hover' : ''}`}>
            {gl ? (
              <>
                {!earthReady && !solar && <img className="where__static" src="/textures/earth-static.png" alt="" width={392} height={392} />}
                {!earthReady && solar && (
                  <p className="where__loading" role="status">
                    {t.loading}
                  </p>
                )}
                <Suspense fallback={null}>
                  <EarthScene
                    view={view}
                    instant={!!reduce}
                    paused={paused}
                    launching={launching && !reduce}
                    onEarthClick={onEarthClick}
                    onSunClick={toggleView}
                    onHover={setHover}
                    onReady={onReady}
                    labels={labels}
                    ariaLabel={solar ? t.solarAria : t.earthAria}
                  />
                </Suspense>
                <span ref={sunRef} className="where__label where__label--center" aria-hidden>
                  {t.sun}
                </span>
                <span ref={earthRef} className="where__label where__label--center" aria-hidden>
                  {t.earth}
                </span>
                <span ref={spherexRef} className="where__label where__label--craft" aria-hidden translate="no">
                  SPHEREx
                </span>
                <span ref={mercuryRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.mercury}
                </span>
                <span ref={venusRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.venus}
                </span>
                <span ref={marsRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.mars}
                </span>
                <span ref={jupiterRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.jupiter}
                </span>
                <span ref={saturnRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.saturn}
                </span>
                <span ref={uranusRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.uranus}
                </span>
                <span ref={neptuneRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.neptune}
                </span>
                <span ref={plutoRef} className="where__label where__label--center where__label--planet" aria-hidden>
                  {t.pluto}
                </span>
              </>
            ) : (
              <button type="button" className="where__static-btn" onClick={explore} aria-label={t.openMap}>
                <img className="where__static" src="/textures/earth-static.png" alt={t.earthAlt} width={392} height={392} />
              </button>
            )}
          </div>

          <p className="where__hint" aria-hidden>
            <StableOrbitText text={solar ? t.solarHint : t.earthHint} alt={solar ? alt.solarHint : alt.earthHint} />
            <svg viewBox="0 0 120 40" width="96" height="32" className="where__arrow">
              <path d="M2 30 C 40 34, 80 26, 112 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M104 8 L 114 11 L 108 20" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </p>

          <div className="where__actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={explore}>
              <StableOrbitText text={t.open} alt={alt.open} /> <ArrowRight aria-hidden />
            </button>
            {gl && (
              <button type="button" className="btn btn-secondary" onClick={toggleView} aria-pressed={solar}>
                {solar ? <Globe2 aria-hidden /> : <Sun aria-hidden />}
                <StableOrbitText text={solar ? t.zoom : t.solarView} alt={solar ? alt.zoom : alt.solarView} />
              </button>
            )}
            {gl && (
              <button type="button" className="btn btn-secondary" onClick={() => setUserPaused((p) => !p)} aria-pressed={paused} disabled={!!reduce}>
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                <StableOrbitText text={reduce ? t.motionOff : paused ? t.resume : t.pause} alt={reduce ? alt.motionOff : paused ? alt.resume : alt.pause} />
              </button>
            )}
          </div>

          {gl && (
            <p className="where__fact" aria-live="polite">
              <span className="where__fact-dot" aria-hidden />
              <StableOrbitText text={solar ? t.solarFact : t.earthFact} alt={solar ? alt.solarFact : alt.earthFact} />
            </p>
          )}
          <p className="caption where__caption">
            <StableOrbitText text={t.caption + (!gl ? t.no3d : '')} alt={alt.caption + (!gl ? alt.no3d : '')} />
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

function StableOrbitText({ text, alt }: { text: string; alt: string }) {
  return <span className="where__stable-text"><span>{text}</span><span aria-hidden="true">{alt}</span></span>
}
