// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { TargetSearch } from '../features/target-search/TargetSearch'
import { LanguageProvider, LanguageSwitch } from '../shared/i18n/language'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('The Eyes language switch', () => {
  it('translates search without clearing typed input or triggering a search', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const submit = vi.fn()
    await act(async () => root.render(<LanguageProvider><LanguageSwitch /><TargetSearch value="Barnard" selectedKey={null} onSubmit={submit} onPreset={vi.fn()} /></LanguageProvider>))
    const input = host.querySelector<HTMLInputElement>('#target-search')!
    await act(async () => (host.querySelector('button[lang="vi"]') as HTMLButtonElement).click())
    expect(input.value).toBe('Barnard')
    expect(input.placeholder).toContain('Tên sao')
    expect(host.querySelector('.search__form button[type="submit"] .bi-slot__text')?.textContent).toBe('Tìm')
    expect(submit).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    host.remove()
    localStorage.clear()
  })
})
