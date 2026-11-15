/**
 * Flight path of the landing-page SPHEREx guide. The craft is fixed to the viewport: when the
 * page rests on a section, it floats at that section's dock; between sections it flies a curve
 * from one dock to the next, driven by a (spring-smoothed) section progress. Pure maths, no DOM.
 */

export interface Anchor {
  /** Top-left of the anchor box (px). Page coordinates when measured, viewport in a Stop. */
  x: number
  y: number
  /** Side length of the (square) anchor box (px). */
  size: number
}

/** Where the craft sits on screen while the page rests at `scroll`. */
export interface Stop extends Anchor {
  scroll: number
}

export interface Pose {
  /** Viewport position of the craft box's top-left at full (hero) size, before scaling. */
  x: number
  y: number
  scale: number
  /** Opacity of the light drawn entering the telescope; only shown in the hero. */
  beam: number
}

/** Sideways swing in the middle of a flight, as a fraction of the distance flown. */
const ARC = 0.22
/** Extra dip mid-flight (fraction of viewport height), so short hops still read as flights. */
const SWOOP = 0.05
/** The craft grows a little mid-flight, as if passing closer to the reader. */
const LIFT = 0.14
/** The light fades out over the first part of the first flight. */
const BEAM_FADE = 0.35
const MAX_BANK_DEG = 12

/**
 * @param anchors hero anchor first, then one dock per section (page coordinates)
 * @param snaps scroll position at which each anchor's section rests under the header
 */
export function buildStops(anchors: Anchor[], snaps: number[]): Stop[] {
  return anchors.map((a, i) => ({ scroll: snaps[i], x: a.x, y: a.y - snaps[i], size: a.size }))
}

/** Fractional section index at a scroll position: 0 in the hero, 1 at the first section, and so on. */
export function progressAt(scroll: number, stops: Stop[]): number {
  const n = stops.length
  if (n === 0 || scroll <= stops[0].scroll) return 0
  for (let i = 1; i < n; i++) {
    if (scroll < stops[i].scroll) {
      const span = stops[i].scroll - stops[i - 1].scroll
      return i - 1 + (span > 0 ? (scroll - stops[i - 1].scroll) / span : 1)
    }
  }
  return n - 1
}

/**
 * Craft pose for a section progress `p` (may overshoot slightly; it is clamped).
 * Past the last section (the footer) the craft rides up with the page.
 */
export function poseAt(p: number, scroll: number, stops: Stop[], viewport: number): Pose {
  const n = stops.length
  if (n === 0) return { x: 0, y: 0, scale: 1, beam: 1 }
  const base = stops[0].size || 1
  const last = stops[n - 1]
  const ride = Math.max(0, scroll - last.scroll)
  const beam = Math.min(1, Math.max(0, 1 - p / BEAM_FADE))
  if (n === 1) return { x: last.x, y: last.y - ride, scale: last.size / base, beam }

  const k = Math.min(n - 2, Math.max(0, Math.floor(p)))
  const f = Math.min(1, Math.max(0, p - k))
  const a = stops[k]
  const b = stops[k + 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const bend = Math.sin(Math.PI * f)
  // Perpendicular to the flight, turned towards the left margin (away from the text column).
  let nx = dist ? dy / dist : 0
  let ny = dist ? -dx / dist : 0
  if (nx > 0) {
    nx = -nx
    ny = -ny
  }
  const size = (a.size + (b.size - a.size) * f) * (1 + LIFT * bend)
  return {
    x: a.x + dx * f + nx * ARC * dist * bend,
    y: a.y + dy * f + ny * ARC * dist * bend + SWOOP * viewport * bend - ride,
    scale: size / base,
    beam,
  }
}

/** Bank angle (deg) from how fast the section progress moves (sections per second). */
export function bankAngle(velocity: number): number {
  return Math.max(-MAX_BANK_DEG, Math.min(MAX_BANK_DEG, velocity * 7))
}
