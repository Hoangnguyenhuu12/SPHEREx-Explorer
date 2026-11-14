import { LIMITS } from './config'
import { checkLink } from './links'
import type { ModerationReason, PostContent } from './types'

export interface PostErrors {
  title?: string
  body?: string
  tags?: string
  links?: (string | undefined)[]
}

/** Count characters the way people see them (emoji = 1). */
export function charCount(text: string): number {
  return [...text].length
}

export function validateTitle(title: string): string | undefined {
  const n = charCount(title.trim())
  if (n === 0) return 'Add a title.'
  if (n < LIMITS.titleMin) return `Use at least ${LIMITS.titleMin} characters so people know what the post is about.`
  if (n > LIMITS.titleMax) return `Keep the title under ${LIMITS.titleMax} characters.`
  return undefined
}

export function validateBody(body: string): string | undefined {
  const n = charCount(body.trim())
  if (n === 0) return 'Write your post.'
  if (n < LIMITS.bodyMin) return `Write at least ${LIMITS.bodyMin} characters.`
  if (n > LIMITS.bodyMax) return `Shorten the post to ${LIMITS.bodyMax.toLocaleString('en')} characters or less.`
  return undefined
}

export function validateTags(tagIds: string[], activeIds?: ReadonlySet<string>): string | undefined {
  if (tagIds.length < LIMITS.tagsMin) return 'Choose at least one topic.'
  if (tagIds.length > LIMITS.tagsMax) return `Choose up to ${LIMITS.tagsMax} topics.`
  if (activeIds && tagIds.some((id) => !activeIds.has(id))) return 'One of the topics is no longer available. Choose another.'
  return undefined
}

export function validateLinks(links: string[]): (string | undefined)[] | undefined {
  if (links.length > LIMITS.linksMax) return links.map((_, i) => (i >= LIMITS.linksMax ? `Add up to ${LIMITS.linksMax} links.` : undefined))
  const errors = links.map((l) => {
    const r = checkLink(l)
    return r.ok ? undefined : r.message
  })
  return errors.some(Boolean) ? errors : undefined
}

/** Full check before submitting for review. */
export function validatePost(content: PostContent, activeTagIds?: ReadonlySet<string>): PostErrors {
  const errors: PostErrors = {}
  const title = validateTitle(content.title)
  const body = validateBody(content.body)
  const tags = validateTags(content.tagIds, activeTagIds)
  const links = validateLinks(content.links)
  if (title) errors.title = title
  if (body) errors.body = body
  if (tags) errors.tags = tags
  if (links) errors.links = links
  return errors
}

/** Drafts may be incomplete, but still cannot exceed limits or hold broken links. */
export function validateDraft(content: PostContent): PostErrors {
  const errors: PostErrors = {}
  if (charCount(content.title.trim()) > LIMITS.titleMax) errors.title = validateTitle(content.title)
  if (charCount(content.body.trim()) > LIMITS.bodyMax) errors.body = validateBody(content.body)
  if (content.tagIds.length > LIMITS.tagsMax) errors.tags = validateTags(content.tagIds)
  const links = validateLinks(content.links.filter((l) => l.trim() !== ''))
  if (links) errors.links = links
  if (!content.title.trim() && !content.body.trim()) errors.title = 'Add a title or some text before saving a draft.'
  return errors
}

export function hasErrors(e: PostErrors): boolean {
  return Boolean(e.title || e.body || e.tags || e.links?.some(Boolean))
}

export function validateComment(body: string): string | undefined {
  const n = charCount(body.trim())
  if (n < LIMITS.commentMin) return 'Write a comment first.'
  if (n > LIMITS.commentMax) return `Shorten your comment to ${LIMITS.commentMax.toLocaleString('en')} characters or less.`
  return undefined
}

export function validateReason(reason: Partial<ModerationReason>): { code?: string; note?: string } {
  const out: { code?: string; note?: string } = {}
  if (!reason.code) out.code = 'Choose a reason.'
  const note = (reason.note ?? '').trim()
  if (charCount(note) > LIMITS.reasonNoteMax) out.note = `Keep it under ${LIMITS.reasonNoteMax} characters.`
  else if (reason.code === 'other' && charCount(note) < LIMITS.reasonOtherMin) out.note = `Explain in at least ${LIMITS.reasonOtherMin} characters.`
  return out
}

/** "SPHEREx", "#spherex", " Spher ex " → "spherex" (BA §9). */
export function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^#+/, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
