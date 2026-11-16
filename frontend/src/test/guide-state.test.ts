// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuideTour, type TourStep } from '../features/guide/guide'
import { readGuide, writeGuide } from '../features/guide/guide-state'

function makeRect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('guide state', () => {
  beforeEach(() => localStorage.clear())

  it('starts on for a first visit', () => {
    expect(readGuide('')).toBe(true)
  })

  it('remembers the last choice', () => {
    writeGuide(false)
    expect(readGuide('?q=barnard')).toBe(false)
    writeGuide(true)
    expect(readGuide('')).toBe(true)
  })

  it('lets the URL win over the saved choice', () => {
    writeGuide(false)
    expect(readGuide('?guide=1')).toBe(true)
    writeGuide(true)
    expect(readGuide('?guide=0')).toBe(false)
  })
})

describe('GuideTour spotlight positioning', () => {
  let host: HTMLDivElement
  let fixture: HTMLDivElement
  let root: Root
  let observer: MutationObserver | null = null

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    fixture = document.createElement('div')
    host = document.createElement('div')
    document.body.append(fixture, host)
    root = createRoot(host)
  })

  afterEach(async () => {
    observer?.disconnect()
    observer = null
    await act(async () => root.unmount())
    fixture.remove()
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('scrolls .popup__body synchronously before positioning .tour__ring on Next', async () => {
    const popup = document.createElement('aside')
    popup.className = 'popup'
    const body = document.createElement('div')
    body.className = 'popup__body'
    const detectors = document.createElement('div')
    detectors.setAttribute('data-tour', 'detectors')
    const markers = document.createElement('div')
    markers.setAttribute('data-tour', 'markers')
    body.append(detectors, markers)
    popup.append(body)
    fixture.append(popup)

    let scrollTopVal = 0
    Object.defineProperty(body, 'scrollTop', {
      get: () => scrollTopVal,
      set: (v: number) => {
        scrollTopVal = v
      },
      configurable: true,
    })

    popup.getBoundingClientRect = () => makeRect(20, 10, 400, 400)
    body.getBoundingClientRect = () => makeRect(80, 10, 400, 300)
    detectors.getBoundingClientRect = () => makeRect(120 - scrollTopVal, 20, 180, 32)
    markers.getBoundingClientRect = () => makeRect(620 - scrollTopVal, 20, 220, 40)

    const steps: TourStep[] = [
      { anchors: ['detectors'], needsTarget: true, title: 'Step 1', body: 'Detectors' },
      { anchors: ['markers'], needsTarget: true, title: 'Step 2', body: 'Markers' },
    ]

    await act(async () => {
      root.render(
        createElement(GuideTour, {
          steps,
          hasTarget: true,
          ensureTarget: () => {},
          onClose: () => {},
        }),
      )
    })

    const initialRing = document.body.querySelector<HTMLElement>('.tour__ring')
    expect(initialRing).not.toBeNull()
    expect(parseFloat(initialRing!.style.top)).toBe(114)

    const recordedRingTops: number[] = []
    observer = new MutationObserver(() => {
      const ringEl = document.body.querySelector<HTMLElement>('.tour__ring')
      if (ringEl?.style.top) recordedRingTops.push(parseFloat(ringEl.style.top))
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true })

    const nextBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next')!
    await act(async () => {
      nextBtn.click()
    })

    expect(scrollTopVal).toBe(410)
    const updatedRing = document.body.querySelector<HTMLElement>('.tour__ring')
    expect(updatedRing).not.toBeNull()
    expect(parseFloat(updatedRing!.style.top)).toBe(204)
    expect(recordedRingTops).toContain(204)
    expect(recordedRingTops).not.toContain(614)
  })
})
