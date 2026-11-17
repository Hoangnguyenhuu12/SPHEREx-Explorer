import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpen, Eye, FileText, Globe2, Home, LogIn, LogOut, Menu, MessagesSquare, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { PATHS } from '../../app/config'
import { AccountMenu } from '../../features/auth/AccountMenu'
import { useLogOut } from '../../features/auth/RequireAuth'
import { useSession } from '../../features/auth/session'
import { useOverlay } from './overlay'
import { LanguageSwitch, useLanguage } from '../i18n/language'
import { SHELL_COPY, type NavKey } from '../i18n/homeTranslations'
import '../ui/ui.css'
import './layout.css'

const NAV: readonly { to: string; key: NavKey; icon: typeof Home }[] = [
  { to: PATHS.home, key: 'home', icon: Home },
  { to: PATHS.story, key: 'story', icon: BookOpen },
  { to: PATHS.entry, key: 'entry', icon: Globe2 },
  { to: PATHS.explorer, key: 'explorer', icon: Eye },
  { to: PATHS.forum, key: 'forum', icon: MessagesSquare },
] as const

const ACCOUNT_NAV = [
  { to: PATHS.login, key: 'login' as const, icon: LogIn },
  { to: PATHS.signup, key: 'signup' as const, icon: UserPlus },
] as const

export function MenuButton() {
  const { overlay, toggleNav } = useOverlay()
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
  const open = overlay === 'navigation'
  return (
    <button
      type="button"
      className="icon-btn"
      id="nav-toggle"
      aria-label={open ? t.closeNav : t.openNav}
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
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
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
            aria-label={t.pagesLabel}
            initial={reduce ? { opacity: 0 } : { x: -320 }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: -320 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="nav-drawer__top">
              <span className="wordmark" translate="no">SPHEREx Explorer</span>
              <button type="button" className="icon-btn" aria-label={t.closeNav} onClick={() => close('navigation')}>
                <X aria-hidden />
              </button>
            </div>
            <ul>
              {NAV.map(({ to, key, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} end onClick={() => close('navigation')}>
                    <Icon aria-hidden />
                    {t.nav[key]}
                  </NavLink>
                </li>
              ))}
            </ul>
            <ul className="nav-drawer__account" aria-label={t.accountLabel}>
              {user ? (
                <>
                  <li>
                    <NavLink to={PATHS.myPosts} end onClick={() => close('navigation')}>
                      <FileText aria-hidden />
                      {t.myPosts}
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
                      {t.logout}
                    </button>
                  </li>
                </>
              ) : (
                ACCOUNT_NAV.map(({ to, key, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end onClick={() => close('navigation')}>
                      <Icon aria-hidden />
                      {t[key]}
                    </NavLink>
                  </li>
                ))
              )}
            </ul>
            <p className="caption nav-drawer__note">{t.footerLine}</p>
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
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
  if (user) return <AccountMenu />
  if (compact)
    return (
      <NavLink to={PATHS.login} className="btn btn-secondary">
        <LogIn aria-hidden />
        {t.login}
      </NavLink>
    )
  return (
    <>
      <NavLink to={PATHS.login} className="btn btn-ghost auth-actions__login">
        <LogIn aria-hidden />
        {t.login}
      </NavLink>
      <NavLink to={PATHS.signup} className="btn btn-primary auth-actions__signup">
        <UserPlus aria-hidden />
        {t.signup}
      </NavLink>
    </>
  )
}

/**
 * Only the Landing header shows horizontal navigation plus Log in / Sign up; other pages use the
 * left drawer. Below 1020px the Landing header also falls back to the drawer.
 */
export function SiteHeader({ variant = 'default', children }: { variant?: HeaderVariant; children?: ReactNode }) {
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
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
            <nav aria-label={t.pagesLabel} className="topnav">
              <ul>
                {NAV.map(({ to, key }) => (
                  <li key={to}>
                    <NavLink to={to} end>
                      {t.nav[key]}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <LanguageSwitch />
            {isLanding ? (
              <div className="auth-actions" role="group" aria-label={t.accountLabel}>
                <AuthActions />
              </div>
            ) : (
              (children ?? (
                <>
                  <Link to={PATHS.explorer} className="btn btn-secondary" aria-label={t.openTheEyes}>
                    <Eye aria-hidden />
                    <span className="hide-narrow">{t.openTheEyes}</span>
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
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <p>{t.footerLine}</p>
        <nav aria-label={t.footerLabel}>
          <ul>
            {NAV.map(({ to, key }) => (
              <li key={to}>
                <Link to={to}>{t.nav[key]}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="caption site-footer__credit">{t.footerCredit}</p>
      </div>
    </footer>
  )
}

export function CompactFooter({ children }: { children?: ReactNode }) {
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
  return (
    <footer className="site-footer--compact">
      <span>{t.footerLine}</span>
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
  const { lang } = useLanguage()
  const t = SHELL_COPY[lang]
  return (
    <>
      <a href="#main" className="skip-link">
        {t.skipToContent}
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
