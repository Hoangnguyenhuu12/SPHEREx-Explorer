/**
 * Where the landing-page SPHEREx rests in a section, chosen from the space actually free on the
 * current screen so it never sits on text (pure geometry, container coordinates).
 */
import type { Anchor } from './craftTimeline'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DockInput {
  /** The <section> box. */
  section: Rect
  /** Left edge of the section's text column (inside the gutter). */
  contentLeft: number
  /** Boxes of everything readable or clickable in the section. */
  text: Rect[]
  /** The section heading; a craft in the left margin lines up with it. */
  heading?: Rect
}

export const DOCK_MAX = 132
export const DOCK_MIN = 44
const GAP = 12

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function box(x: number, y: number, size: number): Rect {
  return { left: x, top: y, right: x + size, bottom: y + size }
}

function free(r: Rect, text: Rect[]): boolean {
  return !text.some((t) => overlaps(r, t))
}

/**
 * 1. Left margin beside the first heading when the margin is wide enough for a clear craft (>= 112px).
 * 2. Open sky above the first text (`room`), sizing up to DOCK_MAX so scrolled sections keep a legible craft.
 * 3. Narrower left margin (>= DOCK_MIN) or top padding shrink down to DOCK_MIN on constrained screens.
 */
export function chooseDock({ section, contentLeft, text, heading }: DockInput): Anchor {
  const first = text.reduce<Rect | null>((a, t) => (!a || t.top < a.top ? t : a), null)
  const firstTop = first?.top ?? section.top + DOCK_MAX + 2 * GAP

  const margin = contentLeft - section.left - 2 * GAP
  if (margin >= 112) {
    const size = Math.min(DOCK_MAX, margin)
    const x = contentLeft - GAP - size
    const y = Math.max(section.top + GAP, (heading?.top ?? firstTop) - size * 0.25)
    if (free(box(x, y, size), text)) return { x, y, size }
  }

  const room = firstTop - section.top - 2 * GAP
  for (let size = Math.min(DOCK_MAX, room); size >= DOCK_MIN; size -= 4) {
    const x = Math.max(section.left + 8, contentLeft - size * 0.12)
    const y = section.top + GAP
    if (free(box(x, y, size), text)) return { x, y, size }
  }

  if (margin >= DOCK_MIN) {
    const size = Math.min(DOCK_MAX, margin)
    const x = contentLeft - GAP - size
    const y = Math.max(section.top + GAP, (heading?.top ?? firstTop) - size * 0.25)
    if (free(box(x, y, size), text)) return { x, y, size }
  }

  return { x: Math.max(section.left + 4, contentLeft - DOCK_MIN * 0.12), y: section.top + GAP, size: DOCK_MIN }
}
