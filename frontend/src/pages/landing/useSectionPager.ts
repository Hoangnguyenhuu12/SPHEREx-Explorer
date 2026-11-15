import { useEffect } from 'react'
import { headerOffset } from '../../shared/lib/sectionStops'
import { cubicBezier, glideMs, pickTarget, tidyStops } from './pager'

/** After a glide, wheel input is ignored until it has been quiet this long (trackpad inertia). */
const QUIET_MS = 200
/** Small trackpad deltas add up to this many pixels before a glide starts. */
const WHEEL_THRESHOLD = 12
const ease = cubicBezier(0.45, 0.05, 0.2, 1)

function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight
  return e.deltaY
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Full-page paging on desktop: one wheel notch, arrow, Page or Space key glides to the next or
 * previous stop. Sections taller than the screen scroll natively until their edge shows. The page
 * turns it off for touch screens and reduced motion, which keep normal scrolling.
 *
 * @param getStops returns the scroll positions to stop at (read on every input, so layout changes count)
 */
export function useSectionPager(getStops: () => number[], enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let raf = 0
    let animating = false
    let settling = false
    let quietTimer = 0
    let accTimer = 0
    let acc = 0

    const visible = () => window.innerHeight - headerOffset()
    const stops = () => tidyStops(getStops())

    const settle = () => {
      settling = true
      clearTimeout(quietTimer)
      quietTimer = window.setTimeout(() => {
        settling = false
      }, QUIET_MS)
    }

    const glide = (to: number) => {
      const from = window.scrollY
      const distance = to - from
      if (Math.abs(distance) < 1) return
      const duration = glideMs(Math.abs(distance), visible())
      const start = performance.now()
      let last = from
      animating = true
      const step = (now: number) => {
        // The reader grabbed the scrollbar or scrolled another way: hand control back.
        if (Math.abs(window.scrollY - last) > 3) {
          animating = false
          return
        }
        const k = Math.min(1, (now - start) / duration)
        window.scrollTo(0, from + distance * ease(k))
        last = window.scrollY
        if (k < 1) raf = requestAnimationFrame(step)
        else {
          animating = false
          settle()
        }
      }
      raf = requestAnimationFrame(step)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [aria-modal="true"]')) return
      if (animating || settling) {
        e.preventDefault()
        if (settling) settle()
        return
      }
      const delta = wheelPixels(e)
      const dir = delta > 0 ? 1 : -1
      const to = pickTarget(window.scrollY, dir, stops(), visible())
      if (to === null) return
      e.preventDefault()
      acc = Math.sign(acc) === dir ? acc + delta : delta
      clearTimeout(accTimer)
      accTimer = window.setTimeout(() => {
        acc = 0
      }, QUIET_MS)
      if (Math.abs(acc) < WHEEL_THRESHOLD) return
      acc = 0
      glide(to)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
      const all = stops()
      let to: number | null = null
      if (e.key === 'Home') to = all[0] ?? null
      else if (e.key === 'End') to = all.at(-1) ?? null
      else {
        let dir: 1 | -1 | 0 = 0
        if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1
        else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1
        else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) dir = e.shiftKey ? -1 : 1
        if (!dir) return
        to = pickTarget(window.scrollY, dir, all, visible())
      }
      if (to === null) return
      e.preventDefault()
      if (!animating) glide(to)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(quietTimer)
      clearTimeout(accTimer)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [getStops, enabled])
}
