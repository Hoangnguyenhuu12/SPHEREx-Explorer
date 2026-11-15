import { ArrowRight, BookOpen } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { PATHS } from '../app/config'
import { Artwork } from '../features/artwork/Artwork'
import { CraftGuide } from '../features/artwork/CraftGuide'
import { SpherexCraft } from '../features/artwork/SpherexCraft'
import { StarfieldCanvas } from '../features/artwork/StarfieldCanvas'
import { TEAM, TEAM_NAME } from '../shared/config/team'
import { PageShell } from '../shared/layout/Shell'
import { maxScroll, sectionSnaps } from '../shared/lib/sectionStops'
import { useSectionPager } from './landing/useSectionPager'
import './landing/landing.css'

const STEPS = [
  { title: 'Choose a target', body: 'Pick one of five featured stars, search a name, or type any RA and Dec.' },
  { title: 'Pick an infrared channel', body: 'SPHEREx has six detectors, from 0.75 to 5 micrometres. Colder objects show up at longer wavelengths.' },
  { title: 'Step through the dates', body: 'SPHEREx scans the whole sky about every six months. Play the observations like a short film.' },
  { title: 'Spot what changed', body: 'Compare two dates side by side or flip A/B. A bright-and-dark pair in Difference is a clue to check against the original images.' },
]

const FINE_POINTER = '(hover: hover) and (pointer: fine)'

/** Mouse or trackpad: the page pages by section and the craft flies along. Touch keeps native scrolling. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(FINE_POINTER)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(FINE_POINTER).matches,
    () => true,
  )
}

export default function LandingPage() {
  const reduce = useReducedMotion()
  const fine = useFinePointer()
  // Touch or reduced motion: a craft rests in each section and scrolls with it, no flight.
  const still = !!reduce || !fine
  const flowRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const heroAnchor = useRef<HTMLSpanElement>(null)
  const introRef = useRef<HTMLElement>(null)
  const aboutRef = useRef<HTMLElement>(null)
  const ctaRef = useRef<HTMLElement>(null)
  const sections = useMemo(() => [introRef, aboutRef, ctaRef], [])
  // The flying guide takes over the hero craft once it has measured the page.
  const [guideReady, setGuideReady] = useState(false)
  const onGuideReady = useCallback(() => setGuideReady(true), [])
  const guided = !still && guideReady
  // Every section, then the page bottom (footer), is a stop for the section pager.
  const pagerStops = useCallback(() => {
    const all = [heroRef, ...sections].map((r) => r.current).filter((el): el is HTMLElement => !!el)
    return [...sectionSnaps(all), maxScroll()]
  }, [sections])
  useSectionPager(pagerStops, !still)

  return (
    <PageShell header="landing">
      <div className="landing-sky" aria-hidden>
        <StarfieldCanvas className="landing-sky__stars" shootingEverySec={3.2} />
        <span className="landing-sky__glow landing-sky__glow--a" />
        <span className="landing-sky__glow landing-sky__glow--b" />
      </div>
      <div className="landing-flow" ref={flowRef}>
      <section ref={heroRef} className="hero" aria-labelledby="hero-title">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">NASA SPHEREx · NASA Space Apps 2026</p>
            <h1 id="hero-title" className="hero__title">
              The eyes of the galaxy
            </h1>
            <p className="hero__slogan">Every six months, SPHEREx photographs the whole sky. See what changed.</p>
            <p className="hero__lead">
              Pick a star, press play, and watch NASA’s infrared survey catch it drifting across the sky or pulsing in
              brightness. No data files, no code.
            </p>
            <div className="hero__actions">
              <Link to={`${PATHS.explorer}?q=wise0855&compare=1`} className="btn btn-primary btn-lg">
                Watch a brown dwarf move <ArrowRight aria-hidden />
              </Link>
              <Link to={PATHS.entry} className="btn btn-secondary btn-lg">
                Explore the sky <ArrowRight aria-hidden />
              </Link>
              <Link to={PATHS.story} className="btn btn-ghost btn-lg">
                <BookOpen aria-hidden /> Read the story
              </Link>
            </div>
          </div>
          <div className="hero__visual">
            <StarfieldCanvas className="hero__meteors" density={0.25} shootingEverySec={1.4} drift={false} />
            <Artwork variant="hero" className="hero__art" />
            <span ref={heroAnchor} className="craft-anchor" aria-hidden />
            <div className="hero__craft" style={guided ? { visibility: 'hidden' } : undefined}>
              <SpherexCraft className="hero__craft-svg" />
            </div>
          </div>
        </div>
      </section>

      <section ref={introRef} className="intro" aria-labelledby="intro-title">
        <div className="wrap">
          <h2 id="intro-title">How it works</h2>
          <p className="section-lead">Four steps from a point in the sky to a change you can see.</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step__num" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="step__title">{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section ref={aboutRef} className="about" aria-labelledby="about-title">
        <div className="wrap about__grid">
          <div>
            <h2 id="about-title">About us</h2>
            <p className="about__text">
              We are team {TEAM_NAME}, a team of six building an independent tool for the NASA Space Apps 2026 SPHEREx Sky Viewer
              challenge. Astronomy archives are public but hard to read: FITS files, coordinate systems and query languages stand
              between curious people and the sky. We want anyone to be able to open a page and watch a star move.
            </p>
            <p className="about__text">
              SPHEREx Explorer is not an official NASA product. It uses public data released by NASA through the Infrared Science
              Archive.
            </p>
          </div>
          <ul className="team" aria-label="Team members">
            {TEAM.map((m) => (
              <li key={m.name}>
                <span className="team__name">{m.name}</span>
                <span className="team__role">{m.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section ref={ctaRef} className="cta" aria-labelledby="cta-title">
        <Artwork variant="band" className="cta__art" />
        <div className="wrap cta__inner">
          <h2 id="cta-title">See the sky move</h2>
          <p>Jump straight into the WISE 0855 brown dwarf comparison, or start from Earth and roam the whole infrared sky.</p>
          <div className="cta__actions">
            <Link to={`${PATHS.explorer}?q=wise0855&compare=1`} className="btn btn-primary btn-lg">
              Watch a brown dwarf move <ArrowRight aria-hidden />
            </Link>
            <Link to={PATHS.entry} className="btn btn-secondary btn-lg">
              Explore the sky <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <CraftGuide containerRef={flowRef} heroRef={heroAnchor} sectionRefs={sections} still={still} onReady={onGuideReady} />
      </div>
    </PageShell>
  )
}
