import type { ReactNode } from 'react'

/** Reserve the larger translation at the current width without exposing duplicate text. */
export function StableCopy({ children, alternate }: { children: ReactNode; alternate: ReactNode }) {
  return <span className="story-copy-slot"><span>{children}</span><span aria-hidden="true">{alternate}</span></span>
}
