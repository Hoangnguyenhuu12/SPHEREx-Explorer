import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpen, Eye, FileText, Globe2, Home, LogIn, LogOut, Menu, MessagesSquare, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { PATHS } from '../../app/config'
import { AccountMenu } from '../../features/auth/AccountMenu'
import { useLogOut } from '../../features/auth/RequireAuth'
import { useSession } from '../../features/auth/session'
import { useOverlay } from './overlay'
import '../ui/ui.css'
import './layout.css'

const NAV = [
  { to: PATHS.home, label: 'Home', icon: Home },
  { to: PATHS.story, label: 'Story', icon: BookOpen },
  { to: PATHS.entry, label: 'SPHEREx Orbit', icon: Globe2 },
  { to: PATHS.explorer, label: 'The Eyes', icon: Eye },
  { to: PATHS.forum, label: 'Forum', icon: MessagesSquare },
] as const

const ACCOUNT_NAV = [
  { to: PATHS.login, label: 'Log in', icon: LogIn },
  { to: PATHS.signup, label: 'Sign up', icon: UserPlus },
] as const

export function MenuButton() {
  const { overlay, toggleNav } = useOverlay()
  const open = overlay === 'navigation'
  return (
    <button
      type="button"
      className="icon-btn"
      id="nav-toggle"
      aria-label={open ? 'Close navigation' : 'Open navigation'}
      aria-expanded={open}
      aria-controls="site-nav"
      onClick={toggleNav}
    >
      <Menu aria-hidden />
    </button>
  )
}

export function NavDrawer() {
  const { overlay, close } = useOverlay()
  const { user } = useSession()
  const logOut = useLogOut()
  const open = overlay === 'navigation'
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    ;(panel?.querySelector<HTMLElement>('a[aria-current="page"]') ?? panel?.querySelector<HTMLElement>('a'))?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close('navigation')
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      ;(document.getElementById('nav-toggle') ?? prev)?.focus()
    }
  }, [open, close])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="nav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close('navigation')}
          />
          <motion.nav
            ref={panelRef}
            id="site-nav"
            className="nav-drawer"
            aria-label="Pages"
            initial={reduce ? { opacity: 0 } : { x: -320 }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: -320 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="nav-drawer__top">
              <span className="wordmark" translate="no">SPHEREx Explorer</span>
              <button type="button" className="icon-btn" aria-label="Close navigation" onClick={() => close('navigation')}>
                <X aria-hidden />
              </button>
            </div>
            <ul>
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} end onClick={() => close('navigation')}>
                    <Icon aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <ul className="nav-drawer__account" aria-label="Account">
              {user ? (
                <>
                  <li>
                    <NavLink to={PATHS.myPosts} end onClick={() => close('navigation')}>
                      <FileText aria-hidden />
                      My posts
                    </NavLink>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        close('navigation')
                        void logOut()
                      }}
                    >
                      <LogOut aria-hidden />
                      Log out
                    </button>
                  </li>
                </>
              ) : (
                ACCOUNT_NAV.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end onClick={() => close('navigation')}>
                      <Icon aria-hidden />
                      {label}
                    </NavLink>
                  </li>
                ))
              )}
            </ul>
            <p className="caption nav-drawer__note">Independent project using NASA SPHEREx data.</p>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  )
}

type HeaderVariant = 'default' | 'eyes' | 'landing'

/** Log in / Sign up for guests, the account menu once logged in. */
export function AuthActions({ compact = false }: { compact?: boolean }) {
  const { user } = useSession()
  if (user) return <AccountMenu />
  if (compact)
    return (
      <NavLink to={PATHS.login} className="btn btn-secondary">
        <LogIn aria-hidden />
        Log in
      </NavLink>
    )
  return (
    <>
      <NavLink to={PATHS.login} className="btn btn-ghost auth-actions__login">
        <LogIn aria-hidden />
        Log in
      </NavLink>
      <NavLink to={PATHS.signup} className="btn btn-primary auth-actions__signup">
        <UserPlus aria-hidden />
        Sign up
      </NavLink>
    </>
  )
}

/**
 * Only the Landing header shows horizontal navigation plus Log in / Sign up; other pages use the
 * left drawer. Below 900px the Landing header also falls back to the drawer.
 */
export function SiteHeader({ variant = 'default', children }: { variant?: HeaderVariant; children?: ReactNode }) {
  const isEyes = variant === 'eyes'
  const isLanding = variant === 'landing'
  return (
    <header className={`site-header${isEyes ? ' site-header--eyes' : ''}${isLanding ? ' site-header--landing' : ''}`}>
      <div className={`site-header__inner${isEyes ? '' : ' wrap'}`}>
        {isEyes ? (
          <MenuButton />
        ) : (
          <span className="landing-menu">
            <MenuButton />
          </span>
        )}
        <Link to={PATHS.home} className="wordmark" translate="no">
          SPHEREx Explorer
        </Link>
        {isEyes ? (
          children
        ) : (
          <>
            <span className="site-header__spacer" />
            <nav aria-label="Pages" className="topnav">
              <ul>
                {NAV.map(({ to, label }) => (
                  <li key={to}>
                    <NavLink to={to} end>
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            {isLanding ? (
              <div className="auth-actions" role="group" aria-label="Account">
                <AuthActions />
              </div>
            ) : (
              (children ?? (
                <>
                  <span className="site-header__spacer" />
                  <Link to={PATHS.explorer} className="btn btn-secondary" aria-label="Open The Eyes">
                    <Eye aria-hidden />
                    <span className="hide-narrow">Open The Eyes</span>
                  </Link>
                </>
              ))
            )}
          </>
        )}
      </div>
    </header>
  )
}

export const FOOTER_LINE = 'Independent project using NASA SPHEREx data.'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <p>{FOOTER_LINE}</p>
        <nav aria-label="Footer">
          <ul>
            {NAV.map(({ to, label }) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="caption site-footer__credit">
          Not affiliated with or endorsed by NASA. Earth imagery: NASA Blue Marble. Sky map in The Eyes: SPHEREx DR1 all-sky cube via IRSA (DSS2 via CDS as fallback)
          Aladin Lite.
        </p>
      </div>
    </footer>
  )
}

export function CompactFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="site-footer--compact">
      <span>{FOOTER_LINE}</span>
      {children}
    </footer>
  )
}

export function PageShell({
  children,
  header = 'default',
  headerActions,
}: {
  children: ReactNode
  header?: HeaderVariant
  /** Replaces the default "Open The Eyes" button on non-landing headers. */
  headerActions?: ReactNode
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader variant={header}>{headerActions}</SiteHeader>
      <NavDrawer />
      <main id="main" className="page-main">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
