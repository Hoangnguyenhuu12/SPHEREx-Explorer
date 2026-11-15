/**
 * Ready-made questions with instant answers, so visitors get the common facts about the five targets
 * without waiting for (or spending tokens on) the AI. Facts follow shared/config/targets.ts.
 */
export interface Faq {
  q: string
  a: string
}

export const FAQ: readonly Faq[] = [
  {
    q: "Why is Barnard's Star special?",
    a: "Barnard's Star is a red dwarf about 6 light-years away, our fourth-closest stellar neighbour. It crosses the sky faster than any other star: about 10 arcseconds every year, enough to cover the width of the full Moon in ~180 years. In The Eyes, play its sequence and watch it shift against the background stars.",
  },
  {
    q: 'What is WISE 0855?',
    a: 'WISE 0855−0714 is the coldest brown dwarf known, about 7 light-years away: too small to shine like a star but heavier than Jupiter. At around −23 °C (250 K) it only shows in thermal infrared, so use the longest-wavelength detectors (D5–D6 or WISE W2) and look for a faint dot that moves ~8.1 arcseconds per year.',
  },
  {
    q: 'What is Epsilon Indi B?',
    a: 'Epsilon Indi B is a pair of brown dwarfs (Ba and Bb) orbiting each other, about 12 light-years away, travelling with the star Epsilon Indi A. At SPHEREx resolution the pair looks like one source. It glides ~4.7 arcseconds per year.',
  },
  {
    q: 'Why does RW Aurigae change brightness?',
    a: 'RW Aurigae is a very young star wrapped in a disk of gas and dust where planets may form. Its brightness drops irregularly when dust passes in front of it. It is hundreds of light-years away and barely moves, so compare its brightness between dates instead.',
  },
  {
    q: 'What is R Draconis?',
    a: 'R Draconis is a pulsating red giant (a Mira variable). Like a cosmic heartbeat, it swells and shrinks every ~245 days, becoming much brighter and fainter. Its cool outer layers (~3,000 K) are very bright in infrared, so some frames may saturate the detector.',
  },
]

/** Lower-case ASCII words: strips accents (Vietnamese too) and punctuation. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const INDEX = new Map(FAQ.map((f) => [norm(f.q), f.a]))

/** Names that identify each FAQ entry's target (same order as FAQ). */
const NAMES: readonly string[][] = [
  ['barnard star', 'barnard', 'gj 699'],
  ['wise 0855 0714', 'wise 0855', 'wise0855', '0855'],
  ['epsilon indi b', 'eps ind b', 'epsilon indi', 'eps indi b', 'eps indi', 'eps ind'],
  ['rw aurigae', 'rw aur'],
  ['r draconis', 'r dra'],
]

/** Filler words of a generic "what is X?" question, in English and (accent-free) Vietnamese. */
const GENERIC = new Set(
  (
    'what is who are tell me about explain describe info information the a an star please ' +
    'why special so interesting know more ' +
    'la gi ve cho toi biet ngoi sao hay ke gioi thieu thong tin dac biet the nao'
  ).split(' '),
)

/**
 * Instant answer, no AI call: the typed text is a ready-made question, or a short generic
 * question about one of the five targets ("tell me about R Dra", "WISE 0855 là gì?").
 */
export function faqAnswer(text: string): string | undefined {
  const t = norm(text)
  const exact = INDEX.get(t)
  if (exact) return exact
  const padded = ` ${t} `
  const hits = NAMES.map((names) => names.find((n) => padded.includes(` ${n} `))).map((n, i) => [n, i] as const)
  const found = hits.filter(([n]) => n)
  if (found.length !== 1) return undefined
  const [name, i] = found[0]
  const rest = padded.replace(` ${name} `, ' ').trim().split(' ').filter(Boolean)
  return rest.every((w) => GENERIC.has(w)) ? FAQ[i].a : undefined
}
