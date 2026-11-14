/**
 * Scroll timeline for the landing-page SPHEREx guide: the craft rests in the hero, then flies to a
 * dock at the top-left of each following section and floats there. Pure maths, no DOM.
 */

export interface Anchor {
  /** Top-left of the anchor box, relative to the guide container (px). */
  x: number
  y: number
  /** Side length of the (square) anchor box (px). */
  size: number
}

export interface Timeline {
  /** Scroll positions (px, ascending). */
  input: number[]
  x: number[]
  y: number[]
  scale: number[]
  rotate: number[]
  /** Opacity of the light drawn entering the telescope; only shown in the hero. */
  beam: number[]
}

/** Departure: the next dock is this far up from the viewport bottom. */
const DEPART_AT = 0.95
/** Arrival: the next dock has reached this fraction of the viewport from the top. */
const ARRIVE_AT = 0.3
/** Sideways swing in the middle of a flight, as a fraction of the distance flown. */
const ARC = 0.18
const FLIGHT_TILT_DEG = 10

/**
 * @param anchors hero anchor first, then one dock per section (container coordinates)
 * @param containerTop page Y of the container's top edge
 * @param viewport viewport height
 */
export function buildTimeline(anchors: Anchor[], containerTop: number, viewport: number): Timeline {
  const base = anchors[0].size || 1
  const t: Timeline = { input: [], x: [], y: [], scale: [], rotate: [], beam: [] }
  const push = (s: number, a: { x: number; y: number; size: number }, rotate: number, beam: number) => {
    const last = t.input.at(-1)
    t.input.push(last === undefined ? s : Math.max(s, last + 1))
    t.x.push(a.x)
    t.y.push(a.y)
    t.scale.push(a.size / base)
    t.rotate.push(rotate)
    t.beam.push(beam)
  }

  push(0, anchors[0], 0, 1)
  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1]
    const to = anchors[i]
    const dockPage = containerTop + to.y
    const depart = Math.max(0, dockPage - viewport * DEPART_AT)
    const arrive = dockPage - viewport * ARRIVE_AT
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    const mid = {
      x: (from.x + to.x) / 2 + ARC * dist * 0.35,
      y: (from.y + to.y) / 2,
      size: (from.size + to.size) / 2,
    }
    push(depart, from, 0, i === 1 ? 1 : 0)
    push((depart + arrive) / 2, mid, FLIGHT_TILT_DEG, 0)
    push(arrive, to, 0, 0)
  }
  return t
}

/** Piecewise-linear interpolation, clamped at both ends. */
export function interpolate(v: number, input: number[], output: number[]): number {
  if (input.length === 0) return 0
  if (v <= input[0]) return output[0]
  const n = input.length - 1
  if (v >= input[n]) return output[n]
  let i = 1
  while (input[i] < v) i++
  const t = (v - input[i - 1]) / (input[i] - input[i - 1])
  return output[i - 1] + (output[i] - output[i - 1]) * t
}
