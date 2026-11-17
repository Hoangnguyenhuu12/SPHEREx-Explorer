import { AlertTriangle, Eye, Info, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { config, PATHS } from '../../app/config'
import { isTargetKey, type TargetKey } from '../../shared/config/targets'
import { FAQ, faqAnswer, targetIn } from './faq'
import { guard } from './guard'
import './chat.css'

/**
 * - `user`: a question. `send` is false when it was answered locally or failed, so it stays out of the AI history.
 * - `faq`: ready-made answer. `ai`: answered by the AI.
 * - `notice`: filtered or refused question. `error`: request failed; `retry` holds the question to resend.
 */
type Kind = 'user' | 'faq' | 'ai' | 'notice' | 'error'
type Msg = { kind: Kind; content: string; send?: boolean; retry?: string }

const ENDPOINT = config.starChatUrl
const MAX_CHARS = 400
const COUNT_FROM = 320
const COUNT_WARN = 380
const COOLDOWN_S = 30
const HIDDEN_ON: readonly string[] = [PATHS.login, PATHS.signup]
const GREETING = "Hi! I'm the star guide. Pick a question for an instant answer, or ask anything about stars and astronomy."
const FOOTNOTE = 'AI answers may be wrong. Check the images in The Eyes.'

const isAssistant = (m: Msg) => m.kind !== 'user'

function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [match, setMatch] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [query])
  return match
}

