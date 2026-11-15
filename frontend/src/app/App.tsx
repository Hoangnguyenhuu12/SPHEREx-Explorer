import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router'
import { AuthProvider } from '../features/auth/session'
import { TransitionHost } from '../features/route-transition/TransitionHost'
import { OverlayProvider } from '../shared/layout/overlay'
import { PATHS } from './config'
import { StarChat } from '../features/chat/StarChat'

const LandingPage = lazy(() => import('../pages/LandingPage'))
const StoryPage = lazy(() => import('../pages/StoryPage'))
const WhereAreYouPage = lazy(() => import('../pages/WhereAreYouPage'))
const TheEyesPage = lazy(() => import('../pages/TheEyesPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))
const AuthPage = lazy(() => import('../pages/AuthPage'))
const ForumPage = lazy(() => import('../pages/forum/ForumPage'))
const PostPage = lazy(() => import('../pages/forum/PostPage'))
const EditorPage = lazy(() => import('../pages/forum/EditorPage'))
const MyPostsPage = lazy(() => import('../pages/forum/MyPostsPage'))
const ModerationPage = lazy(() => import('../pages/admin/ModerationPage'))
const GlobePage = lazy(() => import('../globe/GlobePage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
})

function Root() {
  return (
    <AuthProvider>
      <OverlayProvider>
        <TransitionHost>
          <ScrollRestoration />
          <Suspense fallback={<div className="route-loading" role="status">Loading…</div>}>
            <Outlet />
          </Suspense>
          <StarChat />
        </TransitionHost>
      </OverlayProvider>
    </AuthProvider>
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
      { path: PATHS.login, element: <AuthPage key="login" mode="login" /> },
      { path: PATHS.signup, element: <AuthPage key="signup" mode="signup" /> },
      { path: PATHS.forum, element: <ForumPage /> },
      { path: PATHS.forumNew, element: <EditorPage /> },
      { path: PATHS.myPosts, element: <MyPostsPage /> },
      { path: PATHS.adminForum, element: <ModerationPage /> },
      { path: '/globe', element: <GlobePage /> },
      { path: '/forum/posts/:id', element: <PostPage /> },
      { path: '/forum/posts/:id/edit', element: <EditorPage /> },
      { path: '/sign-up', element: <Alias to={PATHS.signup} /> },
      { path: '/log-in', element: <Alias to={PATHS.login} /> },
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
