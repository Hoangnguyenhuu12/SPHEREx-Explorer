// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/session'
import LandingPage from '../pages/LandingPage'
import { LANG_STORAGE_KEY, LanguageProvider, readLanguage, writeLanguage } from '../shared/i18n/language'
import { OverlayProvider } from '../shared/layout/overlay'

vi.mock('../features/artwork/StarfieldCanvas', () => ({
  StarfieldCanvas: ({ className }: { className?: string }) => <div data-testid="starfield" className={className} />,
}))
vi.mock('../features/artwork/CraftGuide', () => ({
  CraftGuide: () => null,
}))

describe('EN/VI language switch and Home translation', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'en'
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    root = null
    host.remove()
  })

  it('defaults to EN and persists EN/VI choices safely', () => {
    expect(readLanguage()).toBe('en')
    localStorage.setItem(LANG_STORAGE_KEY, 'fr')
    expect(readLanguage()).toBe('en')
    writeLanguage('vi')
    expect(readLanguage()).toBe('vi')
  })

  it('renders LanguageSwitch in Landing header and translates the full Home page to Vietnamese and back', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root = createRoot(host)
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <LanguageProvider>
              <AuthProvider>
                <OverlayProvider>
                  <LandingPage />
                </OverlayProvider>
              </AuthProvider>
            </LanguageProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })

    const enBtn = host.querySelector<HTMLButtonElement>('button[lang="en"]')
    const viBtn = host.querySelector<HTMLButtonElement>('button[lang="vi"]')
    expect(enBtn?.getAttribute('aria-pressed')).toBe('true')
    expect(viBtn?.getAttribute('aria-pressed')).toBe('false')
    expect(host.textContent).toContain('The eyes of the galaxy')
    expect(host.textContent).toContain('How it works')
    expect(host.textContent).toContain('About us')
    expect(host.textContent).toContain('See the sky move')
    expect(host.textContent).toContain('Log in')
    expect(host.textContent).toContain('Sign up')

    await act(async () => {
      viBtn?.click()
    })

    expect(document.documentElement.lang).toBe('vi')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('vi')
    expect(viBtn?.getAttribute('aria-pressed')).toBe('true')
    expect(enBtn?.getAttribute('aria-pressed')).toBe('false')

    // Header navigation & account buttons
    expect(host.textContent).toContain('Trang chủ')
    expect(host.textContent).toContain('Câu chuyện')
    expect(host.textContent).toContain('Quỹ đạo SPHEREx')
    expect(host.textContent).toContain('Đôi mắt')
    expect(host.textContent).toContain('Diễn đàn')
    expect(host.textContent).toContain('Đăng nhập')
    expect(host.textContent).toContain('Đăng ký')

    // All 4 Home sections
    expect(host.textContent).toContain('Đôi mắt của thiên hà')
    expect(host.textContent).toContain('Xem sao lùn nâu chuyển động')
    expect(host.textContent).toContain('Khám phá bầu trời')
    expect(host.textContent).toContain('Đọc câu chuyện')
    expect(host.textContent).toContain('Cách hoạt động')
    expect(host.textContent).toContain('Chọn một mục tiêu')
    expect(host.textContent).toContain('Về chúng tôi')
    expect(host.textContent).toContain('Thiết kế giao diện và điều phối')
    expect(host.textContent).toContain('Ngắm bầu trời chuyển động')

    // Footer
    expect(host.textContent).toContain('Dự án độc lập sử dụng dữ liệu NASA SPHEREx.')
    expect(host.textContent).toContain('Không trực thuộc và không được bảo trợ bởi NASA.')

    await act(async () => {
      enBtn?.click()
    })

    expect(document.documentElement.lang).toBe('en')
    expect(host.textContent).toContain('The eyes of the galaxy')
  })
})
