import { motion, useMotionValue, useMotionValueEvent, useScroll } from 'motion/react'
import { forwardRef, useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { buildTimeline, interpolate, type Timeline } from './craftTimeline'
import { SpherexCraft } from './SpherexCraft'

interface GuideProps {
  /** Positioned ancestor that contains the hero and every section. */
  containerRef: RefObject<HTMLElement | null>
  /** Hero anchor first, then one dock per section. */
  anchorRefs: RefObject<HTMLElement | null>[]
  onReady?: () => void
}

/**
 * The hero's SPHEREx, followed down the landing page: it rests in the hero, flies to the
 * top-left corner of each section as it comes into view, and floats there. Decorative only.
 * Not rendered with reduced motion (sections then show a still craft in their dock).
 */
export function CraftGuide({ containerRef, anchorRefs, onReady }: GuideProps) {
  const { scrollY } = useScroll()
  const timeline = useRef<Timeline | null>(null)
  const [base, setBase] = useState(0)
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

  // Passive effect on purpose: this component renders before its anchors, and React attaches
  // sibling/parent refs only after a child's layout effects have run.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = containerRef.current
        const els = anchorRefs.map((r) => r.current)
        if (!container || els.some((el) => !el)) return
        const c = container.getBoundingClientRect()
        const anchors = els.map((el) => {
          const r = el!.getBoundingClientRect()
          return { x: r.left - c.left, y: r.top - c.top, size: r.width }
        })
        if (anchors[0].size <= 0) return
        timeline.current = buildTimeline(anchors, c.top + window.scrollY, window.innerHeight)
        sizeRef.current = anchors[0].size
        setBase(anchors[0].size)
        apply(window.scrollY)
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
  }, [containerRef, anchorRefs, apply, onReady])

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

/** Top-left resting place in a section. With `still`, it shows a static craft itself. */
export const CraftDock = forwardRef<HTMLSpanElement, { still?: boolean }>(function CraftDock({ still }, ref) {
  return (
    <span ref={ref} className="craft-dock" aria-hidden>
      {still && <SpherexCraft className="craft-dock__svg" decorative />}
    </span>
  )
})
