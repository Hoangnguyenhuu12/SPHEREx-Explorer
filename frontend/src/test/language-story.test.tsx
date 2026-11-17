// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/session'
import { TransitionHost } from '../features/route-transition/TransitionHost'
import StoryPage from '../pages/StoryPage'
import { LANG_STORAGE_KEY, LanguageProvider } from '../shared/i18n/language'
import { OverlayProvider } from '../shared/layout/overlay'

vi.mock('../pages/story/ShootingStars', () => ({
  ShootingStars: () => null,
}))

describe('StoryPage EN/VI translation', () => {
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

  it('translates the entire Story page, diagrams, tables, targets, and TeamGrid between EN and VI', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root = createRoot(host)
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/story']}>
            <LanguageProvider>
              <AuthProvider>
                <OverlayProvider>
                  <TransitionHost>
                    <StoryPage />
                  </TransitionHost>
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
    expect(host.textContent).toContain('Watch the sky change, with NASA’s newest infrared telescope')
    expect(host.textContent).toContain('The science, in pictures')
    expect(host.textContent).toContain('Exposure 1')
    expect(host.textContent).toContain('Survey starts')

    await act(async () => {
      viBtn?.click()
    })

    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('vi')
    expect(document.documentElement.lang).toBe('vi')

    // Hero, breadcrumb & TOC
    expect(host.textContent).toContain('Ngắm bầu trời chuyển mình qua kính thiên văn hồng ngoại mới nhất của NASA')
    expect(host.textContent).toContain('bạn đang ở đây')
    expect(host.textContent).toContain('Bạn có thể làm gì tại đây')
    expect(host.textContent).toContain('Khoa học qua hình ảnh')
    expect(host.textContent).toContain('Đọc dữ liệu đúng cách')

    // Diagrams
    expect(host.textContent).toContain('Lần chụp 1')
    expect(host.textContent).toContain('bầu trời trôi ngang qua cảm biến')
    expect(host.textContent).toContain('T11/25')
    expect(host.textContent).toContain('Ngày đầu')
    expect(host.textContent).toContain('Phóng tàu')
    expect(host.textContent).toContain('Bắt đầu khảo sát')

    // Detectors, Targets & Team
    expect(host.textContent).toContain('Cận hồng ngoại')
    expect(host.textContent).toContain('Hồng ngoại nhiệt')
    expect(host.textContent).toContain("Sao Barnard (Barnard's Star)")
    expect(host.textContent).toContain('Sao lùn nâu siêu lạnh')
    expect(host.textContent).toContain('Chưa có kết quả đo')
    expect(host.textContent).toContain('Thiết kế giao diện và điều phối')
    expect(host.textContent).toContain('Bắt đầu: Quỹ đạo SPHEREx')

    await act(async () => {
      enBtn?.click()
    })

    expect(document.documentElement.lang).toBe('en')
    expect(host.textContent).toContain('Watch the sky change, with NASA’s newest infrared telescope')
    expect(host.textContent).toContain('Reading it honestly')
  })
})
