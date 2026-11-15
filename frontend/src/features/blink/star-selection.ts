import { pixelCentreToScreen, type Viewport } from './viewport'

/** Hit-test visible catalog markers in CSS pixels, independent of zoom and DPR. */
export function nearestStar<T extends { px: [number, number] }>(
  stars: readonly T[], view: Viewport, x: number, y: number, radius = 12,
): T | null {
  let nearest: T | null = null
  let distance = radius
  for (const star of stars) {
    const screen = pixelCentreToScreen(view, star.px)
    const d = Math.hypot(screen.x - x, screen.y - y)
    if (Number.isFinite(d) && d <= distance) {
      nearest = star
      distance = d
    }
  }
  return nearest
}
