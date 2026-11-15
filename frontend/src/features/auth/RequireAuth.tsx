import { useCallback, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { PATHS } from '../../app/config'
import { loginPath } from './returnTo'
import { justLoggedOut, useSession } from './session'

/** Route guard: guests are sent to Log in and come back here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useSession()
  const location = useLocation()
  // Live mode restores the Supabase session asynchronously; don't bounce to Log in meanwhile.
  if (!ready)
    return (
      <div className="route-loading" role="status">
        Checking your session…
      </div>
    )
  if (!user) return <Navigate to={justLoggedOut() ? PATHS.forum : loginPath(`${location.pathname}${location.search}`)} replace />
  return <>{children}</>
}

/**
 * For buttons a guest can see (Write a post, Comment, Report): returns a function that runs the
 * action when logged in, or goes to Log in with a return path.
 */
// oxlint-disable-next-line react/only-export-components
export function useRequireLogin() {
  const { user } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  return useCallback(
    (action: () => void, returnTo: string = `${location.pathname}${location.search}`) => {
      if (user) action()
      else navigate(loginPath(returnTo))
    },
    [user, location.pathname, location.search, navigate],
  )
}

/**
 * End the session and go to the Forum. Private pages still on screen during the transition see
 * `justLoggedOut()` in RequireAuth and leave instead of asking to log in again.
 */
// oxlint-disable-next-line react/only-export-components
export function useLogOut() {
  const { logOut } = useSession()
  const navigate = useNavigate()
  return useCallback(() => {
    logOut()
    navigate(PATHS.forum)
  }, [logOut, navigate])
}
