import { ArrowRight, BookOpen } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { config, PATHS } from '../app/config'
import { Artwork } from '../features/artwork/Artwork'
import { CraftGuide } from '../features/artwork/CraftGuide'
import { SpherexCraft } from '../features/artwork/SpherexCraft'
import { StarfieldCanvas } from '../features/artwork/StarfieldCanvas'
import { TEAM, TEAM_NAME } from '../shared/config/team'
import { useLanguage } from '../shared/i18n/language'
import { HOME_COPY } from '../shared/i18n/homeTranslations'
import { StableLabel } from '../shared/i18n/StableLabel'
import { PageShell } from '../shared/layout/Shell'
import { HowItWorksSteps } from './landing/HowItWorksSteps'
import './landing/landing.css'

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
  const { lang } = useLanguage()
  const t = HOME_COPY[lang]
  const otherT = HOME_COPY[lang === 'en' ? 'vi' : 'en']
  const reduce = useReducedMotion()
  const fine = useFinePointer()
  // Touch or reduced motion: a craft rests in each section and scrolls with it, no flight.
  const still = !!reduce || !fine
  const flowRef = useRef<HTMLDivElement>(null)
  const heroAnchor = useRef<HTMLSpanElement>(null)
  const introRef = useRef<HTMLElement>(null)
  const aboutRef = useRef<HTMLElement>(null)
  const ctaRef = useRef<HTMLElement>(null)
  const sections = useMemo(() => [introRef, aboutRef, ctaRef], [])
  // The flying guide takes over the hero craft once it has measured the page.
  const [guideReady, setGuideReady] = useState(false)
  const onGuideReady = useCallback(() => setGuideReady(true), [])
  const guided = !still && guideReady

  // The image service sleeps when idle; wake it while the visitor reads, so the first example loads sooner.
  useEffect(() => {
    if (config.useMock) return
    fetch(`${config.apiBaseUrl}/api/health`, { mode: 'cors', keepalive: true }).catch(() => {})
  }, [])

  return (
    <PageShell header="landing">
      <div className="landing-sky" aria-hidden>
        <StarfieldCanvas className="landing-sky__stars" shootingEverySec={3.2} />
        <span className="landing-sky__glow landing-sky__glow--a" />
        <span className="landing-sky__glow landing-sky__glow--b" />
      </div>
      <div className="landing-flow" ref={flowRef}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 id="hero-title" className="hero__title">
              {t.heroTitle}
            </h1>
            <p className="hero__slogan">{t.heroSlogan}</p>
            <p className="hero__lead">{t.heroLead}</p>
            <div className="hero__actions">
              <Link to={`${PATHS.explorer}?q=wise0855`} className="btn btn-primary btn-lg">
                <StableLabel text={t.watchBrownDwarf} alt={otherT.watchBrownDwarf} /> <ArrowRight aria-hidden />
              </Link>
              <Link to={PATHS.entry} className="btn btn-secondary btn-lg">
                <StableLabel text={t.exploreSky} alt={otherT.exploreSky} /> <ArrowRight aria-hidden />
              </Link>
              <Link to={PATHS.story} className="btn btn-ghost btn-lg">
                <BookOpen aria-hidden /> <StableLabel text={t.readStory} alt={otherT.readStory} />
              </Link>
            </div>
          </div>
          <div className="hero__visual">
            <StarfieldCanvas className="hero__meteors" density={0.25} shootingEverySec={1.4} drift={false} />
            <Artwork variant="hero" className="hero__art" />
            <span ref={heroAnchor} className="craft-anchor" aria-hidden />
            {!guided && (
              <div className="hero__craft">
                <SpherexCraft className="hero__craft-svg" interactive />
              </div>
            )}
          </div>
        </div>
      </section>

      <section ref={introRef} className="intro" aria-labelledby="intro-title">
        <div className="wrap">
          <h2 id="intro-title">{t.howItWorksTitle}</h2>
          <p className="section-lead">{t.howItWorksLead}</p>
          {fine && <p className="steps__hint caption">{t.howItWorksHint}</p>}
          <HowItWorksSteps steps={t.steps} reveal={fine} />
        </div>
      </section>

      <section ref={aboutRef} className="about" aria-labelledby="about-title">
        <div className="wrap about__grid">
          <div className="about__copy">
            <h2 id="about-title">{t.aboutTitle}</h2>
            <p className="about__text">{t.aboutLead(TEAM_NAME)}</p>
            <p className="about__text">{t.aboutDisclaimer}</p>
          </div>
          <ul className="team" aria-label={t.teamMembersLabel}>
            {TEAM.map((m) => (
              <li key={m.name}>
                <span className="team__name">{m.name}</span>
                <span className="team__role">{t.teamRoles[m.name] ?? m.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section ref={ctaRef} className="cta" aria-labelledby="cta-title">
        <Artwork variant="band" className="cta__art" />
        <div className="wrap cta__inner">
          <h2 id="cta-title">{t.ctaTitle}</h2>
          <p>{t.ctaBody}</p>
          <div className="cta__actions">
            <Link to={`${PATHS.explorer}?q=wise0855`} className="btn btn-primary btn-lg">
              <StableLabel text={t.watchBrownDwarf} alt={otherT.watchBrownDwarf} /> <ArrowRight aria-hidden />
            </Link>
            <Link to={PATHS.entry} className="btn btn-secondary btn-lg">
              <StableLabel text={t.exploreSky} alt={otherT.exploreSky} /> <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <CraftGuide containerRef={flowRef} heroRef={heroAnchor} sectionRefs={sections} still={still} onReady={onGuideReady} />
      </div>
    </PageShell>
  )
}
