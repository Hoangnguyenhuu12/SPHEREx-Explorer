import type { CSSProperties } from 'react'

/**
 * Decorative background for the Story page: a few shooting stars that cross the screen now and then.
 * It sits behind all content (fixed layer at z-index 0, content at 1; see story.css), ignores the pointer, is hidden from screen readers,
 * and is switched off for people who ask for reduced motion.
 *
 * Values are fixed (not random) so the layout is the same on every render and in tests.
 * top/left: start point in % of the viewport; delay/duration in seconds; length in px.
 */
const METEORS = [
  { top: 8, left: 70, delay: 0, duration: 9, length: 180 },
  { top: 22, left: 95, delay: 2.5, duration: 11, length: 140 },
  { top: 4, left: 40, delay: 5, duration: 10, length: 220 },
  { top: 35, left: 85, delay: 7.5, duration: 12, length: 160 },
  { top: 15, left: 55, delay: 10, duration: 9.5, length: 200 },
  { top: 50, left: 100, delay: 13, duration: 13, length: 150 },
  { top: 2, left: 88, delay: 16, duration: 10.5, length: 240 },
] as const

/** Faint fixed stars that twinkle slowly. */
const TWINKLES = [
  [12, 18], [28, 7], [44, 31], [63, 12], [81, 26], [92, 9], [7, 52], [22, 68],
  [38, 84], [57, 61], [73, 77], [88, 58], [16, 91], [49, 46], [67, 94], [95, 82],
] as const

export function ShootingStars() {
  return (
    <div className="sky-fx" aria-hidden="true">
      {TWINKLES.map(([left, top], i) => (
        <span
          key={`t${i}`}
          className="sky-fx__twinkle"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${(i % 5) * 0.9}s` } as CSSProperties}
        />
      ))}
      {METEORS.map((m, i) => (
        <span
          key={`m${i}`}
          className="sky-fx__meteor"
          style={
            {
              top: `${m.top}%`,
              left: `${m.left}%`,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
              '--meteor-length': `${m.length}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
