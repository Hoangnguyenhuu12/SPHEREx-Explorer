/**
 * Forum limits and lists. These are the business analysis' proposals (FORUM_BUSINESS_ANALYSIS.md
 * §9, §11; FEATURE_UI_ANALYSIS.md A01–A08), not confirmed requirements. Change them here only.
 */

export const LIMITS = {
  titleMin: 10,
  titleMax: 150,
  bodyMin: 20,
  bodyMax: 20_000,
  commentMin: 1,
  commentMax: 3_000,
  tagsMin: 1,
  tagsMax: 5,
  linksMax: 3,
  reasonNoteMax: 500,
  /** "Other" needs an explanation. */
  reasonOtherMin: 10,
} as const

export const PAGE_SIZE = 10
export const SEARCH_DEBOUNCE_MS = 300

export const REASONS = [
  { code: 'off_topic', label: 'Off topic' },
  { code: 'spam', label: 'Spam or advertising' },
  { code: 'abusive', label: 'Abusive or offensive' },
  { code: 'personal_info', label: 'Shares personal information' },
  { code: 'needs_context', label: 'Needs more context or a source' },
  { code: 'other', label: 'Other' },
] as const

export type ReasonCode = (typeof REASONS)[number]['code']

export function reasonLabel(code: ReasonCode): string {
  return REASONS.find((r) => r.code === code)?.label ?? code
}

export const SEED_TAGS = [
  { slug: 'spherex', name: 'SPHEREx' },
  { slug: 'moving-stars', name: 'Moving stars' },
  { slug: 'variable-stars', name: 'Variable stars' },
  { slug: 'brown-dwarfs', name: 'Brown dwarfs' },
  { slug: 'image-analysis', name: 'Image analysis' },
  { slug: 'observing-tips', name: 'Observing tips' },
  { slug: 'questions', name: 'Questions' },
] as const

export const COMMUNITY_RULES = [
  'Stay on topic: SPHEREx, the sky and this tool.',
  'Add context: what you looked at, which detector, what you expected.',
  'No personal information about yourself or others.',
  'Be kind to newcomers. Questions are welcome.',
] as const

export const COMMUNITY_NOTE = 'Community post. Reviewed for our community rules, not for scientific accuracy.'
