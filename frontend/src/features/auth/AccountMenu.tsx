import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, CircleUser, FileText, LogOut, RotateCcw, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { PATHS } from '../../app/config'
import { resetDb } from '../forum/mock/store'
import { useNotifications } from '../forum/queries'
import { Dialog } from '../../shared/ui/Dialog'
import { useLogOut } from './RequireAuth'
import { useSession, type Role } from './session'

/** Header control once logged in: who am I, my posts, demo tools, log out. */
export function AccountMenu() {
  const { user, setDemoRole } = useSession()
  const logOut = useLogOut()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const notifications = useNotifications()
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0

  // Close when the route changes.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const name = user.displayName ?? 'Account'

  const switchRole = (role: Role) => {
    setDemoRole(role)
    setOpen(false)
    if (role === 'member' && location.pathname.startsWith(PATHS.adminForum)) navigate(PATHS.forum)
  }

  return (
    <div className="account" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost account__btn"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <CircleUser aria-hidden />
        <span className="account__name">{name}</span>
        {unread > 0 && (
          <span className="account__dot">
            <span className="sr-only">, {unread} new updates</span>
          </span>
        )}
        <ChevronDown aria-hidden />
      </button>
      {open && (
        <div id={menuId} className="account__menu">
          <p className="account__who caption">
            Signed in as <strong>{user.email}</strong>
            {user.role === 'admin' && ' · moderator'}
          </p>
          <ul>
            <li>
              <Link to={PATHS.myPosts}>
                <FileText aria-hidden />
                My posts
                {unread > 0 && <span className="account__count">{unread} new</span>}
              </Link>
            </li>
            {user.role === 'admin' && (
              <li>
                <Link to={PATHS.adminForum}>
                  <ShieldCheck aria-hidden />
                  Moderation
                </Link>
              </li>
            )}
          </ul>
          <div className="account__demo">
            <p className="caption">Demo tools</p>
            <div className="segmented" role="radiogroup" aria-label="Demo role">
              {(['member', 'admin'] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={user.role === r} onClick={() => switchRole(r)}>
                  {r === 'member' ? 'Member' : 'Moderator'}
                </button>
              ))}
            </div>
            <button type="button" className="account__item" onClick={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden />
              Reset demo posts
            </button>
          </div>
          <button
            type="button"
            className="account__item"
            onClick={() => {
              setOpen(false)
              void logOut()
            }}
          >
            <LogOut aria-hidden />
            Log out
          </button>
        </div>
      )}
      <Dialog
        open={confirmReset}
        title="Reset demo posts?"
        description="This puts back the sample posts and removes every post, comment and report made in this browser."
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetDb()
                qc.removeQueries({ queryKey: ['forum'] })
                setConfirmReset(false)
                setOpen(false)
                navigate(PATHS.forum)
              }}
            >
              Reset posts
            </button>
          </>
        }
      />
    </div>
  )
}
