/**
 * Section paging for the landing page: one wheel notch or key press glides to the next section.
 * Pure maths, no DOM.
 */

const EPS = 2

/** Sort stops and drop ones closer than 4 px to the previous stop. */
export function tidyStops(stops: number[]): number[] {
  const out: number[] = []
  for (const s of [...stops].sort((a, b) => a - b)) {
    if (out.length === 0 || s - out[out.length - 1] > 4) out.push(s)
  }
  return out
}

/**
 * Where to glide from `scroll` in direction `dir`, or null to let the browser scroll natively:
 * at either end of the page, or inside a section taller than the visible area (the reader scrolls
 * through it normally and the glide resumes once its edge is on screen).
 *
 * @param stops ascending scroll positions (section tops, then the page bottom)
 * @param visible viewport height below the sticky header
 */
export function pickTarget(scroll: number, dir: 1 | -1, stops: number[], visible: number): number | null {
  if (dir > 0) {
    const next = stops.find((s) => s > scroll + EPS)
    if (next === undefined) return null
    return next - scroll > visible + EPS ? null : next
  }
  let prev: number | undefined
  for (const s of stops) if (s < scroll - EPS) prev = s
  if (prev === undefined) return null
  return scroll - prev > visible + EPS ? null : prev
}

/** Glide duration: about 0.9 s for a full screen, shorter for small hops such as the footer. */
export function glideMs(distance: number, visible: number): number {
  const ratio = visible > 0 ? distance / visible : 1
  return Math.min(950, Math.max(450, 380 + 520 * ratio))
}

/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved by bisection on x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const coord = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2
      if (coord(t, x1, x2) < x) lo = t
      else hi = t
    }
    return coord(t, y1, y2)
  }
}
