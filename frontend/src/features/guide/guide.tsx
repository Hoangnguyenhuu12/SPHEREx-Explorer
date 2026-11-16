import { GraduationCap, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import './guide.css'

export function GuideToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="guide-toggle"
      data-tour="tour-toggle"
      aria-pressed={on}
      title={`${on ? 'Close' : 'Start'} the tutorial (T)`}
      onClick={() => onChange(!on)}
    >
      <GraduationCap aria-hidden />
      <span>Tutorial</span>
      <span className="guide-toggle__state">{on ? 'On' : 'Off'}</span>
    </button>
  )
}

export interface TourStep {
  /** `data-tour` values to point at; the first one on screen wins. Empty: a centred card. */
  anchors: string[]
  title: string
  body: ReactNode
  /** Shown once the visitor has clicked the highlighted control. */
  done?: ReactNode
  /** The step lives in the target panel: open a target first if none is shown. */
  needsTarget?: boolean
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

type Side = 'top' | 'bottom' | 'left' | 'right' | 'none'

const PAD = 6
const GAP = 16
const EDGE = 12

function findAnchor(anchors: string[]): HTMLElement | null {
  for (const a of anchors) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${a}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

const toRect = (r: DOMRect, pad = 0): Rect => ({ top: r.top - pad, left: r.left - pad, width: r.width + 2 * pad, height: r.height + 2 * pad })

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
}

/**
 * Learn-by-doing tutorial. The page stays fully usable: a ring marks the control for the current
 * step, the screen is dimmed except the whole details panel (so results stay visible), and the card
 * sits outside that panel, pointing at the control. Clicking the control marks the step done;
 * choosing a target on the first step moves on by itself.
 */
export function GuideTour({
  steps,
  hasTarget,
  ensureTarget,
  onClose,
}: {
  steps: TourStep[]
  hasTarget: boolean
  ensureTarget: () => void
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const uid = useId()
  const [index, setIndex] = useState(0)
  const [ring, setRing] = useState<Rect | null>(null)
  const [lit, setLit] = useState<Rect | null>(null)
  const [doneFor, setDoneFor] = useState(-1)
  const [cardPos, setCardPos] = useState<{ top: number; left: number; arrow: CSSProperties; side: Side } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const scrolledFor = useRef(-1)
  const anchorRef = useRef<HTMLElement | null>(null)
  const hadTarget = useRef(hasTarget)
  const step = steps[Math.min(index, steps.length - 1)]
  const last = index >= steps.length - 1
  const done = doneFor === index

  const go = (d: number) => setIndex((i) => Math.min(Math.max(0, i + d), steps.length - 1))

  // Choosing a target on the first step is the action itself: move on once the panel opens.
  useEffect(() => {
    if (hasTarget && !hadTarget.current && index === 0) setIndex(1)
    hadTarget.current = hasTarget
  }, [hasTarget, index])

  // Pressing Next on a panel step with nothing open: open a target for the visitor.
  useEffect(() => {
    if (step.needsTarget && !hasTarget) ensureTarget()
  }, [step, hasTarget, ensureTarget])

  // Follow the anchor every frame: panels animate, scroll and resize.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = step.anchors.length ? findAnchor(step.anchors) : null
      anchorRef.current = el
      if (el && scrolledFor.current !== index) {
        scrolledFor.current = index
        // Scroll only the details panel: scrollIntoView would also shift the overflow-hidden map stage.
        const box = el.closest<HTMLElement>('.popup__body')
        if (box) {
          const r = el.getBoundingClientRect()
          const b = box.getBoundingClientRect()
          if (r.top < b.top || r.bottom > b.bottom) {
            box.scrollTo({ top: box.scrollTop + r.top - b.top - Math.max(0, (b.height - r.height) / 2), behavior: reduce ? 'auto' : 'smooth' })
          }
        }
      }
      const nextRing = el ? toRect(el.getBoundingClientRect(), PAD) : null
      const panel = el?.closest<HTMLElement>('.popup')
      const nextLit = panel ? toRect(panel.getBoundingClientRect()) : nextRing
      setRing((prev) => (sameRect(prev, nextRing) ? prev : nextRing))
      setLit((prev) => (sameRect(prev, nextLit) ? prev : nextLit))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step, index, reduce])

