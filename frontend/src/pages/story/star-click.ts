/** How long the star streaks across the screen before the page transition starts. */
export const STREAK_MS = 450

/**
 * True for an ordinary left click. Ctrl/Cmd/Shift/Alt clicks, middle clicks and links that open
 * in a new tab keep the browser's own behaviour.
 */
export function isPlainLeftClick(e: {
  button: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  currentTarget: { getAttribute(name: string): string | null }
}): boolean {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false
  const target = e.currentTarget.getAttribute('target')
  return !target || target === '_self'
}
