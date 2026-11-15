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
  /** The step lives in the target panel: open a target first if none is shown. */
  needsTarget?: boolean
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6
const GAP = 14
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

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
}

/**
 * Spotlight tutorial: dims the page, cuts a hole around the control of the current step, and points
 * a card at it. The highlighted control stays clickable; everything else is blocked until the tour ends.
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
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number; arrow: CSSProperties; side: 'top' | 'bottom' | 'left' | 'right' | 'none' } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const scrolledFor = useRef(-1)
  const step = steps[Math.min(index, steps.length - 1)]
  const last = index >= steps.length - 1

  // Steps inside the target panel need a target on screen.
  useEffect(() => {
    if (step.needsTarget && !hasTarget) ensureTarget()
  }, [step, hasTarget, ensureTarget])

  // Follow the anchor every frame: panels animate, scroll and resize.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = step.anchors.length ? findAnchor(step.anchors) : null
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
      const r = el?.getBoundingClientRect()
      const next = r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD } : null
      setRect((prev) => (sameRect(prev, next) ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step, index, reduce])

  // Place the card next to the hole, flipping and clamping to stay on screen.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    if (!rect) {
      setCardPos({ top: Math.max(EDGE, (vh - ch) / 2), left: Math.max(EDGE, (vw - cw) / 2), arrow: {}, side: 'none' })
      return
    }
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - cw - EDGE)
    const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - ch - EDGE)
    let side: 'top' | 'bottom' | 'left' | 'right'
    let top: number
    let left: number
    if (rect.top + rect.height + GAP + ch <= vh - EDGE) {
      side = 'bottom'
      top = rect.top + rect.height + GAP
      left = clampX(cx - cw / 2)
    } else if (rect.top - GAP - ch >= EDGE) {
      side = 'top'
      top = rect.top - GAP - ch
      left = clampX(cx - cw / 2)
    } else if (rect.left + rect.width + GAP + cw <= vw - EDGE) {
      side = 'right'
      left = rect.left + rect.width + GAP
      top = clampY(cy - ch / 2)
    } else if (rect.left - GAP - cw >= EDGE) {
      side = 'left'
      left = rect.left - GAP - cw
      top = clampY(cy - ch / 2)
    } else {
      // No room around a large anchor (e.g. the image on a phone): sit inside its lower edge.
      side = 'top'
      top = clampY(Math.min(rect.top + rect.height, vh) - ch - GAP)
      left = clampX(cx - cw / 2)
    }
    const arrow: CSSProperties =
      side === 'top' || side === 'bottom'
        ? { left: Math.min(Math.max(18, cx - left), cw - 18) }
        : { top: Math.min(Math.max(18, cy - top), ch - 18) }
    setCardPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.side === side && JSON.stringify(prev.arrow) === JSON.stringify(arrow)
        ? prev
        : { top, left, arrow, side },
    )
  }, [rect, index])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [index])

  const go = (d: number) => setIndex((i) => Math.min(Math.max(0, i + d), steps.length - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight' && !last) {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const blockers: CSSProperties[] = rect
    ? [
        { top: 0, left: 0, width: vw, height: Math.max(0, rect.top) },
        { top: rect.top + rect.height, left: 0, width: vw, height: Math.max(0, vh - rect.top - rect.height) },
        { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
        { top: rect.top, left: rect.left + rect.width, width: Math.max(0, vw - rect.left - rect.width), height: rect.height },
      ]
    : [{ inset: 0 }]

  return createPortal(
    <div className={`tour${reduce ? ' tour--still' : ''}`}>
      {rect ? <div className="tour__spot" style={rect} aria-hidden /> : <div className="tour__dim" aria-hidden />}
      {blockers.map((b, i) => (
        <div key={i} className="tour__block" style={b} aria-hidden />
      ))}
      <div
        ref={cardRef}
        className={`tour__card tour__card--${cardPos?.side ?? 'none'}`}
        style={cardPos ? { top: cardPos.top, left: cardPos.left } : { visibility: 'hidden' }}
        role="dialog"
        aria-modal="true"
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
        <div id={`${uid}-b`} className="tour__body">
          {step.body}
          {step.anchors.length > 0 && !rect && <p className="caption">Loading this part of the page…</p>}
        </div>
        <div className="tour__actions">
          <button type="button" className="btn btn-ghost btn--compact" onClick={onClose}>
            Skip
          </button>
          <span className="tour__spacer" />
          <button type="button" className="btn btn-secondary btn--compact" onClick={() => go(-1)} disabled={index === 0}>
            Back
          </button>
          <button ref={nextRef} type="button" className="btn btn-primary btn--compact" onClick={() => (last ? onClose() : go(1))}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
