/**
 * Scroll positions where page sections start, shared by the landing page's section pager and
 * its flying SPHEREx guide (DOM reads only, no state).
 */

/** Height of the sticky header that covers the top of the viewport (0 if it does not stick). */
export function headerOffset(): number {
  const header = document.querySelector<HTMLElement>('.site-header')
  if (!header) return 0
  const pos = getComputedStyle(header).position
  return pos === 'sticky' || pos === 'fixed' ? header.getBoundingClientRect().height : 0
}

export function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

/** Scroll position that puts each section's top right under the sticky header. */
export function sectionSnaps(sections: HTMLElement[]): number[] {
  const offset = headerOffset()
  const max = maxScroll()
  return sections.map((s) => Math.min(max, Math.max(0, Math.round(s.getBoundingClientRect().top + window.scrollY - offset))))
}
