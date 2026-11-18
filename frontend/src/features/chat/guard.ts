/**
 * Zero-token pre-filter for the star guide. Runs in the browser (no request at all) and, as an
 * identical copy, in the star-chat edge function (no Gemini call), so gibberish and off-topic
 * questions never spend tokens.
 * KEEP IN SYNC with supabase/functions/star-chat/guard.ts (a test checks that they match).
 */

export type GuardVerdict = { ok: true } | { ok: false; reason: 'too-short' | 'gibberish' | 'off-topic'; reply: string }

export const REFUSAL = 'Sorry, I can only answer questions about stars, astronomy and the SPHEREx Explorer site.'
const TOO_SHORT = 'Please type a full question about stars or astronomy.'
const GIBBERISH = "I couldn't understand that. Please ask a question about stars or astronomy."

/** Lower case, accents removed (Vietnamese too), punctuation as spaces. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Word stems (English) and phrases (accent-free Vietnamese) that mark an astronomy question. */
const TOPIC = [
  // English
  'star', 'stellar', 'planet', 'galax', 'universe', 'cosmo', 'cosmic', 'space', 'astro', 'telescope', 'nasa',
  'spherex', 'wise', 'unwise', 'infrared', 'light year', 'lightyear', 'sun', 'solar', 'moon', 'lunar', 'orbit',
  'nebula', 'black hole', 'comet', 'asteroid', 'meteor', 'eclipse', 'dwarf', 'giant', 'supernova', 'constellation',
  'parallax', 'proper motion', 'arcsec', 'magnitude', 'brightness', 'wavelength', 'spectr', 'kelvin', 'detector',
  'redshift', 'exoplanet', 'milky way', 'big bang', 'gravit', 'sky', 'mira variable', 'pulsar', 'quasar', 'neutron',
  'jupiter', 'mars', 'venus', 'mercury', 'saturn', 'uranus', 'neptune', 'pluto', 'earth', 'fusion', 'gaia', 'simbad',
  'the eyes', 'hubble', 'webb', 'jwst',
  // targets
  'barnard', '0855', 'epsilon indi', 'eps ind', 'rw aur', 'r dra', 'draconis', 'aurigae',
  // Vietnamese (accent-free)
  'ngoi sao', 'sao lun', 'sao choi', 'sao bang', 'chom sao', 'sao doi', 'sao bien quang', 'sao khong lo', 'cac sao',
  'nhung sao', 'vi sao', 'hanh tinh', 'thien ha', 'vu tru', 'mat troi', 'mat trang', 'trai dat', 'thien van',
  'kinh vien vong', 'hong ngoai', 'lo den', 'tinh van', 'quy dao', 'nam anh sang', 'khong gian', 'do sang',
  'buoc song', 'nhat thuc', 'nguyet thuc', 'thien thach', 'tieu hanh tinh', 'bau troi', 'ngan ha', 'sao hoa',
  'sao kim', 'sao moc', 'sao tho', 'sao thuy', 'sao diem vuong', 'hai vuong', 'thien vuong', 'quang pho',
]

function hasTopic(folded: string): boolean {
  const padded = ` ${folded} `
  // Single words are stems matched at a word start ("star" → "stars"); phrases match whole words.
  return TOPIC.some((t) => padded.includes(t.includes(' ') ? ` ${t} ` : ` ${t}`))
}

function isGibberish(raw: string, folded: string): boolean {
  if (/(.)\1{4,}/u.test(raw)) return true // "aaaaaa", "!!!!!!"
  const words = folded.split(' ').filter(Boolean)
  if (!words.length) return true // only symbols / emoji
  if (words.some((w) => w.length > 25)) return true
  const long = words.filter((w) => w.length >= 4 && !/^\d+$/.test(w))
  const noVowel = long.filter((w) => !/[aeiouy]/.test(w)).length
  if (long.length && noVowel / long.length > 0.4) return true // "sdfg qwrt"
  // Keyboard mashing: long runs of consonants inside words ("asdkjfh").
  const mashed = long.filter((w) => /[bcdfghjklmnpqrstvwxz]{5,}/.test(w)).length
  return long.length > 0 && mashed / long.length > 0.4
}

// Explicit unrelated or instruction-extraction requests stay blocked even if they mention a target.
function isMisuse(text: string): boolean {
  return /\b(ignore (all |your |the |previous )*(instructions|rules|prompts)|system prompt|developer (instructions|message)|api key|reveal (your |the )?(instructions|secrets|key)|write (me )?(an? )?(essay|poem|story|song|code|script|python|function)|solve (my |this |the )?(homework|equation|math)|recipe for|how to cook|viet (cho toi )?(bai van|bai tho|truyen|ma code)|giai (bai toan|bai tap)|cong thuc nau|cach nau|bo qua (cac |nhung )?(quy tac|huong dan)|tiet lo (huong dan|bi mat|khoa))\b/.test(text)
}

/**
 * Decide, without any AI call, whether a question is worth sending.
 * `followUp` is true when the user is replying inside an on-topic conversation; short follow-ups
 * like "why?" or "how far is it?" are then allowed without astronomy keywords.
 */
export function guard(question: string, followUp = false): GuardVerdict {
  const raw = question.trim()
  const folded = fold(raw)
  if (folded.replace(/ /g, '').length < 3) return { ok: false, reason: 'too-short', reply: TOO_SHORT }
  if (isGibberish(raw, folded)) return { ok: false, reason: 'gibberish', reply: GIBBERISH }
  if (isMisuse(folded)) return { ok: false, reason: 'off-topic', reply: REFUSAL }
  if (hasTopic(folded)) return { ok: true }
  if (followUp && folded.split(' ').length <= 12) return { ok: true }
  return { ok: false, reason: 'off-topic', reply: REFUSAL }
}
