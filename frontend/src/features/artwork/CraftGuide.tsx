import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { sectionSnaps } from '../../shared/lib/sectionStops'
import { chooseDock, type Rect } from './craftDock'
import { bankAngle, buildStops, poseAt, progressAt, type Anchor, type Stop } from './craftTimeline'
import { SpherexCraft } from './SpherexCraft'

interface GuideProps {
  /** Positioned ancestor that contains the hero and every section (reduced-motion docks live in it). */
  containerRef: RefObject<HTMLElement | null>
  /** Box the craft occupies in the hero. */
  heroRef: RefObject<HTMLElement | null>
  /** Sections the craft visits, in page order. */
  sectionRefs: RefObject<HTMLElement | null>[]
  /** Touch or reduced motion: no flight, a craft rests (and floats) in every section instead. */
  still?: boolean
  onReady?: () => void
}

/** Everything readable or clickable; the craft must not rest on any of it. */
const TEXT_SELECTOR = 'h1, h2, h3, p, li, .btn, .step__num'

/** Section progress follows the scroll through a soft spring: no steps from wheel notches, a gentle settle. */
const GLIDE = { stiffness: 70, damping: 17, mass: 1 }
const BANK = { stiffness: 120, damping: 20, mass: 1 }

function pageRect(r: DOMRect): Rect {
  return { left: r.left + window.scrollX, top: r.top + window.scrollY, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY }
}

/** Measure the hero box and pick a free resting place in each section (page coordinates). */
function measureAnchors(hero: HTMLElement, sections: HTMLElement[]): Anchor[] {
  const h = pageRect(hero.getBoundingClientRect())
  const anchors: Anchor[] = [{ x: h.left, y: h.top, size: h.right - h.left }]
  for (const section of sections) {
    const wrap = section.querySelector<HTMLElement>('.wrap') ?? section
    const contentLeft = pageRect(wrap.getBoundingClientRect()).left + parseFloat(getComputedStyle(wrap).paddingLeft || '0')
    const text = [...section.querySelectorAll<HTMLElement>(TEXT_SELECTOR)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map(pageRect)
    const h2 = section.querySelector('h2')
    const heading = h2 ? pageRect(h2.getBoundingClientRect()) : undefined
    anchors.push(chooseDock({ section: pageRect(section.getBoundingClientRect()), contentLeft, text, heading }))
  }
  return anchors
}

/**
 * The hero's SPHEREx, following the reader down the landing page. It is fixed to the viewport:
 * it rests in the hero, flies a curve to a free spot at the top-left of each section as the page
 * glides there, banks with its speed, and floats while the page is still. The craft is drawn
 * under the section text, so it never hides words. Decorative only.
 */
export function CraftGuide({ containerRef, heroRef, sectionRefs, still = false, onReady }: GuideProps) {
  const { scrollY } = useScroll()
  const stopsRef = useRef<Stop[]>([])
  const [base, setBase] = useState(0)
  const [docks, setDocks] = useState<Anchor[]>([])
  const progress = useMotionValue(0)
  const glide = useSpring(progress, GLIDE)
  const tilt = useMotionValue(0)
  const rotate = useSpring(tilt, BANK)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const beam = useMotionValue(1)

  const apply = useCallback(() => {
    const stops = stopsRef.current
    if (stops.length === 0) return
    const pose = poseAt(glide.get(), window.scrollY, stops, window.innerHeight)
    const b = stops[0].size
    // Scale happens around the centre; shift so the scaled box's top-left lands on the pose.
    x.set(pose.x - (b * (1 - pose.scale)) / 2)
    y.set(pose.y - (b * (1 - pose.scale)) / 2)
    scale.set(pose.scale)
    beam.set(pose.beam)
    tilt.set(bankAngle(glide.getVelocity()))
  }, [glide, tilt, x, y, scale, beam])

  useMotionValueEvent(scrollY, 'change', (v) => {
    progress.set(progressAt(v, stopsRef.current))
    apply()
  })
  useMotionValueEvent(glide, 'change', apply)

  // Passive effect on purpose: refs of the hero and sections are attached after a child's layout
  // effects, and the page reflows as fonts and lazy content load (ResizeObserver re-measures).
  useEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = containerRef.current
        const hero = heroRef.current
        const sections = sectionRefs.map((r) => r.current)
        if (!container || !hero || sections.some((s) => !s)) return
        const anchors = measureAnchors(hero, sections as HTMLElement[])
        if (anchors[0].size <= 0) return
        const c = pageRect(container.getBoundingClientRect())
        setDocks(anchors.slice(1).map((a) => ({ x: a.x - c.left, y: a.y - c.top, size: a.size })))
        if (!still) {
          const first = stopsRef.current.length === 0
          stopsRef.current = buildStops(anchors, [0, ...sectionSnaps(sections as HTMLElement[])])
          setBase(anchors[0].size)
          const p = progressAt(window.scrollY, stopsRef.current)
          progress.set(p)
          // Opening the page mid-way: start at the right section instead of flying in from the hero.
          if (first) glide.jump(p)
          apply()
        }
        onReady?.()
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [containerRef, heroRef, sectionRefs, still, apply, onReady, progress, glide])

  if (still) {
    return (
      <>
        {docks.map((d, i) => (
          <span key={i} className="craft-still" aria-hidden style={{ left: d.x, top: d.y, width: d.size, height: d.size }}>
            <div className="craft-guide__sway">
              <div className="craft-guide__bob">
                <SpherexCraft className="craft-guide__svg" decorative svgOnly />
              </div>
            </div>
          </span>
        ))}
      </>
    )
  }

  return (
    <motion.div
      className="craft-guide"
      aria-hidden
      style={{
        x,
        y,
        scale,
        rotate,
        width: base,
        height: base,
        opacity: base ? 1 : 0,
        ['--craft-beam' as string]: beam,
      }}
    >
      {/* Two idle motions with unrelated periods, so the hover never visibly repeats. */}
      <div className="craft-guide__sway">
        <div className="craft-guide__bob">
          <SpherexCraft className="craft-guide__svg" decorative />
        </div>
      </div>
    </motion.div>
  )
}
