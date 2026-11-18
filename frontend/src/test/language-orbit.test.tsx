// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WhereAreYouPage from '../pages/WhereAreYouPage'
import { LanguageProvider, LanguageSwitch } from '../shared/i18n/language'

vi.mock('../shared/layout/Shell', () => ({ SiteHeader: () => <LanguageSwitch />, NavDrawer: () => null, SiteFooter: () => null }))
vi.mock('../features/route-transition/TransitionHost', () => ({ useRouteTransition: () => ({ phase: 'idle', launch: vi.fn() }) }))
vi.mock('../features/earth-scene/webgl', () => ({ webglAvailable: () => true }))
vi.mock('../features/artwork/StarfieldCanvas', () => ({ StarfieldCanvas: () => null }))
vi.mock('../features/earth-scene/EarthScene', () => ({ default: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }))
vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => localStorage.clear())

describe('Orbit language switching', () => {
  it('translates both views, controls, labels and the accessible scene description', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(<LanguageProvider><WhereAreYouPage /></LanguageProvider>))
    const visible = () => [...host.querySelectorAll('.where__stable-text > span:first-child')].map((e) => e.textContent)
    expect(visible()).toContain('SPHEREx in Orbit')
    await act(async () => (host.querySelector('button[lang="vi"]') as HTMLButtonElement).click())
    expect(visible()).toContain('SPHEREx trên quỹ đạo')
    expect(visible()).toContain('Đến Trái Đất và SPHEREx')
    expect(host.querySelector('.where__label--center')?.textContent).toBe('Mặt Trời')
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Mặt Trời')
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.where__actions button')][1].click())
    expect(visible()).toContain('Xem Hệ Mặt Trời')
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Trái Đất tự quay')
    await act(async () => root.unmount())
    host.remove()
  })
})
