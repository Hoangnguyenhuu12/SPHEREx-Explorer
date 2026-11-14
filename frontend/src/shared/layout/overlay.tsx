import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'

/** Navigation and the target popup can never be open together. */
export type Overlay = 'none' | 'navigation' | 'target'

type Action = { type: 'open'; overlay: Exclude<Overlay, 'none'> } | { type: 'close'; overlay?: Overlay } | { type: 'toggleNav' }

export function overlayReducer(state: Overlay, action: Action): Overlay {
  switch (action.type) {
    case 'open':
      return action.overlay
    case 'close':
      return action.overlay && action.overlay !== state ? state : 'none'
    case 'toggleNav':
      return state === 'navigation' ? 'none' : 'navigation'
  }
}

interface OverlayApi {
  overlay: Overlay
  open: (o: Exclude<Overlay, 'none'>) => void
  close: (o?: Overlay) => void
  toggleNav: () => void
}

const Ctx = createContext<OverlayApi | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, dispatch] = useReducer(overlayReducer, 'none')
  const open = useCallback((o: Exclude<Overlay, 'none'>) => dispatch({ type: 'open', overlay: o }), [])
  const close = useCallback((o?: Overlay) => dispatch({ type: 'close', overlay: o }), [])
  const toggleNav = useCallback(() => dispatch({ type: 'toggleNav' }), [])
  const value = useMemo(() => ({ overlay, open, close, toggleNav }), [overlay, open, close, toggleNav])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useOverlay(): OverlayApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOverlay outside OverlayProvider')
  return v
}
