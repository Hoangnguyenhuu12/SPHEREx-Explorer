import { AlertTriangle, Eye, Info, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react'
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
        {open ? <X aria-hidden /> : <MessageCircle aria-hidden />}
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
