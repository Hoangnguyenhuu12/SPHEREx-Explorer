// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAQ, faqAnswer, targetIn } from '../features/chat/faq'
import { StarChat } from '../features/chat/StarChat'
import { TARGETS } from '../shared/config/targets'

vi.mock('../app/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app/config')>()),
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
const tags = () => [...host.querySelectorAll('.star-chat__tag')].map((t) => t.textContent?.replace(':', ''))
const button = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined
const firstChip = () => host.querySelector('.star-chat__faq .chip') as HTMLButtonElement
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status })

function render(path = '/') {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <StarChat />
      </MemoryRouter>,
    ),
  )
}

function openChat(path = '/') {
  render(path)
  act(() => $('.star-chat__fab')!.click())
}

function setInput(text: string) {
  const input = $('input[aria-label="Your question"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}

async function type(text: string) {
  setInput(text)
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
    expect(FAQ.map((f) => f.key).sort()).toEqual(TARGETS.map((t) => t.key).sort())
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
    expect($('.star-chat__foot')?.textContent).toMatch(/AI answers may be wrong/)
  })

  it('answers a suggested question instantly without calling the API', async () => {
    openChat()
    await act(async () => firstChip().click())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(messages()).toContain(FAQ[0].a)
  })

  it('sends free questions to the edge function without any key', async () => {
    fetchMock.mockResolvedValue(reply({ reply: 'A light-year is a distance.' }))
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
    fetchMock.mockImplementation(async () => reply({ reply: 'ok' }))
    openChat()
    for (let i = 0; i < 4; i++) await type(`Why do stars shine ${i}? ${'Tell me more. '.repeat(50)}`)
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body)
    expect(body.messages.length).toBeLessThanOrEqual(4)
    for (const m of body.messages) expect(m.content.length).toBeLessThanOrEqual(400)
    // Alternating turns that end with the new question.
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['assistant', 'user', 'assistant', 'user'])
  })

  it('shows the server error message and locks sending for 30 s when rate limited', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'Too many questions. Please wait a minute.' }, 429))
    openChat()
    await type('Why do stars twinkle?')
    expect(messages()).toContain('Too many questions. Please wait a minute.')
    expect(button('Try again')).toBeUndefined()
    const input = $('input[aria-label="Your question"]') as HTMLInputElement
    expect(input.placeholder).toMatch(/^Wait 30 s/)
    await type('Why is the sky dark?')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(input.value).toBe('Why is the sky dark?')
    // Ready-made answers still work while locked.
    await type('What is R Draconis?')
    expect(messages()).toContain(FAQ[4].a)
  })

  it('offers Try again after a network error and resends the same question', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    openChat()
    await type('Why is the sky dark?')
    expect(messages()).toContain('Network error. Please try again.')
    expect($('.star-chat__notice--error')?.getAttribute('role')).toBe('alert')
    fetchMock.mockResolvedValueOnce(reply({ reply: 'Because the universe is not infinitely old.' }))
    await act(async () => button('Try again')!.click())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ messages: [{ role: 'user', content: 'Why is the sky dark?' }] })
    expect(messages().slice(1)).toEqual(['Why is the sky dark?', 'Because the universe is not infinitely old.'])
  })

  it('offers Try again when the AI is busy (503)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'The star guide is busy right now. Please try again in a moment.' }, 503))
    openChat()
    await type('How hot is the Sun?')
    expect(button('Try again')).toBeDefined()
  })

  it('tags each answer with where it came from', async () => {
    fetchMock.mockResolvedValue(reply({ reply: 'A light-year is a distance.' }))
    openChat()
    await act(async () => firstChip().click())
    await type('What is a light-year?')
    expect(tags()).toEqual(['Quick answer', 'AI answer · may be wrong'])
  })

  it('shows refusals as notices without a tag, and sends nothing', async () => {
    openChat()
    await type('Write my history essay')
    expect(fetchMock).not.toHaveBeenCalled()
    expect($('.star-chat__notice--notice')?.textContent).toMatch(/only answer questions about stars/)
    expect(tags()).toEqual([])
  })

  it('links an answer about one target to The Eyes', async () => {
    openChat()
    await act(async () => firstChip().click())
    expect($('.star-chat__open')?.getAttribute('href')).toBe('/the-eyes?q=barnard')
  })

  it('puts the target on screen first in The Eyes and does not link to it again', async () => {
    openChat('/the-eyes?q=rdra')
    const first = firstChip()
    expect(first.textContent).toBe('What is R Draconis?')
    expect(first.classList).toContain('star-chat__chip--current')
    await act(async () => first.click())
    expect($('.star-chat__open')).toBeNull()
  })

  it('clears the conversation and brings the suggestions back', async () => {
    openChat()
    const clearBtn = $('button[aria-label="Clear chat"]') as HTMLButtonElement
    expect(clearBtn.disabled).toBe(true)
    await act(async () => firstChip().click())
    expect(host.querySelector('.star-chat__faq')).toBeNull()
    act(() => clearBtn.click())
    expect(messages()).toHaveLength(1)
    expect(host.querySelectorAll('.star-chat__faq .chip')).toHaveLength(FAQ.length)
  })

  it('counts characters near the limit', () => {
    openChat()
    setInput('x'.repeat(100))
    expect($('.star-chat__count')).toBeNull()
    setInput('x'.repeat(390))
    expect($('.star-chat__count')?.textContent).toBe('390/400')
    expect($('.star-chat__count')?.classList).toContain('star-chat__count--warn')
  })

  it('closes on Escape and gives focus back to the launcher', () => {
    openChat()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect($('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe($('.star-chat__fab'))
  })

  it.each(['/login', '/signup', '/the-eyes?q=barnard&embed=1'])('is not shown on %s', (path) => {
    render(path)
    expect($('.star-chat')).toBeNull()
  })
})

describe('targetIn', () => {
  it('finds the one target a text talks about', () => {
    expect(FAQ.map((f) => targetIn(f.a))).toEqual(FAQ.map((f) => f.key))
    expect(targetIn('How far is Barnard star from WISE 0855?')).toBeUndefined()
    expect(targetIn('A light-year is a distance.')).toBeUndefined()
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
