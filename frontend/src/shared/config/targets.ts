/**
 * The five SPHEREx challenge targets.
 * Astrometry: SIMBAD, ICRS, reference epoch J2000 (checked 2026-11-05).
 * Descriptions are curated plain-language copy; they are not measurements.
 */

export type TargetKey = 'barnard' | 'wise0855' | 'epsindib' | 'rwaur' | 'rdra'

export interface TargetInfo {
  key: TargetKey
  name: string
  shortName: string
  kind: string
  aliases: string[]
  raDeg: number
  decDeg: number
  raHms: string
  decDms: string
  epoch: 'J2000'
  pmRaCosDecMasYr: number
  pmDecMasYr: number
  distance: string
  description: string
  lookFor: string
  recommendedDetector: number
  /** What the observation sequence is meant to show. */
  change: 'motion' | 'brightness'
  simbadId: string
}

export const TARGETS: readonly TargetInfo[] = [
  {
    key: 'barnard',
    name: "Barnard's Star",
    shortName: 'Barnard',
    kind: 'Nearby red dwarf',
    aliases: ['GJ 699', 'V2500 Oph'],
    raDeg: 269.45207695861876,
    decDeg: 4.693364966576667,
    raHms: '17h 57m 48.50s',
    decDms: '+04° 41′ 36.1″',
    epoch: 'J2000',
    pmRaCosDecMasYr: -801.551,
    pmDecMasYr: 10362.394,
    distance: 'about 6 light-years',
    description:
      'One of the closest stars to the Sun. It crosses the sky faster than any other star, about 10 arcseconds every year.',
    lookFor: 'Compare its position with the stars around it as the dates advance.',
    recommendedDetector: 6,
    change: 'motion',
    simbadId: "NAME Barnard's star",
  },
  {
    key: 'wise0855',
    name: 'WISE 0855−0714',
    shortName: 'WISE 0855',
    kind: 'Very cold brown dwarf',
    aliases: ['WISEA J085510.74−071442.5'],
    raDeg: 133.81890825,
    decDeg: -7.247048,
    raHms: '08h 55m 16.54s',
    decDms: '−07° 14′ 49.4″',
    epoch: 'J2000',
    pmRaCosDecMasYr: -8123.7,
    pmDecMasYr: 673.2,
    distance: 'about 7 light-years',
    description:
      'The coldest brown dwarf known. It is almost invisible to the eye but glows in infrared light, which SPHEREx collects.',
    lookFor: 'Look for a faint dot that shifts between dates. The longest-wavelength detectors (D5–D6) suit it best.',
    recommendedDetector: 6,
    change: 'motion',
    simbadId: 'WISEA J085510.74-071442.5',
  },
  {
    key: 'epsindib',
    name: 'Epsilon Indi B',
    shortName: 'Eps Ind B',
    kind: 'Brown dwarf pair',
    aliases: ['eps Ind Ba/Bb', 'GJ 845 B'],
    raDeg: 331.04414658852124,
    decDeg: -56.78284419511611,
    raHms: '22h 04m 10.60s',
    decDms: '−56° 46′ 58.2″',
    epoch: 'J2000',
    pmRaCosDecMasYr: 3981.977,
    pmDecMasYr: -2466.832,
    distance: 'about 12 light-years',
    description:
      'Two brown dwarfs orbiting each other, travelling together with the star Epsilon Indi A. At SPHEREx resolution the pair appears as one source.',
    lookFor: 'Look for shared motion with its companion star when the field is wide enough to include both.',
    recommendedDetector: 6,
    change: 'motion',
    simbadId: '* eps Ind B',
  },
  {
    key: 'rwaur',
    name: 'RW Aurigae',
    shortName: 'RW Aur',
    kind: 'Young variable star',
    aliases: ['RW Aur'],
    raDeg: 76.95652603458333,
    decDeg: 30.401438173888888,
    raHms: '05h 07m 49.57s',
    decDms: '+30° 24′ 05.2″',
    epoch: 'J2000',
    pmRaCosDecMasYr: 7.23,
    pmDecMasYr: -20.33,
    distance: 'several hundred light-years',
    description:
      'A very young star system surrounded by dust. Its brightness drops irregularly when dust passes in front of the star.',
    lookFor: 'Compare its brightness between dates. Check the wavelength and quality notes before reading anything into a change.',
    recommendedDetector: 6,
    change: 'brightness',
    simbadId: 'V* RW Aur',
  },
  {
    key: 'rdra',
    name: 'R Draconis',
    shortName: 'R Dra',
    kind: 'Pulsating red giant (Mira variable)',
    aliases: ['R Dra', 'HIP 81285'],
    raDeg: 248.16761083295,
    decDeg: 66.75497941722,
    raHms: '16h 32m 40.23s',
    decDms: '+66° 45′ 17.9″',
    epoch: 'J2000',
    pmRaCosDecMasYr: -20.643,
    pmDecMasYr: 6.149,
    distance: 'not well measured',
    description:
      'A giant star that swells and shrinks over about eight months, becoming much brighter and fainter as it pulses.',
    lookFor: 'Compare its brightness between dates. Bright frames may saturate the detector.',
    recommendedDetector: 6,
    change: 'brightness',
    simbadId: 'V* R Dra',
  },
] as const

export const TARGET_BY_KEY: ReadonlyMap<TargetKey, TargetInfo> = new Map(TARGETS.map((t) => [t.key, t]))

export function isTargetKey(value: string | null | undefined): value is TargetKey {
  return value != null && TARGET_BY_KEY.has(value as TargetKey)
}

/** Detector wavelength ranges in micrometres. */
export const DETECTORS: readonly { id: number; range: string; label: string }[] = [
  { id: 1, range: '0.75–1.09 µm', label: 'Near infrared' },
  { id: 2, range: '1.10–1.62 µm', label: 'Near infrared' },
  { id: 3, range: '1.63–2.41 µm', label: 'Near infrared' },
  { id: 4, range: '2.42–3.82 µm', label: 'Infrared' },
  { id: 5, range: '3.83–4.41 µm', label: 'Thermal infrared' },
  { id: 6, range: '4.42–5.00 µm', label: 'Thermal infrared' },
]
