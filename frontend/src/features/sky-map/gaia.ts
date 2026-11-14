import { GAIA_DR3_EPOCH_JYEAR, positionAt } from '../../shared/config/epoch'

export interface GaiaCatalogStar {
  sourceId: string
  ra: number
  dec: number
  gmag: number | null
  pmRa: number | null
  pmDec: number | null
  refEpochJyear: number
}

export interface PropagatedGaiaStar extends GaiaCatalogStar {
  displayRa: number
  displayDec: number
  propagated: boolean
}

export interface GaiaPropagationSummary {
  stars: PropagatedGaiaStar[]
  total: number
  propagatedCount: number
  staticCount: number
}

/** VizieR mirrors for Gaia DR3 (I/355/gaiadr3). */
export const VIZIER_MIRRORS = [
  'https://vizier.cds.unistra.fr',
  'https://vizier.cfa.harvard.edu',
  'https://vizier.iucaa.in',
]

export function gaiaUrl(base: string, ra: number, dec: number, radiusDeg: number, maxRows = 1500): string {
  const q = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    '-c': `${ra} ${dec}`,
    '-c.rd': String(radiusDeg),
    '-out.max': String(maxRows),
    '-out': 'RA_ICRS,DE_ICRS,Source,Gmag,pmRA,pmDE',
    Gmag: '<18',
    '-sort': 'Gmag',
  })
  return `${base}/viz-bin/votable?${q.toString()}`
}

function parseOptionalFloat(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/** Parse a VizieR I/355/gaiadr3 VOTable XML response, rejecting error responses. */
export function parseVizierVotable(xmlText: string): GaiaCatalogStar[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid VizieR VOTable XML')
  }
  const infos = Array.from(doc.getElementsByTagName('INFO'))
  for (const info of infos) {
    if (info.getAttribute('name') === 'QUERY_STATUS' && info.getAttribute('value') === 'ERROR') {
      throw new Error(info.textContent?.trim() || 'VizieR query returned QUERY_STATUS=ERROR')
    }
  }
  const fields = Array.from(doc.getElementsByTagName('FIELD'))
  if (!fields.length) return []
  const colIndex = new Map<string, number>()
  fields.forEach((f, idx) => {
    const name = (f.getAttribute('name') ?? f.getAttribute('ID') ?? '').trim().toLowerCase()
    if (name) colIndex.set(name, idx)
  })
  const raIdx = colIndex.get('ra_icrs') ?? colIndex.get('ra')
  const decIdx = colIndex.get('de_icrs') ?? colIndex.get('dec')
  if (raIdx == null || decIdx == null) {
    throw new Error('VizieR VOTable is missing RA_ICRS/DE_ICRS columns')
  }
  const srcIdx = colIndex.get('source') ?? colIndex.get('source_id')
  const gIdx = colIndex.get('gmag') ?? colIndex.get('g_mag')
  const pmRaIdx = colIndex.get('pmra') ?? colIndex.get('pmra_mas_yr')
  const pmDecIdx = colIndex.get('pmde') ?? colIndex.get('pmdec') ?? colIndex.get('pmdec_mas_yr')

  const rows = Array.from(doc.getElementsByTagName('TR'))
  const stars: GaiaCatalogStar[] = []
  for (const tr of rows) {
    const tds = Array.from(tr.getElementsByTagName('TD'))
    const ra = parseOptionalFloat(tds[raIdx]?.textContent)
    const dec = parseOptionalFloat(tds[decIdx]?.textContent)
    if (ra == null || dec == null) continue
    const sourceId = (srcIdx != null ? tds[srcIdx]?.textContent?.trim() : '') || ''
    stars.push({
      sourceId,
      ra,
      dec,
      gmag: gIdx != null ? parseOptionalFloat(tds[gIdx]?.textContent) : null,
      pmRa: pmRaIdx != null ? parseOptionalFloat(tds[pmRaIdx]?.textContent) : null,
      pmDec: pmDecIdx != null ? parseOptionalFloat(tds[pmDecIdx]?.textContent) : null,
      refEpochJyear: GAIA_DR3_EPOCH_JYEAR,
    })
  }
  return stars
}

/**
 * Propagate Gaia DR3 stars to `targetEpochMjd` using linear angular proper motion (`angular_proper_motion_only`).
 * When `targetEpochMjd` is undefined (e.g. mixed-epoch DSS2 optical fallback), or a star lacks `pmRA`/`pmDE`,
 * the star stays at its Gaia DR3 reference epoch (J2016.0).
 */
export function propagateGaiaCatalog(stars: readonly GaiaCatalogStar[], targetEpochMjd?: number): GaiaPropagationSummary {
  let propagatedCount = 0
  let staticCount = 0
  const propagated: PropagatedGaiaStar[] = stars.map((s) => {
    const hasPm = s.pmRa != null && s.pmDec != null && Number.isFinite(s.pmRa) && Number.isFinite(s.pmDec)
    if (targetEpochMjd != null && Number.isFinite(targetEpochMjd) && hasPm) {
      const pos = positionAt(
        {
          raDeg: s.ra,
          decDeg: s.dec,
          pmRaCosDecMasYr: s.pmRa,
          pmDecMasYr: s.pmDec,
          refEpochJyear: s.refEpochJyear || GAIA_DR3_EPOCH_JYEAR,
        },
        targetEpochMjd,
      )
      propagatedCount++
      return { ...s, displayRa: pos.ra, displayDec: pos.dec, propagated: true }
    }
    staticCount++
    return { ...s, displayRa: s.ra, displayDec: s.dec, propagated: false }
  })
  return { stars: propagated, total: propagated.length, propagatedCount, staticCount }
}
