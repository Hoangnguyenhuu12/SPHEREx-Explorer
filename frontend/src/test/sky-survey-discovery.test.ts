// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverSurvey, isHipsTileDownload } from '../features/sky-map/survey-discovery'
import { DSS_SURVEY, SPHEREX_SURVEY, WISE_MIRRORS } from '../features/sky-map/surveys'

const properties = 'hips_frame = equatorial\nhips_order = 8\nhips_tile_format = fits'
const pending = () => new Promise<Response>(() => {})
const ok = () => new Response(properties)
const failure = () => new Response(null, { status: 503 })
const propertyUrl = (base: string) => `${base}/properties`

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HiPS discovery', () => {
  it('starts properties discovery while archive metadata is pending, then keeps the archive metadata', async () => {
    const fetch = vi.fn(async (_url: string) => ok())
    vi.stubGlobal('fetch', fetch)
    const archiveSurvey = { ...SPHEREX_SURVEY, label: 'Title from the archive', fromArchive: true }
    let completeArchive!: (value: typeof archiveSurvey) => void
    const loadArchive = vi.fn(() => new Promise<typeof archiveSurvey>((resolve) => { completeArchive = resolve }))
    const result = discoverSurvey('spherex', new AbortController().signal, loadArchive)
    expect(fetch.mock.calls.map(([url]) => url)).toContain(propertyUrl(SPHEREX_SURVEY.url))
    completeArchive(archiveSurvey)
    expect(await result).toEqual(archiveSurvey)
    expect(fetch.mock.calls.filter(([url]) => url === propertyUrl(SPHEREX_SURVEY.url))).toHaveLength(1)

    fetch.mockClear()
    loadArchive.mockClear()
    expect(await discoverSurvey('spherex', new AbortController().signal, loadArchive)).toEqual(archiveSurvey)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([propertyUrl(SPHEREX_SURVEY.url)])
    expect(loadArchive).not.toHaveBeenCalled()
  })

  it('revalidates the saved mirror first and moves to another mirror when it fails', async () => {
    const fetch = vi.fn(async (url: string) => url === propertyUrl(WISE_MIRRORS[1]) ? ok() : failure())
    vi.stubGlobal('fetch', fetch)
    expect((await discoverSurvey('wise', new AbortController().signal))?.url).toBe(WISE_MIRRORS[1])

    fetch.mockClear().mockImplementation(async (url) => url === propertyUrl(WISE_MIRRORS[0]) ? ok() : failure())
    expect((await discoverSurvey('wise', new AbortController().signal))?.url).toBe(WISE_MIRRORS[0])
    expect(fetch.mock.calls[0][0]).toBe(propertyUrl(WISE_MIRRORS[1]))
    expect(fetch.mock.calls.filter(([url]) => url === propertyUrl(WISE_MIRRORS[1]))).toHaveLength(1)
  })

  it('ignores stored URLs outside the configured list and skips archive metadata for WISE', async () => {
    localStorage.setItem('spherex:hips-survey:v1:wise', JSON.stringify({ url: 'https://example.com/other', verifiedAt: Date.now() }))
    const fetch = vi.fn(async (_url: string) => ok())
    vi.stubGlobal('fetch', fetch)
    const loadArchive = vi.fn(async () => SPHEREX_SURVEY)
    expect((await discoverSurvey('wise', new AbortController().signal, loadArchive))?.url).toBe(WISE_MIRRORS[0])
    expect(fetch.mock.calls.some(([url]) => url.includes('example.com'))).toBe(false)
    expect(loadArchive).not.toHaveBeenCalled()
  })

  it('allows a slower primary to win over a fast optical fallback', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((url: string) => url === propertyUrl(SPHEREX_SURVEY.url)
      ? new Promise<Response>((resolve) => setTimeout(() => resolve(ok()), 900))
      : Promise.resolve(ok())))
    const result = discoverSurvey('spherex', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(900)
    expect((await result)?.url).toBe(SPHEREX_SURVEY.url)
  })

  it('uses a verified optical fallback within one deadline when all WISE mirrors stall', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      signals.push(init.signal!)
      return url === propertyUrl(DSS_SURVEY.url) ? Promise.resolve(ok()) : pending()
    }))
    const result = discoverSurvey('wise', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await result).toEqual(DSS_SURVEY)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('aborts pending discovery on mode change or unmount without caching a fallback', async () => {
    const fetch = vi.fn(pending)
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const result = discoverSurvey('spherex', controller.signal)
    controller.abort()
    expect(await result).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('falls back on a successful HTTP response that is not HiPS properties', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === propertyUrl(SPHEREX_SURVEY.url)
      ? new Response('<html>Proxy error</html>')
      : ok()))
    expect(await discoverSurvey('spherex', new AbortController().signal)).toEqual(DSS_SURVEY)
  })
})

describe('HiPS timing', () => {
  const tile = `${SPHEREX_SURVEY.url}/Norder3/Dir0/Npix317_93.fits`

  it('matches only successful image resources from the applied survey and load', () => {
    expect(isHipsTileDownload({ name: tile, startTime: 100, responseStatus: 200 }, SPHEREX_SURVEY.url, 90)).toBe(true)
    expect(isHipsTileDownload({ name: tile, startTime: 100, responseStatus: 404 }, SPHEREX_SURVEY.url, 90)).toBe(false)
    expect(isHipsTileDownload({ name: tile, startTime: 100, responseStatus: 0 }, SPHEREX_SURVEY.url, 90)).toBe(false)
    expect(isHipsTileDownload({ name: tile, startTime: 80, responseStatus: 200 }, SPHEREX_SURVEY.url, 90)).toBe(false)
    expect(isHipsTileDownload({ name: tile, startTime: 100, responseStatus: 200 }, DSS_SURVEY.url, 90)).toBe(false)
    expect(isHipsTileDownload({ name: propertyUrl(SPHEREX_SURVEY.url), startTime: 100, responseStatus: 200 }, SPHEREX_SURVEY.url, 90)).toBe(false)
  })
})
