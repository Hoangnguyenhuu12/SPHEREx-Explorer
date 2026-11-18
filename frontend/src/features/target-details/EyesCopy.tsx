import type { ReactNode } from 'react'

export function EyesCopy({ children, alternate }: { children: ReactNode; alternate: ReactNode }) {
  return <span className="eyes-copy"><span>{children}</span><span aria-hidden="true">{alternate}</span></span>
}
