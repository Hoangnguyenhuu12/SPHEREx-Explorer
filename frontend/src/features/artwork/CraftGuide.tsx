import { motion, useMotionValue, useMotionValueEvent, useScroll } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { chooseDock, type Rect } from './craftDock'
import { buildTimeline, interpolate, type Anchor, type Timeline } from './craftTimeline'
import { SpherexCraft } from './SpherexCraft'

interface GuideProps {
  /** Positioned ancestor that contains the hero and every section. */
  containerRef: RefObject<HTMLElement | null>
  /** Box the craft occupies in the hero. */
  heroRef: RefObject<HTMLElement | null>
  /** Sections the craft visits, in page order. */
  sectionRefs: RefObject<HTMLElement | null>[]
  /** Reduced motion: no flight, a still craft rests in every section instead. */
  still?: boolean
  onReady?: () => void
}

/** Everything readable or clickable; the craft must not rest on any of it. */
const TEXT_SELECTOR = 'h1, h2, h3, p, li, .btn, .sky-preview, .step__num'

function rel(r: DOMRect, c: DOMRect): Rect {
  return { left: r.left - c.left, top: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top }
}

/** Measure the hero box and pick a free resting place in each section (container coordinates). */
function measureAnchors(container: HTMLElement, hero: HTMLElement, sections: HTMLElement[]): Anchor[] {
  const c = container.getBoundingClientRect()
  const h = rel(hero.getBoundingClientRect(), c)
  const anchors: Anchor[] = [{ x: h.left, y: h.top, size: h.right - h.left }]
  for (const section of sections) {
    const wrap = section.querySelector<HTMLElement>('.wrap') ?? section
    const w = wrap.getBoundingClientRect()
    const contentLeft = w.left - c.left + parseFloat(getComputedStyle(wrap).paddingLeft || '0')
    const text = [...section.querySelectorAll<HTMLElement>(TEXT_SELECTOR)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => rel(r, c))
    const h2 = section.querySelector('h2')
    const heading = h2 ? rel(h2.getBoundingClientRect(), c) : undefined
    anchors.push(chooseDock({ section: rel(section.getBoundingClientRect(), c), contentLeft, text, heading }))
  }
  return anchors
}

/**
 * The hero's SPHEREx, followed down the landing page: it rests in the hero, flies to a free spot
 * at the top-left of each section as it comes into view, and floats there. The resting place is
 * measured on the current screen, and the craft is drawn under the section text, so it never
 * hides words. Decorative only.
 */
export function CraftGuide({ containerRef, heroRef, sectionRefs, still = false, onReady }: GuideProps) {
  const { scrollY } = useScroll()
  const timeline = useRef<Timeline | null>(null)
  const [base, setBase] = useState(0)
  const [docks, setDocks] = useState<Anchor[]>([])
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const rotate = useMotionValue(0)
  const beam = useMotionValue(1)
  const sizeRef = useRef(0)

  const apply = useCallback(
    (v: number) => {
      const t = timeline.current
      if (!t) return
      const s = interpolate(v, t.input, t.scale)
      const b = sizeRef.current
      // Scale happens around the centre; shift so the box's top-left lands on the anchor.
      x.set(interpolate(v, t.input, t.x) - (b * (1 - s)) / 2)
      y.set(interpolate(v, t.input, t.y) - (b * (1 - s)) / 2)
      scale.set(s)
      rotate.set(interpolate(v, t.input, t.rotate))
      beam.set(interpolate(v, t.input, t.beam))
    },
    [x, y, scale, rotate, beam],
  )

  useMotionValueEvent(scrollY, 'change', apply)

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
        const anchors = measureAnchors(container, hero, sections as HTMLElement[])
        if (anchors[0].size <= 0) return
        setDocks(anchors.slice(1))
        if (!still) {
          timeline.current = buildTimeline(anchors, container.getBoundingClientRect().top + window.scrollY, window.innerHeight)
          sizeRef.current = anchors[0].size
          setBase(anchors[0].size)
          apply(window.scrollY)
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
  }, [containerRef, heroRef, sectionRefs, still, apply, onReady])

  if (still) {
    return (
      <>
        {docks.map((d, i) => (
          <span key={i} className="craft-still" aria-hidden style={{ left: d.x, top: d.y, width: d.size, height: d.size }}>
            <SpherexCraft className="craft-guide__svg" decorative />
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
      <div className="craft-guide__float">
        <SpherexCraft className="craft-guide__svg" decorative />
      </div>
    </motion.div>
  )
}
