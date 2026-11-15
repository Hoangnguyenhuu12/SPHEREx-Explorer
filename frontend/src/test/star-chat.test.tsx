// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAQ, faqAnswer } from '../features/chat/faq'
import { StarChat } from '../features/chat/StarChat'
import { TARGETS } from '../shared/config/targets'

vi.mock('../app/config', () => ({
  config: { starChatUrl: 'https://example.supabase.co/functions/v1/star-chat' },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const fetchMock = vi.fn()

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const $ = (sel: string) => host.querySelector(sel) as HTMLElement | null
const messages = () => [...host.querySelectorAll('.star-chat__msg')].map((m) => m.textContent)

function openChat() {
  act(() => root.render(<StarChat />))
  act(() => $('.star-chat__fab')!.click())
}

async function type(text: string) {
  const input = $('input[aria-label="Your question"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    ;($('.star-chat__form') as HTMLFormElement).requestSubmit()
  })
}

describe('FAQ', () => {
  it('has one ready-made question for each of the five targets', () => {
    expect(FAQ).toHaveLength(5)
    const text = FAQ.map((f) => `${f.q} ${f.a}`).join(' ').toLowerCase()
    for (const t of ['barnard', 'wise 0855', 'epsilon indi', 'rw aurigae', 'r draconis']) expect(text).toContain(t)
    expect(TARGETS).toHaveLength(5)
  })

  it('matches typed questions loosely (case and punctuation)', () => {
    expect(faqAnswer('what is wise 0855')).toBe(FAQ[1].a)
    expect(faqAnswer('Tell me a joke')).toBeUndefined()
  })
})

describe('StarChat', () => {
  it('opens with a greeting and suggested questions', () => {
    openChat()
    expect($('[role="dialog"]')).not.toBeNull()
    expect(host.querySelectorAll('.star-chat__faq .chip')).toHaveLength(FAQ.length)
  })

  it('answers a suggested question instantly without calling the API', async () => {
    openChat()
    await act(async () => (host.querySelector('.star-chat__faq .chip') as HTMLButtonElement).click())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(messages()).toContain(FAQ[0].a)
  })

  it('sends free questions to the edge function without any key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ reply: 'A light-year is a distance.' })))
    openChat()
    await type('What is a light-year?')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/star-chat')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'What is a light-year?' }] })
    expect(messages()).toContain('A light-year is a distance.')
  })

  it('caps the question length and the history it sends', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ reply: 'ok' })))
    openChat()
    for (let i = 0; i < 4; i++) await type(`Why do stars shine ${i}? ${'Tell me more. '.repeat(50)}`)
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body)
    expect(body.messages.length).toBeLessThanOrEqual(4)
    for (const m of body.messages) expect(m.content.length).toBeLessThanOrEqual(400)
  })

  it('shows the server error message, and a network error when offline', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Too many questions. Please wait a minute.' }), { status: 429 }))
    openChat()
    await type('Why do stars twinkle?')
    expect(messages()).toContain('Too many questions. Please wait a minute.')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await type('Why is the sky dark?')
    expect(messages()).toContain('Network error. Please try again.')
  })
})

describe('faqAnswer (no-token shortcuts)', () => {
  it.each([
    ['Tell me about Barnard’s Star', 0],
    ["what's barnard's star?", 0],
    ['WISE 0855 là gì?', 1],
    ['Giới thiệu về Epsilon Indi B', 2],
    ['RW Aur', 3],
    ['explain R Dra please', 4],
  ])('%s', (q, i) => {
    expect(faqAnswer(q)).toBe(i >= 0 ? FAQ[i].a : undefined)
  })

  it('leaves specific or mixed questions to the AI', () => {
    expect(faqAnswer('How far is Barnard star from WISE 0855?')).toBeUndefined()
    expect(faqAnswer('What is the temperature of R Dra in kelvin?')).toBeUndefined()
    expect(faqAnswer('What is a black hole?')).toBeUndefined()
  })
})
