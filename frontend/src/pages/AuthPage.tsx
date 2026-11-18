import { useEffect } from 'react'
import { StarfieldCanvas } from '../features/artwork/StarfieldCanvas'
import { AuthForm } from '../features/auth/AuthForm'
import type { AuthMode } from '../features/auth/validation'
import { PageShell } from '../shared/layout/Shell'
import { useLanguage } from '../shared/i18n/language'

const TITLES: Record<AuthMode, string> = {
  login: 'Log in · SPHEREx Explorer',
  signup: 'Sign up · SPHEREx Explorer',
}

/** Standalone page for /login and /signup. `key` on the route remounts the form when switching. */
export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { lang } = useLanguage()
  useEffect(() => {
    const prev = document.title
    document.title = lang === 'vi' ? `${mode === 'login' ? 'Đăng nhập' : 'Đăng ký'} · SPHEREx Explorer` : TITLES[mode]
    return () => {
      document.title = prev
    }
  }, [mode, lang])

  return (
    <PageShell header="landing">
      <section className="auth-page" aria-label={mode === 'login' ? (lang === 'vi' ? 'Đăng nhập' : 'Log in') : (lang === 'vi' ? 'Đăng ký' : 'Sign up')}>
        <div className="auth-page__sky" aria-hidden>
          <StarfieldCanvas className="auth-page__stars" density={0.5} shootingEverySec={4} />
          <span className="auth-page__glow auth-page__glow--a" />
          <span className="auth-page__glow auth-page__glow--b" />
        </div>
        <AuthForm mode={mode} />
      </section>
    </PageShell>
  )
}
