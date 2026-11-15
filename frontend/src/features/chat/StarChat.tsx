import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { config } from '../../app/config'
import { FAQ, faqAnswer } from './faq'
import { guard } from './guard'
import './chat.css'

/** `ai`: answered by the AI. `skip`: answered locally (FAQ or filter); never sent to the server. */
type Msg = { role: 'user' | 'assistant'; content: string; ai?: boolean; skip?: boolean }

const ENDPOINT = config.starChatUrl
const MAX_CHARS = 400
const GREETING =
  "Hi! I'm the star guide. Pick a question below for an instant answer, or ask me anything about stars and astronomy."

/** Floating star-guide chat: instant ready-made answers, AI answers for everything else. */
export function StarChat() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showFaq, setShowFaq] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
  }, [msgs, busy, showFaq])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_CHARS)
    if (!q || busy) return
    setShowFaq(false)
    setInput('')
    const ready = faqAnswer(q)
    if (ready) {
      setMsgs([...msgs, { role: 'user', content: q, skip: true }, { role: 'assistant', content: ready, skip: true }])
      return
    }
    // Zero-token filter: gibberish and off-topic questions are answered here, no request is sent.
    const lastAi = [...msgs].reverse().find((m) => !m.skip)
    const verdict = guard(q, lastAi?.role === 'assistant' && lastAi.ai === true)
    if (!verdict.ok) {
      setMsgs([...msgs, { role: 'user', content: q, skip: true }, { role: 'assistant', content: verdict.reply, skip: true }])
      return
    }
    const next: Msg[] = [...msgs, { role: 'user', content: q }]
    if (!ENDPOINT) {
      setMsgs([...next, { role: 'assistant', content: 'The AI guide is offline. Try one of the suggested questions.', skip: true }])
      return
    }
    setMsgs(next)
    setBusy(true)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m) => !m.skip).slice(-4).map(({ role, content }) => ({ role, content })),
        }),
      })
      const data: { reply?: string; error?: string; blocked?: boolean } = await res.json().catch(() => ({}))
      const reply = data.reply?.replace(/[`*]/g, '')
      setMsgs(
        reply && !data.blocked
          ? [...next, { role: 'assistant', content: reply, ai: true }]
          : // Errors and refusals are not kept in the history sent to the AI.
            [...next.slice(0, -1), { ...next.at(-1)!, skip: true }, { role: 'assistant', content: reply || data.error || 'Something went wrong. Please try again.', skip: true }],
      )
    } catch {
      setMsgs([...next.slice(0, -1), { ...next.at(-1)!, skip: true }, { role: 'assistant', content: 'Network error. Please try again.', skip: true }])
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(input)
  }

  return (
    <div className="star-chat">
      {open && (
        <section className="star-chat__panel" role="dialog" aria-label="Star guide">
          <header className="star-chat__head">
            <h2 className="star-chat__title">Star guide</h2>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Close star guide" onClick={() => setOpen(false)}>
              <X aria-hidden />
            </button>
          </header>

          <div className="star-chat__list" ref={listRef} aria-live="polite">
            <p className="star-chat__msg star-chat__msg--assistant">{GREETING}</p>
            {msgs.map((m, i) => (
              <p key={i} className={`star-chat__msg star-chat__msg--${m.role}`}>
                {m.content}
              </p>
            ))}
            {busy && (
              <p className="star-chat__msg star-chat__msg--assistant star-chat__typing" role="status">
                Thinking…
              </p>
            )}
            {showFaq && (
              <ul className="chip-list star-chat__faq" aria-label="Suggested questions">
                {FAQ.map((f) => (
                  <li key={f.q}>
                    <button type="button" className="chip" onClick={() => void ask(f.q)}>
                      {f.q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="star-chat__form" onSubmit={onSubmit}>
            <button
              type="button"
              className="icon-btn"
              aria-label={showFaq ? 'Hide suggested questions' : 'Show suggested questions'}
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
              placeholder="Ask about a star…"
              maxLength={MAX_CHARS}
              aria-label="Your question"
            />
            <button type="submit" className="icon-btn star-chat__send" disabled={busy || !input.trim()} aria-label="Send">
              <Send aria-hidden />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="btn btn-primary star-chat__fab"
        aria-label={open ? 'Close star guide' : 'Open star guide'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X aria-hidden /> : <MessageCircle aria-hidden />}
      </button>
    </div>
  )
}