  // A click on the highlighted control completes the step.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = anchorRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) setDoneFor(index)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [index])

  // Place the card outside the lit area, next to the control, flipping and clamping to stay on screen.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const set = (top: number, left: number, side: Side, arrow: CSSProperties = {}) =>
      setCardPos((prev) =>
        prev && prev.top === top && prev.left === left && prev.side === side && JSON.stringify(prev.arrow) === JSON.stringify(arrow)
          ? prev
          : { top, left, arrow, side },
      )
    if (!ring || !lit) {
      set(Math.max(EDGE, (vh - ch) / 2), Math.max(EDGE, (vw - cw) / 2), 'none')
      return
    }
    const cx = ring.left + ring.width / 2
    const cy = ring.top + ring.height / 2
    const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - cw - EDGE)
    const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - ch - EDGE)
    const arrowY = (top: number) => ({ top: Math.min(Math.max(18, cy - top), ch - 18) })
    const arrowX = (left: number) => ({ left: Math.min(Math.max(18, cx - left), cw - 18) })
    if (lit.left + lit.width + GAP + cw <= vw - EDGE) {
      const top = clampY(cy - ch / 2)
      set(top, lit.left + lit.width + GAP, 'right', arrowY(top))
    } else if (lit.left - GAP - cw >= EDGE) {
      const top = clampY(cy - ch / 2)
      set(top, lit.left - GAP - cw, 'left', arrowY(top))
    } else if (lit.top + lit.height + GAP + ch <= vh - EDGE) {
      const left = clampX(cx - cw / 2)
      set(lit.top + lit.height + GAP, left, 'bottom', arrowX(left))
    } else if (lit.top - GAP - ch >= EDGE) {
      const left = clampX(cx - cw / 2)
      set(lit.top - GAP - ch, left, 'top', arrowX(left))
    } else {
      // Phones: the panel fills the screen. Dock the card at the bottom so the target name and image
      // stay visible; move it to the top only when the control itself sits under the card.
      const bottomTop = vh - ch - EDGE
      const top = ring.top + ring.height > bottomTop - GAP ? EDGE : bottomTop
      set(top, clampX((vw - cw) / 2), 'none')
    }
  }, [ring, lit, index, done])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className={`tour${reduce ? ' tour--still' : ''}`}>
      {lit ? <div className="tour__lit" style={lit} aria-hidden /> : <div className="tour__dim" aria-hidden />}
      {ring && <div className={`tour__ring${done ? ' is-done' : ''}`} style={ring} aria-hidden />}
      <div
        ref={cardRef}
        className={`tour__card tour__card--${cardPos?.side ?? 'none'}`}
        style={cardPos ? { top: cardPos.top, left: cardPos.left } : { visibility: 'hidden' }}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-b`}
      >
        {cardPos && cardPos.side !== 'none' && <span className="tour__arrow" style={cardPos.arrow} aria-hidden />}
        <div className="tour__head">
          <span className="tour__count num">
            Step {index + 1} of {steps.length}
          </span>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Close tutorial" onClick={onClose}>
            <X aria-hidden />
          </button>
        </div>
        <h2 id={`${uid}-t`} className="tour__title">
          {step.title}
        </h2>
        <div id={`${uid}-b`} className="tour__body" aria-live="polite">
          {step.body}
          {done && step.done && <p className="tour__done">✓ {step.done}</p>}
          {step.anchors.length > 0 && !ring && <p className="caption">Loading this part of the page…</p>}
        </div>
        <div className="tour__actions">
          <button type="button" className="btn btn-ghost btn--compact" onClick={onClose}>
            Skip
          </button>
          <span className="tour__spacer" />
          <button type="button" className="btn btn-secondary btn--compact" onClick={() => go(-1)} disabled={index === 0}>
            Back
          </button>
          <button
            ref={nextRef}
            type="button"
            className={`btn btn-primary btn--compact${done ? ' tour__next--ready' : ''}`}
            onClick={() => (last ? onClose() : go(1))}
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
