import {
  DSS_SURVEY,
  SPHEREX_SURVEY,
  spherexSurveyFromHipsLayer,
  SURVEY_MIRRORS,
  TWOMASS_MIRRORS,
  TWOMASS_SURVEY,
  WISE_MIRRORS,
  WISE_SURVEY,
  type HipsLayerInput,
  type SurveyInfo,
} from './surveys'

export type BackgroundMode = 'spherex' | 'wise' | 'twomass'

const DISCOVERY_MS = 4000
const ARCHIVE_METADATA_MS = 750
const CACHED_SOURCE_HEAD_START_MS = 600
const PRIMARY_CACHE_MS = 24 * 60 * 60 * 1000
const FALLBACK_CACHE_MS = 2 * 60 * 1000

const dssSurveys = SURVEY_MIRRORS.map((url) => ({ ...DSS_SURVEY, url }))
const primarySurveys = {
  spherex: [SPHEREX_SURVEY],
  wise: WISE_MIRRORS.map((url) => ({ ...WISE_SURVEY, url })),
  twomass: TWOMASS_MIRRORS.map((url) => ({ ...TWOMASS_SURVEY, url })),
}

interface SavedSurvey {
  url: string
  verifiedAt: number
  archive?: HipsLayerInput
}

const storageKey = (mode: BackgroundMode) => `spherex:hips-survey:v1:${mode}`

function readSavedSurvey(mode: BackgroundMode, allowed: SurveyInfo[]): SurveyInfo | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(mode)) ?? 'null') as SavedSurvey | null
    const configured = allowed.find((survey) => survey.url === saved?.url)
    if (!saved || !configured || !Number.isFinite(saved.verifiedAt)) return
    const age = Date.now() - saved.verifiedAt
    if (age < 0 || age >= (configured.key === 'dss2' ? FALLBACK_CACHE_MS : PRIMARY_CACHE_MS)) return
    return configured.key === 'spherex' && saved.archive
      ? spherexSurveyFromHipsLayer({ ...saved.archive, service_url: configured.url }, configured)
      : configured
  } catch {
    // Storage can be blocked or contain an older format.
    return undefined
  }
}

function saveSurvey(mode: BackgroundMode, survey: SurveyInfo, allowed: SurveyInfo[]) {
  // The backend can supply a custom source for this visit. Across visits, only reuse configured URLs.
  if (!allowed.some((candidate) => candidate.url === survey.url)) return
  const saved: SavedSurvey = { url: survey.url, verifiedAt: Date.now() }
  if (survey.fromArchive) {
    saved.archive = {
      layer_id: survey.id,
      title: survey.label,
      spectral_metadata: {
        credit: survey.credit,
        cube: survey.cube,
        cube_frames: survey.cubeDepth,
        em_min_m: survey.emMin,
        em_max_m: survey.emMax,
      },
    }
  }
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(saved))
  } catch {
    // Browsing without storage still works.
  }
}

function untilAborted(signal: AbortSignal): Promise<null> {
  if (signal.aborted) return Promise.resolve(null)
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(null), { once: true }))
}

async function within<T>(ms: number, parent: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  if (parent.aborted) return null
  const controller = new AbortController()
  const signal = AbortSignal.any([parent, controller.signal])
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await Promise.race([untilAborted(signal), run(signal)])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function hasProperties(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const base = new URL(url)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return false
    const response = await fetch(`${url}/properties`, { signal })
    if (!response.ok) return false
    const properties = await response.text()
    return /^hips_frame[ \t]*=[ \t]*\S+/m.test(properties) && /^hips_order[ \t]*=[ \t]*\d+[ \t]*\r?$/m.test(properties)
  } catch {
    return false
  }
}

export async function discoverSurvey(
  mode: BackgroundMode,
  cancellation: AbortSignal,
  loadArchive?: (signal: AbortSignal) => Promise<SurveyInfo>,
): Promise<SurveyInfo | null> {
  const allowed = [...primarySurveys[mode], ...dssSurveys]
  const cached = readSavedSurvey(mode, allowed)
  const controller = new AbortController()
  const signal = AbortSignal.any([cancellation, controller.signal])
  const done = untilAborted(signal)
  const timer = setTimeout(() => controller.abort(), DISCOVERY_MS)
  const probes = new Map<string, Promise<boolean | null>>()
  const verify = async (survey: SurveyInfo | null) => {
    if (!survey || signal.aborted) return null
    let reachable = probes.get(survey.url)
    if (!reachable) {
      reachable = Promise.race([done, hasProperties(survey.url, signal)])
      probes.set(survey.url, reachable)
    }
    return await reachable ? survey : null
  }

  try {
    if (cached) {
      const verified = await within(CACHED_SOURCE_HEAD_START_MS, signal, () => verify(cached))
      if (verified && !cancellation.aborted) return verified
    }
    if (signal.aborted) return cancellation.aborted ? null : DSS_SURVEY

    // Start all probes together, then consume their results in survey preference order.
    const archive = mode === 'spherex' && loadArchive
      ? within(ARCHIVE_METADATA_MS, signal, loadArchive).then(verify)
      : Promise.resolve(null)
    const candidates = [archive, ...allowed.map(verify)]
    for (const candidate of candidates) {
      const survey = await candidate
      if (cancellation.aborted) return null
      if (survey) {
        saveSurvey(mode, survey, allowed)
        return survey
      }
    }
    return DSS_SURVEY
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

export function isHipsTileDownload(
  entry: { name: string; startTime: number; responseStatus?: number },
  surveyUrl: string,
  appliedAt: number,
): boolean {
  const prefix = `${surveyUrl}/`
  const status = entry.responseStatus ?? 0
  return entry.startTime >= appliedAt && status >= 200 && status < 300 && entry.name.startsWith(prefix)
    && /^Norder\d+\/(?:Dir\d+\/Npix\d+(?:_\d+)?|Allsky(?:_\d+)?)\.(?:jpe?g|png|webp|fits(?:\.fz)?)(?:\?|$)/i.test(entry.name.slice(prefix.length))
}

export function observeFirstHipsTile(survey: SurveyInfo, startedAt: number): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) return
  const appliedAt = performance.now()
  const observer = new PerformanceObserver((list) => {
    const tile = (list.getEntries() as PerformanceResourceTiming[])
      .filter((entry) => isHipsTileDownload(entry, survey.url, appliedAt))
      .sort((a, b) => a.responseEnd - b.responseEnd)[0]
    if (tile) {
      stop()
      performance.measure('spherex:first-hips-tile-downloaded', {
        start: startedAt,
        end: tile.responseEnd,
        detail: { survey: survey.key },
      })
    }
  })
  const timer = setTimeout(stop, 30_000)
  function stop() {
    observer.disconnect()
    clearTimeout(timer)
  }
  observer.observe({ type: 'resource' })
  return stop
}
