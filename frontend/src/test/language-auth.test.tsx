// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthForm } from '../features/auth/AuthForm'
import { LanguageProvider, LanguageSwitch } from '../shared/i18n/language'

vi.mock('../features/auth/session', () => ({ useSession: () => ({ logIn: vi.fn() }) }))
vi.mock('../features/auth/authService', () => ({ AuthServiceError: class extends Error {}, logIn: vi.fn(), signUp: vi.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('authentication language switching', () => {
  it.each(['login', 'signup'] as const)('translates the %s form and existing errors without clearing input', async (mode) => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(<MemoryRouter><LanguageProvider><LanguageSwitch /><AuthForm mode={mode} /></LanguageProvider></MemoryRouter>))
    const email = host.querySelector<HTMLInputElement>('input[name="email"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(email, 'bad-email'); email.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => host.querySelector('form')!.requestSubmit())
    expect(email.getAttribute('aria-invalid')).toBe('true')
    await act(async () => (host.querySelector('button[lang="vi"]') as HTMLButtonElement).click())
    expect(email.value).toBe('bad-email')
    expect(host.querySelector('.auth-field__error span:not([aria-hidden])')?.textContent).toContain('email hợp lệ')
    expect(host.querySelector('.auth-card__title .auth-copy > span:first-child')?.textContent).toBe(mode === 'login' ? 'Chào mừng bạn trở lại' : 'Tạo tài khoản của bạn')
    if (mode === 'signup') expect(host.querySelector('.auth-rules')?.getAttribute('aria-label')).toBe('Yêu cầu mật khẩu')
    await act(async () => root.unmount())
    host.remove()
    localStorage.clear()
  })
})
