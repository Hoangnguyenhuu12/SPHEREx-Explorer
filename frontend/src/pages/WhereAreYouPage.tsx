import { useReducedMotion } from 'motion/react'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { PATHS } from '../app/config'
import { useRouteTransition } from '../features/route-transition/TransitionHost'
import { webglAvailable } from '../features/earth-scene/webgl'
import { StarfieldCanvas } from '../features/artwork/StarfieldCanvas'
import { NavDrawer, SiteFooter, SiteHeader } from '../shared/layout/Shell'
import './where/where.css'

const EarthScene = lazy(() => import('../features/earth-scene/EarthScene'))

export default function WhereAreYouPage() {
  const reduce = useReducedMotion()
  const [userPaused, setUserPaused] = useState(false)
  const [hover, setHover] = useState(false)
  const [earthReady, setEarthReady] = useState(false)
  const onReady = useCallback(() => setEarthReady(true), [])
  const sunRef = useRef<HTMLSpanElement>(null)
  const mercuryRef = useRef<HTMLSpanElement>(null)
  const venusRef = useRef<HTMLSpanElement>(null)
  const moonRef = useRef<HTMLSpanElement>(null)
  const marsRef = useRef<HTMLSpanElement>(null)
  const labels = { sun: sunRef, mercury: mercuryRef, venus: venusRef, moon: moonRef, mars: marsRef }
  const [gl] = useState(webglAvailable)
  const { phase, launch } = useRouteTransition()
  const launching = phase === 'launching'
  const paused = userPaused || !!reduce

  const explore = useCallback(() => launch(PATHS.explorer), [launch])

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <NavDrawer />
      <main id="main" className={`where${launching && !reduce ? ' is-launching' : ''}`}>
        <StarfieldCanvas className="where__stars" density={1.1} shootingEverySec={2.2} drift={false} />
        <div className="where__scene">
          <h1 className="where__title">Where are you</h1>

          <div className={`where__earth${hover ? ' is-hover' : ''}`}>
            {gl ? (
              <>
                {!earthReady && <img className="where__static" src="/textures/earth-static.png" alt="" width={392} height={392} />}
                <Suspense fallback={null}>
                  <EarthScene paused={paused} launching={launching && !reduce} onEarthClick={explore} onHover={setHover} onReady={onReady} labels={labels} />
                </Suspense>
                {(
                  [
                    [sunRef, 'Sun'],
                    [mercuryRef, 'Mercury'],
                    [venusRef, 'Venus'],
                    [moonRef, 'Moon'],
                    [marsRef, 'Mars'],
                  ] as const
                ).map(([ref, name]) => (
                  <span key={name} ref={ref} className="where__label" aria-hidden>
                    {name}
                  </span>
                ))}
              </>
            ) : (
              <button type="button" className="where__static-btn" onClick={explore} aria-label="Explore the sky from Earth">
                <img className="where__static" src="/textures/earth-static.png" alt="Earth, still image" width={392} height={392} />
              </button>
            )}
          </div>

          <p className="where__hint" aria-hidden>
            <span>Click to explore</span>
            <svg viewBox="0 0 120 40" width="96" height="32" className="where__arrow">
              <path d="M2 30 C 40 34, 80 26, 112 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M104 8 L 114 11 L 108 20" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </p>

          <div className="where__actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={explore}>
              Explore the sky <ArrowRight aria-hidden />
            </button>
            {gl && (
              <button type="button" className="btn btn-secondary" onClick={() => setUserPaused((p) => !p)} aria-pressed={paused} disabled={!!reduce}>
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                {reduce ? 'Rotation off (reduced motion)' : paused ? 'Resume rotation' : 'Pause rotation'}
              </button>
            )}
          </div>

          <p className="caption where__caption">
            Illustrative scene — sizes and distances not to scale.{!gl && ' 3D view unavailable on this device; showing a still image.'}
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
