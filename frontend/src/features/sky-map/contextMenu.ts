import { DR1_MAP_MJD, mapPosition } from '../../shared/config/epoch'
import { computePlanetPositions } from '../../shared/config/planets'
import { TARGETS } from '../../shared/config/targets'

const SIMBAD_TAP_URL = 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync'
const SIMBAD_TIMEOUT_MS = 12000

export interface SkyPoint {
  ra: number
  dec: number
}

// oxlint-disable-next-line typescript/no-explicit-any
type AladinInstance = any

export interface ContextMenuItem {
  label?: string | { content?: string; [k: string]: unknown }
  subMenu?: ContextMenuItem[]
  action?: (...args: unknown[]) => unknown
  [k: string]: unknown
}

export interface SimbadMatch {
  mainId: string
  ra: number
  dec: number
  otype: string | null
  distArcsec: number
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function angularSeparationArcsec(ra1Deg: number, dec1Deg: number, ra2Deg: number, dec2Deg: number): number {
  const toRad = Math.PI / 180
  const ra1 = ra1Deg * toRad
  const dec1 = dec1Deg * toRad
  const ra2 = ra2Deg * toRad
  const dec2 = dec2Deg * toRad
  const dRa = ra2 - ra1
  const dDec = dec2 - dec1
  const a =
    Math.sin(dDec / 2) ** 2 +
    Math.cos(dec1) * Math.cos(dec2) * Math.sin(dRa / 2) ** 2
  const rad = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  return (rad * 180 * 3600) / Math.PI
}

function itemLabel(item: ContextMenuItem): string {
  if (typeof item.label === 'string') return item.label
  if (item.label && typeof item.label.content === 'string') return item.label.content
  return ''
}

export async function querySimbadTap(
  ra: number,
  dec: number,
  radiusDeg: number,
  signal?: AbortSignal,
): Promise<SimbadMatch | null> {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(radiusDeg) || radiusDeg <= 0) {
    return null
  }
  const adql = [
    'SELECT TOP 1 main_id, ra, dec, otype,',
    `DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)})) * 3600 AS dist_arcsec`,
    'FROM basic',
    `WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}, ${radiusDeg.toFixed(6)})) = 1`,
    'ORDER BY dist_arcsec ASC',
  ].join(' ')
  const url = `${SIMBAD_TAP_URL}?request=doQuery&lang=adql&format=json&query=${encodeURIComponent(adql)}`
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = window.setTimeout(() => ctrl.abort(), SIMBAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`SIMBAD HTTP ${res.status}`)
    const json = (await res.json()) as { data?: unknown[][] }
    const row = Array.isArray(json.data) ? json.data[0] : undefined
    if (!Array.isArray(row) || row.length < 3) return null
    const mainId = typeof row[0] === 'string' ? row[0].trim() : ''
    const matchRa = Number(row[1])
    const matchDec = Number(row[2])
    if (!mainId || !Number.isFinite(matchRa) || !Number.isFinite(matchDec)) return null
    const otype = typeof row[3] === 'string' && row[3].trim() ? row[3].trim() : null
    const distRaw = Number(row[4])
    const distArcsec = Number.isFinite(distRaw) ? distRaw : angularSeparationArcsec(ra, dec, matchRa, matchDec)
    return { mainId, ra: matchRa, dec: matchDec, otype, distArcsec }
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function findLocalMatch(ra: number, dec: number, radiusArcsec: number, epochMjd: number) {
  let best: { title: string; subtitle: string; ra: number; dec: number; distArcsec: number; simbadId?: string } | null = null
  for (const t of TARGETS) {
    const pos = mapPosition(t, epochMjd)
    const dist = angularSeparationArcsec(ra, dec, pos.ra, pos.dec)
    if (dist <= radiusArcsec && (!best || dist < best.distArcsec)) {
      best = {
        title: t.name,
        subtitle: `${t.kind} · SPHEREx Explorer featured target`,
        ra: pos.ra,
        dec: pos.dec,
        distArcsec: dist,
        simbadId: t.simbadId,
      }
    }
  }
  for (const p of computePlanetPositions(epochMjd)) {
    if (p.isObserver) continue
    const dist = angularSeparationArcsec(ra, dec, p.ra, p.dec)
    if (dist <= radiusArcsec && (!best || dist < best.distArcsec)) {
      best = {
        title: `${p.symbol} ${p.name}`,
        subtitle: `${p.category} · Solar System (${p.geoAu.toFixed(2)} AU)`,
        ra: p.ra,
        dec: p.dec,
        distArcsec: dist,
      }
    }
  }
  return best
}

/** Query CfA SIMBAD TAP (plus featured targets/planets) and display the result in Aladin's popup. */
export async function identifySkyLocation(
  aladin: AladinInstance,
  ra: number,
  dec: number,
  epochMjd: number = DR1_MAP_MJD,
  signal?: AbortSignal,
): Promise<void> {
  const fov = aladin.getFov?.()
  const fovDeg = Array.isArray(fov) && Number.isFinite(fov[0]) ? fov[0] : 0.6
  const radiusDeg = Math.min(0.25, Math.max(0.008, fovDeg * 0.04))
  const radiusArcsec = radiusDeg * 3600

  const local = findLocalMatch(ra, dec, radiusArcsec, epochMjd)
  try {
    const simbad = await querySimbadTap(ra, dec, radiusDeg, signal)
    if (simbad && (!local || simbad.distArcsec < local.distArcsec + 5)) {
      const simbadHref = `https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=${encodeURIComponent(simbad.mainId)}`
      const titleHtml = `<div class="aladin-sp-title"><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(simbadHref)}">${escapeHtml(simbad.mainId)}</a></div>`
      const lines = [
        simbad.otype ? `<em>Type:</em> ${escapeHtml(simbad.otype)}` : null,
        `<em>Offset:</em> ${simbad.distArcsec.toFixed(1)}&Prime;`,
        local ? `<em>Featured:</em> ${escapeHtml(local.title)}` : null,
      ].filter(Boolean)
      aladin.showPopup?.(simbad.ra, simbad.dec, titleHtml, `<div class="aladin-sp-content">${lines.join('<br>')}</div>`)
      return
    }
  } catch {
    if (signal?.aborted) return
    if (!local) {
      aladin.showPopup?.(
        ra,
        dec,
        '<div class="aladin-sp-title">SIMBAD unavailable</div>',
        '<div class="aladin-sp-content">Could not reach the SIMBAD TAP service from this network.</div>',
      )
      return
    }
  }

  if (local) {
    const titleHtml = local.simbadId
      ? `<div class="aladin-sp-title"><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(`https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=${encodeURIComponent(local.simbadId)}`)}">${escapeHtml(local.title)}</a></div>`
      : `<div class="aladin-sp-title">${escapeHtml(local.title)}</div>`
    aladin.showPopup?.(
      local.ra,
      local.dec,
      titleHtml,
      `<div class="aladin-sp-content">${escapeHtml(local.subtitle)}<br><em>Offset:</em> ${local.distArcsec.toFixed(1)}&Prime;</div>`,
    )
    return
  }

  aladin.showPopup?.(
    ra,
    dec,
    '<div class="aladin-sp-title">No catalog object found</div>',
    `<div class="aladin-sp-content">No SIMBAD object found within ${radiusArcsec.toFixed(0)}&Prime; of this position.</div>`,
  )
}

/**
 * Patch Aladin's default context menu so broken CDS-only actions work reliably with our sky viewer:
 * - "Take a snapshot" downloads a PNG directly instead of being blocked by post-await window.open().
 * - "Add" removes "New image layer" (broken without showLayersControl + dead CDS P/DSS2/color query).
 * - "What is this?" queries the live CfA SIMBAD TAP mirror instead of the 404 simbad-quick.py CGI.
 * - "HiPS2FITS cutout" (404 at CDS) opens the clicked sky coordinate inside our SPHEREx cutout viewer.
 */
export function customizeContextMenuActions(
  rawActions: unknown,
  aladin: AladinInstance,
  getPoint: () => SkyPoint | null,
  getEpochMjd: () => number,
  onInspectCoords?: (ra: number, dec: number) => void,
): ContextMenuItem[] {
  if (!Array.isArray(rawActions)) return []
  const out: ContextMenuItem[] = []
  for (const entry of rawActions as ContextMenuItem[]) {
    if (!entry || typeof entry !== 'object') continue
    const label = itemLabel(entry)

    if (label === 'Take a snapshot') {
      out.push({
        ...entry,
        action: () => {
          aladin.exportAsPNG?.(true)
        },
      })
      continue
    }

    if (label === 'Add' && Array.isArray(entry.subMenu)) {
      const filtered = entry.subMenu.filter((sub) => itemLabel(sub) !== 'New image layer')
      if (filtered.length > 0) {
        out.push({ ...entry, subMenu: filtered })
      }
      continue
    }

    if (label === 'What is this?') {
      out.push({
        ...entry,
        action: () => {
          const pt = getPoint() ?? (() => {
            const rd = aladin.getRaDec?.()
            return Array.isArray(rd) && Number.isFinite(rd[0]) && Number.isFinite(rd[1]) ? { ra: rd[0], dec: rd[1] } : null
          })()
          if (pt) void identifySkyLocation(aladin, pt.ra, pt.dec, getEpochMjd())
        },
      })
      continue
    }

    if (label === 'HiPS2FITS cutout') {
      if (onInspectCoords) {
        out.push({
          label: 'View SPHEREx observations here',
          action: () => {
            const pt = getPoint() ?? (() => {
              const rd = aladin.getRaDec?.()
              return Array.isArray(rd) && Number.isFinite(rd[0]) && Number.isFinite(rd[1]) ? { ra: rd[0], dec: rd[1] } : null
            })()
            if (pt) onInspectCoords(pt.ra, pt.dec)
          },
        })
      }
      continue
    }

    out.push(entry)
  }
  return out
}
