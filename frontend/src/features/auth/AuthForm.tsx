import { AlertCircle, Check, CheckCircle2, Circle, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { PATHS } from '../../app/config'
import { logIn, signUp } from './authService'
import { loginPath, sanitizeReturnTo } from './returnTo'
import { useSession } from './session'
import {
  EMAIL_MAX_LENGTH,
  fieldsFor,
  passwordRules,
  validateAuth,
  validateField,
  type AuthErrors,
  type AuthField,
  type AuthMode,
  type AuthValues,
} from './validation'
import './auth.css'

/** Router state passed from Sign up to Log in after a successful sign up. */
export interface AuthLocationState {
  signedUpEmail?: string
}

const COPY = {
  login: {
    title: 'Welcome back',
    lead: 'Log in to keep exploring the sky with SPHEREx.',
    submit: 'Log in',
    pending: 'Logging in…',
    switchText: 'New to SPHEREx Explorer?',
    switchLink: 'Create an account',
    switchTo: PATHS.signup,
  },
  signup: {
    title: 'Create your account',
    lead: 'Sign up with your email to save your place among the stars.',
    submit: 'Sign up',
    pending: 'Creating account…',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
    switchTo: PATHS.login,
  },
} as const

const LABELS: Record<AuthField, string> = {
  email: 'Email',
  password: 'Password',
  confirmPassword: 'Confirm password',
}

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string }

export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode]
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const session = useSession()
  const returnTo = sanitizeReturnTo(params.get('returnTo'))
  const signedUpEmail = mode === 'login' ? (location.state as AuthLocationState | null)?.signedUpEmail : undefined

  const [values, setValues] = useState<AuthValues>({ email: signedUpEmail ?? '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<AuthErrors>({})
  const [touched, setTouched] = useState<Partial<Record<AuthField, boolean>>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const refs = useRef<Partial<Record<AuthField, HTMLInputElement | null>>>({})
  const uid = useId()
  const submitting = status.kind === 'submitting'

  const update = (field: AuthField, value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    // Once a field has been left, re-check it (and the confirmation) as the user types.
    setErrors((prev) => {
      const out = { ...prev }
      for (const f of fieldsFor(mode)) {
        if (f === field ? touched[f] : f === 'confirmPassword' && field === 'password' && touched.confirmPassword) {
          out[f] = validateField(f, next, mode)
        }
      }
      return out
    })
  }

  const blur = (field: AuthField) => {
    setTouched((t) => ({ ...t, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, values, mode) }))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const found = validateAuth(values, mode)
    setErrors(found)
    setTouched(Object.fromEntries(fieldsFor(mode).map((f) => [f, true])))
    const first = fieldsFor(mode).find((f) => found[f])
    if (first) {
      refs.current[first]?.focus()
      return
    }
    setStatus({ kind: 'submitting' })
    try {
      const credentials = { email: values.email, password: values.password }
      if (mode === 'signup') {
        const { email } = await signUp(credentials)
        navigate(returnTo ? loginPath(returnTo) : PATHS.login, { state: { signedUpEmail: email } satisfies AuthLocationState })
        return
      }
      const { email } = await logIn(credentials)
      session.logIn(email)
      navigate(returnTo ?? PATHS.forum, { replace: true })
    } catch {
      setStatus({ kind: 'error', message: 'Something went wrong. Please try again.' })
    }
  }

  const fieldId = (f: AuthField) => `${uid}-${f}`
  const errorId = (f: AuthField) => `${uid}-${f}-error`
  const rulesId = `${uid}-rules`

  const renderField = (field: AuthField) => {
    const isPassword = field !== 'email'
    const error = errors[field]
    const describedBy = [error ? errorId(field) : null, field === 'password' && mode === 'signup' ? rulesId : null]
      .filter(Boolean)
      .join(' ')
    return (
      <div className="auth-field" key={field}>
        <label htmlFor={fieldId(field)} className="auth-field__label">
          {LABELS[field]}
        </label>
        <div className={`auth-field__control${error ? ' auth-field__control--error' : ''}`}>
          <input
            ref={(el) => {
              refs.current[field] = el
            }}
            id={fieldId(field)}
            name={field}
            className="input auth-field__input"
            type={isPassword ? (showPassword ? 'text' : 'password') : 'email'}
            inputMode={isPassword ? undefined : 'email'}
            autoComplete={field === 'email' ? 'email' : mode === 'signup' ? 'new-password' : 'current-password'}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={field === 'email' ? EMAIL_MAX_LENGTH : 128}
            placeholder={field === 'email' ? 'name@example.com' : undefined}
            value={values[field]}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(e) => update(field, e.target.value)}
            onBlur={() => blur(field)}
          />
          {field === 'password' && (
            <button
              type="button"
              className="icon-btn icon-btn--sm auth-field__toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              aria-controls={mode === 'signup' ? `${fieldId('password')} ${fieldId('confirmPassword')}` : fieldId('password')}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId(field)} className="auth-field__error">
            <AlertCircle aria-hidden /> {error}
          </p>
        )}
        {field === 'password' && mode === 'signup' && (
          <ul id={rulesId} className="auth-rules" aria-label="Password requirements">
            {passwordRules(values.password).map((r) => (
              <li key={r.id} className={r.met ? 'is-met' : undefined}>
                {r.met ? <Check aria-hidden /> : <Circle aria-hidden />}
                {r.label}
                <span className="sr-only">{r.met ? ' (done)' : ' (not yet)'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">{copy.title}</h1>
      <p className="auth-card__lead">{copy.lead}</p>

      {signedUpEmail && (
        <div className="notice notice--info auth-card__notice" role="status">
          <CheckCircle2 aria-hidden />
          <span>Account created. Log in to continue.</span>
        </div>
      )}
      {returnTo && !signedUpEmail && (
        <div className="notice notice--info auth-card__notice" role="status">
          <CheckCircle2 aria-hidden />
          <span>{mode === 'login' ? 'Log in to continue where you left off.' : 'Create an account to continue where you left off.'}</span>
        </div>
      )}
      {status.kind === 'error' && (
        <div className="notice notice--error auth-card__notice" role="alert">
          <AlertCircle aria-hidden />
          <span>{status.message}</span>
        </div>
      )}

      <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={submitting}>
        {fieldsFor(mode).map(renderField)}
        <button type="submit" className="btn btn-primary btn-lg auth-form__submit" disabled={submitting}>
          {submitting ? (
            <>
              <LoaderCircle className="auth-spin" aria-hidden /> {copy.pending}
            </>
          ) : (
            copy.submit
          )}
        </button>
      </form>

      <p className="auth-card__switch">
        {copy.switchText} <Link to={returnTo ? loginPath(returnTo, copy.switchTo) : copy.switchTo}>{copy.switchLink}</Link>
      </p>
      <p className="caption auth-card__demo">Demo: there is no account server yet. Your session lives only in this browser tab.</p>
    </div>
  )
}
