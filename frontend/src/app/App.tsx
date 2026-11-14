import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router'
import { TransitionHost } from '../features/route-transition/TransitionHost'
import { OverlayProvider } from '../shared/layout/overlay'
import { PATHS } from './config'

const LandingPage = lazy(() => import('../pages/LandingPage'))
const StoryPage = lazy(() => import('../pages/StoryPage'))
const WhereAreYouPage = lazy(() => import('../pages/WhereAreYouPage'))
const TheEyesPage = lazy(() => import('../pages/TheEyesPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
})

function Root() {
  return (
    <OverlayProvider>
      <TransitionHost>
        <ScrollRestoration />
        <Suspense fallback={<div className="route-loading" role="status">Loading…</div>}>
          <Outlet />
        </Suspense>
      </TransitionHost>
    </OverlayProvider>
  )
}

/** SRS v2 short routes redirect to the agreed paths, keeping the query string. */
function Alias({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: PATHS.home, element: <LandingPage /> },
      { path: PATHS.story, element: <StoryPage /> },
      { path: PATHS.entry, element: <WhereAreYouPage /> },
      { path: PATHS.explorer, element: <TheEyesPage /> },
      { path: '/where', element: <Alias to={PATHS.entry} /> },
      { path: '/eyes', element: <Alias to={PATHS.explorer} /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
