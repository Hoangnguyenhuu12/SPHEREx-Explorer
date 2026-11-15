import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { PATHS } from '../../app/config'
import { useRouteTransition } from '../../features/route-transition/TransitionHost'
import { isPlainLeftClick, STREAK_MS } from './star-click'

interface Streak {
  x: number
  y: number
}

/**
 * The Story page's call to action: a shooting star that leads to "SPHEREx Orbit".
 * It is a real link, so new-tab clicks and no-JS still work. A plain click fires a star from the
 * button towards the top-right of the screen, then opens the page with the shared route transition.
 */
export function ShootingStarLink({
  size = 'lg',
  label = 'SPHEREx Orbit',
  hint,
}: {
  size?: 'lg' | 'compact'
  label?: string
  hint?: string
}) {
  const reduce = useReducedMotion()
  const { launch } = useRouteTransition()
  const [streak, setStreak] = useState<Streak | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainLeftClick(e)) return
      e.preventDefault()
      if (streak) return
      if (reduce) {
        launch(PATHS.entry)
        return
      }
      const star = e.currentTarget.querySelector('.star-link__star')
      const r = (star ?? e.currentTarget).getBoundingClientRect()
      setStreak({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      timer.current = window.setTimeout(() => launch(PATHS.entry), STREAK_MS)
    },
    [launch, reduce, streak],
  )

  const compact = size === 'compact'
  return (
    <>
      <a
        href={PATHS.entry}
        onClick={onClick}
        className={`btn btn-primary star-link${compact ? ' star-link--compact' : ' btn-lg'}${streak ? ' is-firing' : ''}`}
        aria-label={compact ? label : undefined}
      >
        <span className="star-link__sky" aria-hidden>
          <span className="star-link__tail" />
          <span className="star-link__star" />
        </span>
        <span className="star-link__text">
          <span className="star-link__label">{label}</span>
          {hint && !compact && <span className="star-link__hint">{hint}</span>}
        </span>
      </a>
      {streak &&
        createPortal(
          <span
            className="star-streak"
            aria-hidden
            style={{ left: streak.x, top: streak.y, '--streak-ms': `${STREAK_MS}ms` } as CSSProperties}
          />,
          document.body,
        )}
    </>
  )
}
