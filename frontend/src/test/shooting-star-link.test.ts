// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PATHS } from '../app/config'
import { TransitionHost } from '../features/route-transition/TransitionHost'
import { ShootingStarLink } from '../pages/story/ShootingStarLink'
import { isPlainLeftClick } from '../pages/story/star-click'

const click = (over: Partial<Parameters<typeof isPlainLeftClick>[0]> = {}, target: string | null = null) =>
  isPlainLeftClick({
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    currentTarget: { getAttribute: () => target },
    ...over,
  })

describe('isPlainLeftClick', () => {
  it('accepts a plain left click', () => {
    expect(click()).toBe(true)
    expect(click({}, '_self')).toBe(true)
  })

  it('leaves modified, middle and new-tab clicks to the browser', () => {
    expect(click({ ctrlKey: true })).toBe(false)
    expect(click({ metaKey: true })).toBe(false)
    expect(click({ shiftKey: true })).toBe(false)
    expect(click({ altKey: true })).toBe(false)
    expect(click({ button: 1 })).toBe(false)
    expect(click({}, '_blank')).toBe(false)
  })
})

describe('ShootingStarLink', () => {
  let host: HTMLDivElement

  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // jsdom has no matchMedia; motion's useReducedMotion reads it.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => host?.remove())

  it('is a real link to Where are you', async () => {
    host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(TransitionHost, null, createElement(ShootingStarLink, { hint: 'h' }))),
      )
    })
    const a = host.querySelector('a.star-link')
    expect(a?.getAttribute('href')).toBe(PATHS.entry)
    expect(a?.textContent).toContain('Where are you?')
    await act(async () => root.unmount())
  })
})
