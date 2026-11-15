import { createContext, useContext } from 'react'

const GUIDE_KEY = 'spherex-explorer.guide.v1'

/** `?guide=1|0` wins over the saved choice; a first visit starts with the guide on. */
export function readGuide(search: string): boolean {
  const q = new URLSearchParams(search).get('guide')
  if (q === '1' || q === 'on') return true
  if (q === '0' || q === 'off') return false
  try {
    const saved = localStorage.getItem(GUIDE_KEY)
    return saved === null ? true : saved === 'on'
  } catch {
    return true
  }
}

export function writeGuide(on: boolean): void {
  try {
    localStorage.setItem(GUIDE_KEY, on ? 'on' : 'off')
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
}

const GuideContext = createContext(false)
export const GuideProvider = GuideContext.Provider
export const useGuide = () => useContext(GuideContext)
