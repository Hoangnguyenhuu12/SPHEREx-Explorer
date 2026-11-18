import { AlertCircle, Check, CheckCircle2, Circle, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { config, PATHS } from '../../app/config'
import { useLanguage } from '../../shared/i18n/language'
import { AuthServiceError, logIn, signUp } from './authService'
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
  /** Live sign-up: the email must be confirmed before logging in. */
  confirmEmail?: boolean
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

const VI: Record<string, string> = {
  'Welcome back': 'Chào mừng bạn trở lại',
  'Log in to keep exploring the sky with SPHEREx.': 'Đăng nhập để tiếp tục khám phá bầu trời cùng SPHEREx.',
  'Log in': 'Đăng nhập', 'Logging in…': 'Đang đăng nhập…', 'New to SPHEREx Explorer?': 'Bạn mới đến SPHEREx Explorer?', 'Create an account': 'Tạo tài khoản',
  'Create your account': 'Tạo tài khoản của bạn', 'Sign up with your email to save your place among the stars.': 'Đăng ký bằng email để lưu lại hành trình khám phá bầu trời.',
  'Sign up': 'Đăng ký', 'Creating account…': 'Đang tạo tài khoản…', 'Already have an account?': 'Bạn đã có tài khoản?',
  'Email': 'Email', 'Password': 'Mật khẩu', 'Confirm password': 'Xác nhận mật khẩu',
  'At least 8 characters': 'Ít nhất 8 ký tự', 'A letter': 'Một chữ cái', 'A number': 'Một chữ số',
  'Enter your email address.': 'Hãy nhập địa chỉ email.', 'Enter a valid email address, like name@example.com.': 'Hãy nhập email hợp lệ, ví dụ name@example.com.',
  'Enter your password.': 'Hãy nhập mật khẩu.', 'Use at least 8 characters.': 'Hãy dùng ít nhất 8 ký tự.', 'Use at least one letter and one number.': 'Hãy dùng ít nhất một chữ cái và một chữ số.',
  'Enter your password again.': 'Hãy nhập lại mật khẩu.', 'Passwords do not match.': 'Mật khẩu xác nhận không khớp.',
  'Email or password is incorrect.': 'Email hoặc mật khẩu không chính xác.', 'Confirm your email first: open the link we sent you, then log in.': 'Hãy xác nhận email qua liên kết đã gửi trước khi đăng nhập.',
  'An account with this email already exists. Log in instead.': 'Email này đã có tài khoản. Hãy đăng nhập.', 'Choose a stronger password.': 'Hãy chọn mật khẩu mạnh hơn.',
  'Too many attempts. Wait a minute and try again.': 'Bạn đã thử quá nhiều lần. Hãy đợi một phút rồi thử lại.', 'Something went wrong. Please try again.': 'Đã xảy ra lỗi. Vui lòng thử lại.',
  'Account created. Open the confirmation link we emailed you, then log in.': 'Đã tạo tài khoản. Hãy mở liên kết xác nhận trong email rồi đăng nhập.',
  'Account created. Log in to continue.': 'Đã tạo tài khoản. Hãy đăng nhập để tiếp tục.',
  'Log in to continue where you left off.': 'Đăng nhập để tiếp tục công việc trước đó.', 'Create an account to continue where you left off.': 'Tạo tài khoản để tiếp tục công việc trước đó.',
  'Demo: there is no account server yet. Your session lives only in this browser tab.': 'Bản minh họa: chưa có máy chủ tài khoản. Phiên đăng nhập chỉ tồn tại trong thẻ trình duyệt này.',
}

function AuthCopy({ text, vi }: { text: string; vi: boolean }) {
  const translated = VI[text] ?? text
  return <span className="auth-copy"><span>{vi ? translated : text}</span><span aria-hidden="true">{vi ? text : translated}</span></span>
}

function AuthCopyPair({ children, alternate }: { children: ReactNode; alternate: ReactNode }) {
  return <span className="auth-copy"><span>{children}</span><span aria-hidden="true">{alternate}</span></span>
}

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string }

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const copy = COPY[mode]
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const session = useSession()
  const returnTo = sanitizeReturnTo(params.get('returnTo'))
  const signedUpState = mode === 'login' ? (location.state as AuthLocationState | null) : null
  const signedUpEmail = signedUpState?.signedUpEmail
  const confirmEmail = Boolean(signedUpState?.confirmEmail)

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
        const { email, needsConfirmation } = await signUp(credentials)
        navigate(returnTo ? loginPath(returnTo) : PATHS.login, {
          state: { signedUpEmail: email, confirmEmail: needsConfirmation } satisfies AuthLocationState,
        })
        return
      }
      const { email } = await logIn(credentials)
      session.logIn(email)
      navigate(returnTo ?? PATHS.forum, { replace: true })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof AuthServiceError ? err.message : 'Something went wrong. Please try again.' })
    }
  }

  const fieldId = (f: AuthField) => `${uid}-${f}`
  const errorId = (f: AuthField) => `${uid}-${f}-error`
  const rulesId = `${uid}-rules`

  const renderField = (field: AuthField) => {
    const isPassword = field !== 'email'
    const error = errors[field]
    const describedBy = [field === 'password' && mode === 'signup' ? rulesId : null, error ? errorId(field) : null]
      .filter(Boolean)
      .join(' ')
    return (
      <div className="auth-field" key={field}>
        <label htmlFor={fieldId(field)} className="auth-field__label">
          <AuthCopy text={LABELS[field]} vi={vi} />
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
              aria-label={showPassword ? (vi ? 'Ẩn mật khẩu' : 'Hide password') : (vi ? 'Hiện mật khẩu' : 'Show password')}
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
            <AlertCircle aria-hidden /> <AuthCopy text={error} vi={vi} />
          </p>
        )}
        {field === 'password' && mode === 'signup' && (
          <ul id={rulesId} className="auth-rules" aria-label={vi ? 'Yêu cầu mật khẩu' : 'Password requirements'}>
            {passwordRules(values.password).map((r) => (
              <li key={r.id} className={r.met ? 'is-met' : undefined}>
                {r.met ? <Check aria-hidden /> : <Circle aria-hidden />}
                <AuthCopy text={r.label} vi={vi} />
                <span className="sr-only">{r.met ? (vi ? ' (đã đạt)' : ' (done)') : (vi ? ' (chưa đạt)' : ' (not yet)')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1 className="auth-card__title"><AuthCopy text={copy.title} vi={vi} /></h1>
      <p className="auth-card__lead"><AuthCopy text={copy.lead} vi={vi} /></p>

      {signedUpEmail && (
        <div className="notice notice--info auth-card__notice" role="status">
          <CheckCircle2 aria-hidden />
          <AuthCopy text={confirmEmail ? 'Account created. Open the confirmation link we emailed you, then log in.' : 'Account created. Log in to continue.'} vi={vi} />
        </div>
      )}
      {returnTo && !signedUpEmail && (
        <div className="notice notice--info auth-card__notice" role="status">
          <CheckCircle2 aria-hidden />
          <AuthCopy text={mode === 'login' ? 'Log in to continue where you left off.' : 'Create an account to continue where you left off.'} vi={vi} />
        </div>
      )}
      {status.kind === 'error' && (
        <div className="notice notice--error auth-card__notice" role="alert">
          <AlertCircle aria-hidden />
          <AuthCopy text={status.message} vi={vi} />
        </div>
      )}

      <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={submitting}>
        {fieldsFor(mode).map(renderField)}
        <button type="submit" className="btn btn-primary btn-lg auth-form__submit" disabled={submitting}>
          {submitting ? (
            <>
              <LoaderCircle className="auth-spin" aria-hidden /> <AuthCopy text={copy.pending} vi={vi} />
            </>
          ) : (
            <AuthCopy text={copy.submit} vi={vi} />
          )}
        </button>
      </form>

      <p className="auth-card__switch">
        <AuthCopyPair alternate={`${vi ? copy.switchText : VI[copy.switchText]} ${vi ? copy.switchLink : VI[copy.switchLink]}`}>
          {vi ? VI[copy.switchText] : copy.switchText} <Link to={returnTo ? loginPath(returnTo, copy.switchTo) : copy.switchTo}>{vi ? VI[copy.switchLink] : copy.switchLink}</Link>
        </AuthCopyPair>
      </p>
      {!config.forumLive && <p className="caption auth-card__demo"><AuthCopy text="Demo: there is no account server yet. Your session lives only in this browser tab." vi={vi} /></p>}
    </div>
  )
}