/** Floating star-guide chat: instant ready-made answers, AI answers for everything else. */
export function StarChat() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const onEyes = location.pathname === PATHS.explorer
  const viewing: TargetKey | undefined = onEyes && isTargetKey(params.get('q')) ? (params.get('q') as TargetKey) : undefined
  const hidden = HIDDEN_ON.includes(location.pathname) || params.get('embed') === '1'
  // The Eyes keeps a target popup on the left and a dock at the bottom: switch to a sheet earlier there.
  const sheet = useMediaQuery(onEyes ? '(max-width: 1100px)' : '(max-width: 720px)')

  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showFaq, setShowFaq] = useState(true)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  const waitS = Math.max(0, Math.ceil((waitUntil - now) / 1000))

  const suggestions = useMemo(
    () => (viewing ? [...FAQ].sort((a, b) => Number(b.key === viewing) - Number(a.key === viewing)) : FAQ),
    [viewing],
  )

  const returnFocus = useRef(false)
  const close = useCallback(() => {
    returnFocus.current = true
    setOpen(false)
  }, [])

  // Focus goes back to the launcher once it is on screen again (the sheet hides it while open).
  useEffect(() => {
    if (open || !returnFocus.current) return
    returnFocus.current = false
    fabRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
  }, [msgs, busy, showFaq])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // The sheet covers the page: keep the page from scrolling behind it.
  useEffect(() => {
    if (!open || !sheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, sheet])

  // Rate limited: count down, then unlock the send button.
  useEffect(() => {
    if (!waitUntil) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= waitUntil) {
        setWaitUntil(0)
        window.clearInterval(id)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [waitUntil])

  // Leaving for a sign-in page or an embed closes the chat (adjusted during render, no effect needed).
  const [wasHidden, setWasHidden] = useState(hidden)
  if (hidden !== wasHidden) {
    setWasHidden(hidden)
    if (hidden) setOpen(false)
  }

  async function ask(question: string, base: Msg[] = msgs) {
    const q = question.trim().slice(0, MAX_CHARS)
    if (!q || busy) return
    const ready = faqAnswer(q)
    // Zero-token filter: gibberish and off-topic questions are answered here, no request is sent.
    const lastSent = [...base].reverse().find((m) => m.send)
    const verdict = ready ? null : guard(q, lastSent?.kind === 'ai')
    // Rate limited: keep the typed question until the countdown ends (local answers still work).
    if (verdict?.ok && ENDPOINT && waitS > 0) return
    setShowFaq(false)
    setInput('')
    if (ready) {
      setMsgs([...base, { kind: 'user', content: q }, { kind: 'faq', content: ready }])
      return
    }
    if (verdict && !verdict.ok) {
      setMsgs([...base, { kind: 'user', content: q }, { kind: 'notice', content: verdict.reply }])
      return
    }
    const asked: Msg = { kind: 'user', content: q, send: true }
    const next: Msg[] = [...base, asked]
    // Errors and refusals are not kept in the history sent to the AI.
    const fail = (m: Msg) => setMsgs([...base, { ...asked, send: false }, m])
    if (!ENDPOINT) {
      fail({ kind: 'notice', content: 'The AI guide is offline. Try one of the suggested questions.' })
      setShowFaq(true)
      return
    }
    setMsgs(next)
    setBusy(true)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next
            .filter((m) => m.send)
            .slice(-4)
            .map((m) => ({ role: isAssistant(m) ? 'assistant' : 'user', content: m.content })),
        }),
      })
      const data: { reply?: string; error?: string; blocked?: boolean } = await res.json().catch(() => ({}))
      const reply = data.reply?.replace(/[`*]/g, '')
      if (reply && !data.blocked) setMsgs([...next, { kind: 'ai', content: reply, send: true }])
      else if (reply) fail({ kind: 'notice', content: reply })
      else if (res.status === 429) {
        const until = Date.now() + COOLDOWN_S * 1000
        setNow(Date.now())
        setWaitUntil(until)
        fail({ kind: 'error', content: data.error || 'Too many questions. Please wait a minute.' })
      } else {
        // 400 means the question itself was rejected: sending it again will not help.
        fail({ kind: 'error', content: data.error || 'Something went wrong. Please try again.', retry: res.status === 400 ? undefined : q })
      }
    } catch {
      fail({ kind: 'error', content: 'Network error. Please try again.', retry: q })
    } finally {
      setBusy(false)
    }
  }

  /** Resend the question of a failed request, dropping the failed pair. */
  function retry(i: number) {
    const q = msgs[i].retry
    if (!q) return
    void ask(q, msgs.slice(0, i - 1))
  }

  function clear() {
    setMsgs([])
    setInput('')
    setShowFaq(true)
    inputRef.current?.focus()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(input)
  }

  /** The sheet is modal: keep Tab inside it. The floating panel is not, so the map stays usable. */
  function onPanelKey(e: ReactKeyboardEvent) {
    if (!sheet || e.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled)')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (hidden) return null

  const placeholder = waitS > 0 ? `Wait ${waitS} s to ask again…` : 'Ask about a star…'
  const count = input.length

  return (
    <div className={`star-chat${sheet ? ' star-chat--sheet' : ''}`}>
      {open && sheet && <div className="star-chat__backdrop" aria-hidden onClick={close} />}
      {open && (
        <section
          ref={panelRef}
          id="star-chat-panel"
          className="star-chat__panel"
          role="dialog"
          aria-modal={sheet || undefined}
          aria-labelledby="star-chat-title"
          onKeyDown={onPanelKey}
        >
          <header className="star-chat__head">
            <div className="star-chat__heading">
              <h2 id="star-chat-title" className="star-chat__title">
                <Sparkles aria-hidden /> Star guide
              </h2>
              <p className="star-chat__sub">Quick facts and AI answers</p>
            </div>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="Clear chat"
              title="Clear chat"
              disabled={!msgs.length || busy}
              onClick={clear}
            >
              <RotateCcw aria-hidden />
            </button>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Close star guide" title="Close" onClick={close}>
              <X aria-hidden />
            </button>
          </header>

          <div className="star-chat__list" ref={listRef} aria-live="polite">
            <p className="star-chat__msg star-chat__msg--assistant">{GREETING}</p>
            {msgs.map((m, i) => (
              <ChatItem
                key={i}
                msg={m}
                viewing={viewing}
                onRetry={busy || waitS > 0 ? undefined : () => retry(i)}
                onOpen={sheet ? () => setOpen(false) : undefined}
              />
            ))}
            {busy && (
              <div className="star-chat__typing" role="status">
                <span className="star-chat__dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="star-chat__typing-text">Thinking…</span>
              </div>
            )}
            {showFaq && (
              <div className="star-chat__faq">
                <p className="star-chat__label" id="star-chat-suggested">
                  Suggested
                </p>
                <ul className="chip-list" aria-labelledby="star-chat-suggested">
                  {suggestions.map((f) => (
                    <li key={f.q}>
                      <button
                        type="button"
                        className={`chip${f.key === viewing ? ' star-chat__chip--current' : ''}`}
                        disabled={busy}
                        onClick={() => void ask(f.q)}
                      >
                        {f.q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <form className="star-chat__form" onSubmit={onSubmit}>
            <div className="star-chat__row">
              <button
                type="button"
                className="icon-btn"
                aria-label={showFaq ? 'Hide suggested questions' : 'Show suggested questions'}
                title={showFaq ? 'Hide suggestions' : 'Show suggestions'}
                aria-pressed={showFaq}
                onClick={() => setShowFaq(!showFaq)}
              >
                <Sparkles aria-hidden />
              </button>
              <input
                ref={inputRef}
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                maxLength={MAX_CHARS}
                aria-label="Your question"
                aria-describedby="star-chat-foot"
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="icon-btn star-chat__send"
                disabled={busy || waitS > 0 || !input.trim()}
                aria-label="Send"
                title="Send"
              >
                <Send aria-hidden />
              </button>
            </div>
            <p className="star-chat__foot" id="star-chat-foot">
              <span>{FOOTNOTE}</span>
              {count >= COUNT_FROM && (
                <span className={`star-chat__count num${count >= COUNT_WARN ? ' star-chat__count--warn' : ''}`}>
                  {count}/{MAX_CHARS}
                </span>
              )}
            </p>
          </form>
        </section>
      )}
      <button
        ref={fabRef}
        type="button"
        className="btn btn-primary star-chat__fab"
        aria-label={open ? 'Close star guide' : 'Open star guide'}
        title={open ? 'Close star guide' : 'Ask the star guide'}
        aria-expanded={open}
        aria-controls="star-chat-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? (
          <X aria-hidden />
        ) : (
          <svg className="star-chat__logo" viewBox="4 16 56 32" aria-hidden>
            <path
              d="M58.98,32.37C58.85,32.66 58.83,32.86 58.60,33.13C58.32,33.45 57.96,33.71 57.65,33.98C57.38,34.22 57.14,34.49 56.87,34.72C56.23,35.28 55.49,35.79 54.83,36.33C53.98,37.03 53.06,37.83 52.13,38.45C51.38,38.94 50.44,39.80 49.63,40.12C49.39,40.22 49.03,40.25 48.77,40.27C47.43,40.39 46.62,40.10 45.68,39.15C45.17,38.64 44.62,38.21 44.38,37.50C44.13,36.77 44.53,35.85 44.78,35.19C44.88,34.92 44.90,34.41 44.96,34.11C45.27,32.61 44.79,35.21 45.09,33.70C45.21,33.10 45.19,32.12 45.16,31.50C44.98,26.64 41.79,22.43 37.52,20.26C36.47,19.73 35.38,19.46 34.26,19.12C34.06,19.06 33.81,19.07 33.61,19.04C32.60,18.87 31.56,18.90 30.54,18.95C29.19,19.01 25.97,19.89 25.18,21.01C25.01,21.26 24.95,21.76 24.88,22.05C24.94,22.25 25.05,22.69 25.16,22.86C25.62,23.55 26.80,24.57 27.48,25.09C27.59,25.17 27.74,25.22 27.85,25.30C28.67,25.94 29.73,26.45 30.73,26.72C31.10,26.82 30.75,26.81 31.13,26.88C31.51,26.94 32.06,26.92 32.45,26.89C32.59,26.88 32.74,26.91 32.89,26.88C34.18,26.57 35.46,25.87 36.75,25.48C36.99,25.40 37.56,25.22 37.77,25.12C38.00,25.02 38.07,24.91 38.37,24.91C38.63,24.91 38.55,24.98 38.80,25.00C38.91,25.25 39.04,25.22 39.06,25.57C39.09,26.07 38.79,26.55 38.64,27.01C38.37,27.79 38.07,28.70 37.75,29.45C37.62,29.77 37.44,30.12 37.31,30.44C37.05,31.08 37.01,32.36 37.17,33.04C37.23,33.32 37.36,33.58 37.47,33.83C37.74,34.44 37.97,35.02 38.31,35.60C39.10,36.93 40.29,38.06 41.41,39.11C41.76,39.44 42.09,39.85 42.44,40.20C42.93,40.67 43.53,41.18 43.96,41.69C44.15,41.90 44.20,42.24 44.30,42.49C44.24,42.88 44.30,43.14 44.01,43.50C43.47,44.20 41.12,45.16 40.23,45.49C40.09,45.54 39.94,45.54 39.80,45.59C39.57,45.69 39.47,45.75 39.20,45.82C39.06,45.85 38.90,45.84 38.77,45.90C38.50,46.01 38.46,46.02 38.16,46.10C37.04,46.39 38.89,45.94 37.74,46.19C36.93,46.36 38.13,46.14 37.34,46.34C37.11,46.40 36.95,46.38 36.70,46.46C36.11,46.63 35.36,46.64 34.74,46.69C33.23,46.81 32.09,46.82 30.58,46.68C30.29,46.66 29.98,46.68 29.70,46.64C22.49,45.57 15.69,41.74 10.11,37.12C8.95,36.16 7.79,35.26 6.68,34.24C6.02,33.65 5.56,33.35 5.08,32.57C5.01,31.99 5.02,31.85 5.13,31.27C6.01,30.14 7.31,29.12 8.46,28.24C9.32,27.59 10.11,26.90 10.99,26.25C11.75,25.69 12.45,25.15 13.23,24.62C13.58,24.38 13.89,24.09 14.28,23.89C14.51,23.78 15.09,23.73 15.36,23.71C16.58,23.59 17.45,23.98 18.32,24.80C18.51,24.99 18.70,25.25 18.90,25.44C19.16,25.69 19.40,25.94 19.53,26.29C19.87,27.27 19.61,27.69 19.28,28.59C19.20,28.80 19.16,29.22 19.12,29.45C19.03,29.87 19.07,29.43 18.97,29.85C18.87,30.30 18.82,31.13 18.81,31.60C18.73,35.01 20.20,38.60 22.64,40.99C22.96,41.30 23.40,41.72 23.75,42.00C23.87,42.09 24.01,42.13 24.12,42.22C24.25,42.33 24.45,42.55 24.60,42.64C25.43,43.19 26.34,43.65 27.24,44.08C28.28,44.58 29.47,44.77 30.59,45.00C31.01,45.08 31.47,45.06 31.90,45.07C33.99,45.13 35.52,44.80 37.40,43.93C37.68,43.81 38.13,43.64 38.38,43.46C38.50,43.38 38.70,43.11 38.81,42.99C39.41,41.34 38.78,40.98 37.66,39.91C36.43,38.72 34.97,37.74 33.31,37.28C33.23,37.26 32.98,37.14 32.90,37.12C32.45,37.03 31.61,37.06 31.14,37.12C30.79,37.17 30.26,37.41 29.92,37.55C29.28,37.81 28.51,37.98 27.88,38.27C27.60,38.40 27.30,38.44 27.07,38.55C26.86,38.65 26.75,38.72 26.50,38.80C25.58,39.10 26.95,38.59 26.11,38.98C25.80,39.12 25.54,39.02 25.25,39.01C25.16,38.89 24.92,38.64 24.88,38.50C24.80,38.25 25.23,37.37 25.34,37.09C25.65,36.21 26.00,35.32 26.29,34.44C26.42,34.06 26.67,33.64 26.77,33.25C26.99,32.36 27.00,31.31 26.64,30.47C26.56,30.31 26.52,30.01 26.44,29.85C26.21,29.37 25.94,28.76 25.64,28.31C25.15,27.56 24.55,26.78 23.94,26.14C23.82,26.02 23.57,25.85 23.45,25.72C22.97,25.22 22.48,24.67 21.98,24.19C21.40,23.64 20.30,22.73 19.90,22.06C19.61,21.59 19.76,21.26 19.83,20.79C19.98,20.59 20.02,20.44 20.21,20.26C20.39,20.10 20.74,19.93 20.95,19.82C21.27,19.68 21.59,19.43 21.91,19.30C22.71,18.99 23.50,18.64 24.29,18.31C24.54,18.21 24.90,18.20 25.14,18.12C27.65,17.27 30.68,16.98 33.34,17.30C33.70,17.35 34.09,17.30 34.44,17.37C34.84,17.46 35.33,17.58 35.73,17.63C35.75,17.63 36.14,17.65 36.17,17.66C36.66,17.80 36.05,17.73 36.56,17.82C37.04,17.90 37.37,18.00 37.83,18.12C38.07,18.19 38.45,18.20 38.69,18.29C39.67,18.66 40.80,18.96 41.75,19.40C42.74,19.85 43.69,20.32 44.67,20.79C45.35,21.12 45.92,21.42 46.57,21.80C47.01,22.06 46.55,21.70 46.98,21.97C48.72,23.06 50.44,24.20 52.07,25.45C52.41,25.70 52.75,25.98 53.09,26.23C53.29,26.39 53.61,26.55 53.80,26.72C54.06,26.95 54.31,27.20 54.59,27.42C55.37,28.04 56.16,28.68 56.92,29.32C57.24,29.59 57.53,29.96 57.86,30.22C58.25,30.55 58.79,30.97 58.95,31.49C59.03,31.76 58.99,32.10 58.98,32.37Z"
              fill="#09090d"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

function ChatItem({
  msg,
  viewing,
  onRetry,
  onOpen,
}: {
  msg: Msg
  viewing?: TargetKey
  onRetry?: () => void
  /** Called when the visitor follows Open in The Eyes (the sheet closes so the page shows). */
  onOpen?: () => void
}) {
  if (msg.kind === 'user') return <p className="star-chat__msg star-chat__msg--user">{msg.content}</p>

  if (msg.kind === 'notice' || msg.kind === 'error') {
    const Icon = msg.kind === 'error' ? AlertTriangle : Info
    return (
      <div className={`star-chat__notice star-chat__notice--${msg.kind}`} role={msg.kind === 'error' ? 'alert' : undefined}>
        <Icon aria-hidden />
        <div>
          <p className="star-chat__msg">{msg.content}</p>
          {msg.retry && (
            <button type="button" className="btn btn-ghost btn-sm star-chat__retry" disabled={!onRetry} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  const target = targetIn(msg.content)
  return (
    <div className="star-chat__answer">
      <p className={`star-chat__tag star-chat__tag--${msg.kind}`}>
        {msg.kind === 'ai' ? <Sparkles aria-hidden /> : <span className="star-chat__dot" aria-hidden />}
        {msg.kind === 'ai' ? 'AI answer · may be wrong' : 'Quick answer'}
        <span className="sr-only">:</span>
      </p>
      <p className="star-chat__msg star-chat__msg--assistant">{msg.content}</p>
      {target && target !== viewing && (
        <Link className="btn btn-secondary btn-sm star-chat__open" to={`${PATHS.explorer}?q=${target}`} onClick={onOpen}>
          <Eye aria-hidden /> Open in The Eyes
        </Link>
      )}
    </div>
  )
}
