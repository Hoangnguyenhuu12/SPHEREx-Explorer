import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo } from '../features/auth/returnTo'
import { TARGET_BY_KEY } from '../shared/config/targets'
import { validateDisplayName } from '../features/auth/DisplayNameDialog'
import { diffParagraphs, diffSet } from '../features/forum/diff'
import { checkLink, describeObservation } from '../features/forum/links'
import { excerpt, parseInline, parseMarkdown } from '../features/forum/markdown'
import { normalizeSlug, validateComment, validateDraft, validatePost, validateReason } from '../features/forum/validation'

const ORIGIN = 'https://spherex.invalid'

describe('sanitizeReturnTo', () => {
  it.each(['/forum/new', '/forum/posts/post_1?x=1#comment', '/the-eyes?q=barnard'])('accepts %s', (p) => {
    expect(sanitizeReturnTo(p)).toBe(p)
  })
  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'forum', '/login', '/signup?x=1', '/a\u0000b', ''])(
    'rejects %j',
    (p) => {
      expect(sanitizeReturnTo(p)).toBeNull()
    },
  )
})

describe('validateDisplayName', () => {
  it('accepts plain names, including accents', () => {
    expect(validateDisplayName('Duy Hoàng')).toBeUndefined()
    expect(validateDisplayName('star_gazer-42')).toBeUndefined()
  })
  it('rejects short, long, emails and symbols', () => {
    expect(validateDisplayName('a')).toMatch(/at least/)
    expect(validateDisplayName('x'.repeat(31))).toMatch(/at most/)
    expect(validateDisplayName('me@example.com')).toBeTruthy()
    expect(validateDisplayName('<b>')).toBeTruthy()
  })
})

describe('post validation (A01)', () => {
  const ok = { title: 'A clear question title', body: 'Enough text to explain the question.', tagIds: ['t1'], links: [] }
  it('passes a complete post', () => {
    expect(validatePost(ok)).toEqual({})
  })
  it('flags each limit', () => {
    const e = validatePost({ title: 'Short', body: 'tiny', tagIds: [], links: ['not a link'] })
    expect(e.title).toMatch(/at least 10/)
    expect(e.body).toMatch(/at least 20/)
    expect(e.tags).toMatch(/at least one/)
    expect(e.links?.[0]).toBeTruthy()
    expect(validatePost({ ...ok, tagIds: ['1', '2', '3', '4', '5', '6'] }).tags).toMatch(/up to 5/)
    expect(validatePost({ ...ok, title: 'x'.repeat(151) }).title).toMatch(/under 150/)
  })
  it('rejects retired topics when the active list is known', () => {
    expect(validatePost(ok, new Set(['t2'])).tags).toMatch(/no longer available/)
  })
  it('counts emoji as one character', () => {
    expect(validatePost({ ...ok, title: '🔭'.repeat(10) }).title).toBeUndefined()
  })
  it('lets drafts be incomplete but not empty', () => {
    expect(validateDraft({ title: 'Idea', body: '', tagIds: [], links: [] })).toEqual({})
    expect(validateDraft({ title: '', body: '', tagIds: [], links: [] }).title).toBeTruthy()
  })
  it('checks comments and reasons', () => {
    expect(validateComment('   ')).toBeTruthy()
    expect(validateComment('x'.repeat(3001))).toMatch(/3,000/)
    expect(validateReason({})).toEqual({ code: 'Choose a reason.' })
    expect(validateReason({ code: 'other', note: 'short' }).note).toMatch(/at least 10/)
    expect(validateReason({ code: 'spam', note: '' })).toEqual({})
  })
  it('normalises slugs so variants do not duplicate topics', () => {
    expect(normalizeSlug('#SPHEREx')).toBe('spherex')
    expect(normalizeSlug('  Moving Stars ')).toBe('moving-stars')
    expect(normalizeSlug('Sao biến quang')).toBe('sao-bien-quang')
  })
})

describe('links', () => {
  it('normalises Eyes links to a relative path', () => {
    expect(checkLink(`${ORIGIN}/the-eyes?q=barnard&det=6`, ORIGIN)).toEqual({ ok: true, href: '/the-eyes?q=barnard&det=6', kind: 'eyes' })
    expect(checkLink('/eyes?q=rdra', ORIGIN)).toMatchObject({ ok: true, kind: 'eyes', href: '/the-eyes?q=rdra' })
  })
  it('allows https links and blocks other schemes', () => {
    expect(checkLink('https://irsa.ipac.caltech.edu/', ORIGIN)).toMatchObject({ ok: true, kind: 'external' })
    expect(checkLink('javascript:alert(1)', ORIGIN).ok).toBe(false)
    expect(checkLink('data:text/html,hi', ORIGIN).ok).toBe(false)
    expect(checkLink('has space.com', ORIGIN).ok).toBe(false)
  })
  it('describes an observation without calling any API (AC14)', () => {
    expect(describeObservation('/the-eyes?q=wise0855&det=6&fov=5')).toEqual({ href: '/the-eyes?q=wise0855&det=6&fov=5', label: TARGET_BY_KEY.get('wise0855')!.name, detector: 6, fovArcmin: 5 })
    expect(describeObservation('https://example.com')).toBeNull()
  })
})

describe('markdown', () => {
  it('builds paragraphs, lists and inline marks', () => {
    const blocks = parseMarkdown('Hello **bold** and *it*\nnext line\n\n- one\n- two\n\n1. a\n2. b')
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul', 'ol'])
    expect(blocks[0]).toMatchObject({ t: 'p', c: [{ t: 'text' }, { t: 'strong' }, { t: 'text' }, { t: 'em' }, { t: 'br' }, { t: 'text' }] })
  })
  it('keeps HTML as plain text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ t: 'text', v: '<script>alert(1)</script>' }])
  })
  it('drops unsafe link targets but keeps the text', () => {
    expect(parseInline('[click](javascript:alert(1))')[0]).toMatchObject({ t: 'text' })
    expect(parseInline('[IRSA](https://irsa.ipac.caltech.edu)')[0]).toMatchObject({ t: 'link', external: true })
    expect(parseInline('see https://example.com/a.')[1]).toMatchObject({ t: 'link', href: 'https://example.com/a' })
  })
  it('makes plain excerpts', () => {
    expect(excerpt('**Bold** [link](https://x.y) text', 100)).toBe('Bold link text')
    expect(excerpt('a'.repeat(300), 10)).toHaveLength(10)
  })
})

describe('diff', () => {
  it('marks added, removed and kept paragraphs', () => {
    const d = diffParagraphs('A\n\nB\n\nC', 'A\n\nB2\n\nC\n\nD')
    expect(d).toEqual([
      { op: 'same', value: 'A' },
      { op: 'remove', value: 'B' },
      { op: 'add', value: 'B2' },
      { op: 'same', value: 'C' },
      { op: 'add', value: 'D' },
    ])
  })
  it('diffs tag and link sets', () => {
    expect(diffSet(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'], kept: ['b'] })
  })
})
