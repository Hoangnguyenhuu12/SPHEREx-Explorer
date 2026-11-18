import type { ReactNode } from 'react'

export function StableForumCopy({ children, alternate }: { children: ReactNode; alternate: ReactNode }) {
  return <span className="forum-copy-slot"><span>{children}</span><span aria-hidden="true">{alternate}</span></span>
}
