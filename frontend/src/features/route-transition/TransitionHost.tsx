import { useReducedMotion } from 'motion/react'
import './transition.css'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

/**
 * App-level transition overlay that survives route unmounts.
 * Earth → The Eyes: camera rush + blur (in the Earth scene) and a dark veil here, ~800 ms total.
 */

type Phase = 'idle' | 'launching' | 'revealing'

interface TransitionApi {
  phase: Phase
  launch: (to: string) => void
}

const Ctx = createContext<TransitionApi | null>(null)

const RUSH_MS = 520
const REVEAL_MS = 300

export function TransitionHost({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const busy = useRef(false)

  const launch = useCallback(
    (to: string) => {
      if (busy.current) return
      busy.current = true
      setPhase('launching')
      const rush = reduce ? 180 : RUSH_MS
      window.setTimeout(() => {
        navigate(to)
        setPhase('revealing')
        window.setTimeout(
          () => {
            setPhase('idle')
            busy.current = false
          },
          reduce ? 180 : REVEAL_MS,
        )
      }, rush)
    },
    [navigate, reduce],
  )

  const value = useMemo(() => ({ phase, launch }), [phase, launch])

  return (
    <Ctx.Provider value={value}>
      {children}
      {phase !== 'idle' && (
        <div
          aria-hidden
          className={`route-veil route-veil--${phase}`}
          style={{ ['--veil-ms' as string]: `${phase === 'launching' ? (reduce ? 180 : RUSH_MS) : reduce ? 180 : REVEAL_MS}ms` }}
        />
      )}
    </Ctx.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useRouteTransition(): TransitionApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRouteTransition outside TransitionHost')
  return v
}
