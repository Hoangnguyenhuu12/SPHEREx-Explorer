import { describe, expect, it } from 'vitest'
import { toForumError } from '../features/forum/http/client'
import { decodeReason, encodeReason, fromReportCode, fromWireLink, rejectCode, reportCode, toWireLink } from '../features/forum/http/wire'

const ORIGIN = 'https://spherex.example'

describe('forum-v1.1 wire mapping', () => {
  it('round-trips moderation reasons through the free-text reason field', () => {
    expect(decodeReason(encodeReason({ code: 'spam', note: 'Selling telescopes' }))).toEqual({ code: 'spam', note: 'Selling telescopes' })
    expect(encodeReason({ code: 'off_topic', note: '  ' })).toBe('[off_topic] Off topic')
    expect(decodeReason('[off_topic] Off topic')).toEqual({ code: 'off_topic', note: '' })
    // Text written by another client keeps its words under "Other".
    expect(decodeReason('Posted twice')).toEqual({ code: 'other', note: 'Posted twice' })
    expect(decodeReason('[made_up] x')).toEqual({ code: 'other', note: '[made_up] x' })
    expect(decodeReason(null)).toBeNull()
  })

  it('maps UI reason codes to the backend enums', () => {
    expect(rejectCode('abusive')).toBe('abuse')
    expect(rejectCode('personal_info')).toBe('personal_information')
    expect(rejectCode('needs_context')).toBe('needs_context')
    expect(reportCode('needs_context')).toBe('other')
    expect(fromReportCode('personal_information')).toBe('personal_info')
  })

  it('stores Eyes links absolute and reads them back relative', () => {
    const wire = toWireLink('/the-eyes?q=barnard&det=6', ORIGIN)
    expect(wire.url).toBe(`${ORIGIN}/the-eyes?q=barnard&det=6`)
    expect(wire.label.length).toBeGreaterThan(0)
    expect(fromWireLink(wire, ORIGIN)).toBe('/the-eyes?q=barnard&det=6')
    expect(toWireLink('https://irsa.ipac.caltech.edu/x', ORIGIN)).toEqual({ label: 'irsa.ipac.caltech.edu', url: 'https://irsa.ipac.caltech.edu/x' })
  })
})

describe('backend error mapping', () => {
  const body = (code: string, details: Record<string, unknown> = {}) => ({ error: { code, message: 'm', details } })

  it('maps status and details.reason to UI codes', () => {
    expect(toForumError(401, body('UNAUTHORIZED')).code).toBe('UNAUTHENTICATED')
    expect(toForumError(403, body('FORBIDDEN')).code).toBe('FORBIDDEN')
    expect(toForumError(403, body('FORBIDDEN', { reason: 'PROFILE_REQUIRED' })).details.reason).toBe('NO_DISPLAY_NAME')
    expect(toForumError(409, body('CONFLICT', { reason: 'STALE_VERSION' })).details.reason).toBe('STALE_DECISION')
    expect(toForumError(409, body('CONFLICT', { reason: 'DUPLICATE_SLUG' })).details.reason).toBe('SLUG_TAKEN')
    const inactive = toForumError(409, body('CONFLICT', { reason: 'INACTIVE_HASHTAG' }))
    expect([inactive.code, inactive.details.reason]).toEqual(['VALIDATION', 'INACTIVE_TAG'])
    expect(toForumError(400, body('BAD_PARAM', { fields: ['hashtag_ids'] })).details.fields).toEqual({ tags: 'This value is not accepted.' })
    expect(toForumError(503, body('SERVICE_UNAVAILABLE')).code).toBe('UNAVAILABLE')
    expect(toForumError(400, body('BAD_PARAM', { reason: 'NO_CHANGE' })).details.backendReason).toBe('NO_CHANGE')
  })
})
