import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { Dialog } from '../../../shared/ui/Dialog'

/** Ask before leaving a page with unsaved changes: in-app navigation (dialog) and tab close (browser prompt). */
export function useLeaveGuard(when: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      description="Your changes since the last save will be lost."
      onClose={() => blocker.reset?.()}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => blocker.proceed?.()}>
            Leave
          </button>
          <button type="button" className="btn btn-primary" onClick={() => blocker.reset?.()}>
            Keep editing
          </button>
        </>
      }
    />
  )
}
