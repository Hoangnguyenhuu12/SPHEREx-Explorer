// @vitest-environment node
/**
 * End-to-end check of httpForumApi against a running backend with the forum configured for
 * HS256 test tokens (the same secret as members/dong/tests/forum). Skipped unless
 * FORUM_LIVE_API_URL is set, e.g. FORUM_LIVE_API_URL=http://127.0.0.1:8765.
 * The database must be disposable: the test creates users, posts and tags. Admin rights are granted
 * outside the API, so the flow test needs FORUM_LIVE_ADMIN_ID: a user id already set to role 'admin'
 * in forum.profiles (`insert into forum.profiles (id, role) values ('<uuid>', 'admin')`).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '../features/auth/session'

// Vitest exposes the process environment on import.meta.env.
const env = import.meta.env as Record<string, string | undefined>
const API = env.FORUM_LIVE_API_URL ?? ''
const SECRET = env.FORUM_LIVE_JWT_SECRET ?? 'forum-test-secret-with-at-least-32-bytes!!'
const ISSUER = env.FORUM_LIVE_JWT_ISSUER ?? 'https://forum-test.supabase.co/auth/v1'
const randomUUID = () => crypto.randomUUID()

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64json = (v: unknown) => b64(new TextEncoder().encode(JSON.stringify(v)))
const hmacKey = crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

/** Synthetic Supabase-style HS256 access token, as in members/dong/tests/forum. */
async function token(sub: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64json({ alg: 'HS256', typ: 'JWT' })}.${b64json({ sub, aud: 'authenticated', iss: ISSUER, iat: now, exp: now + 3600, role: 'authenticated' })}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey, new TextEncoder().encode(unsigned))
  return `${unsigned}.${b64(new Uint8Array(sig))}`
}

const state: { user: SessionUser | null } = { user: null }

vi.mock('../app/config', async (orig) => {
  const real = await orig<typeof import('../app/config')>()
  return { ...real, config: { ...real.config, apiBaseUrl: (import.meta.env as Record<string, string | undefined>).FORUM_LIVE_API_URL ?? '', forumLive: true } }
})
vi.mock('../features/auth/supabase', () => ({ accessToken: async () => (state.user ? await token(state.user.id) : null), supabase: () => ({}) }))
vi.mock('../features/auth/session', () => ({ getSessionUser: () => state.user }))

const ORIGIN = 'http://localhost:5173'
globalThis.location = new URL(ORIGIN) as unknown as Location

describe.skipIf(!API)('httpForumApi against the live backend', () => {
  let api: typeof import('../features/forum/http/httpForumApi').httpForumApi
  const admin: SessionUser = { id: env.FORUM_LIVE_ADMIN_ID ?? randomUUID(), email: 'a@x', displayName: 'Admin one', role: 'admin' }
  const author: SessionUser = { id: randomUUID(), email: 'b@x', displayName: 'Sky watcher', role: 'member' }
  const as = (u: SessionUser) => {
    state.user = u
  }
  const raw = async (u: SessionUser, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API}/api/forum${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token(u.id)}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json()
  }

  beforeAll(async () => {
    api = (await import('../features/forum/http/httpForumApi')).httpForumApi
    await raw(author, 'PATCH', '/me', { display_name: author.displayName })
    await raw(admin, 'PATCH', '/me', { display_name: admin.displayName })
  })

  it('refuses admin endpoints for an ordinary user', async () => {
    as(author)
    await expect(api.queue()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('runs the whole moderation flow', async (ctx) => {
    const me = await raw(admin, 'GET', '/me')
    if (me.role !== 'admin') {
      ctx.skip()
      return
    }
    as(admin)
    const slug = `t-${Date.now().toString(36)}`
    const tag = await api.createTag({ name: 'Moving stars', slug })
    expect(tag).toMatchObject({ slug, active: true })
    await expect(api.createTag({ name: 'Again', slug })).rejects.toMatchObject({ details: { reason: 'SLUG_TAKEN' } })
    expect((await api.updateTag(tag.id, { name: 'Moving stars!' })).name).toBe('Moving stars!')

    as(author)
    const content = {
      title: 'A faint dot moves near Barnard',
      body: 'Frames 1 and 3 show a shift of about two pixels between scans.',
      tagIds: [tag.id],
      links: ['/the-eyes?q=barnard&det=6'],
    }
    const draft = await api.saveDraft({ postId: null, content, clientKey: randomUUID() })
    const sent = await api.submit({ postId: draft.postId, content, clientKey: randomUUID() })
    expect(sent.postId).toBe(draft.postId)
    await expect(api.saveDraft({ postId: sent.postId, content, clientKey: randomUUID() })).rejects.toMatchObject({ details: { reason: 'PENDING_LOCK' } })

    as(admin)
    const counts = await api.moderationCounts()
    expect(counts.queue).toBeGreaterThanOrEqual(1)
    const item = (await api.queue()).find((q) => q.postId === sent.postId)!
    expect(item).toMatchObject({ kind: 'first', title: content.title })
    const sub = await api.getSubmission(item.revisionId)
    expect(sub.revision.links).toEqual(content.links)
    await api.approve(item.revisionId)
    await expect(api.approve(item.revisionId)).rejects.toMatchObject({ details: { reason: 'STALE_DECISION', state: 'approved' } })

    as(author)
    const listed = await api.listPosts({ q: 'faint dot', tag: null, page: 1 })
    expect(listed.items.map((p) => p.id)).toContain(sent.postId)
    expect(listed.items.find((p) => p.id === sent.postId)!.observationLink).toBe(content.links[0])
    const comment = await api.addComment(sent.postId, 'Nice catch, I see it too.')
    expect((await api.getPost(sent.postId)).commentCount).toBe(1)

    // An edit that gets rejected keeps the public version and shows the reason to the author.
    const edit = await api.submit({ postId: sent.postId, content: { ...content, title: 'Updated: a faint dot near Barnard' }, clientKey: randomUUID() })
    as(admin)
    await api.reject(edit.revisionId, { code: 'needs_context', note: 'Say which detector you used.' })
    as(author)
    const view = await api.getPost(sent.postId)
    expect(view.published?.title).toBe(content.title)
    expect(view.working).toMatchObject({ state: 'rejected', reason: { code: 'needs_context', note: 'Say which detector you used.' } })
    const mine = await api.myPosts()
    expect(mine.find((p) => p.id === sent.postId)?.group).toBe('action')
    const editor = await api.getEditor(sent.postId)
    expect(editor.lastRejection?.code).toBe('needs_context')

    // Reports, hide, hidden list, restore.
    expect(await api.report({ targetType: 'comment', targetId: comment.id, reason: { code: 'spam', note: '' } })).toEqual({ duplicate: false })
    expect(await api.report({ targetType: 'comment', targetId: comment.id, reason: { code: 'spam', note: '' } })).toEqual({ duplicate: true })
    as(admin)
    const report = (await api.reports()).find((r) => r.targetId === comment.id)!
    expect(report).toMatchObject({ postId: sent.postId, targetHidden: false, reason: { code: 'spam' } })
    await api.hide({ type: 'comment', id: comment.id }, { code: 'spam', note: 'Advert' })
    expect((await api.reports()).some((r) => r.targetId === comment.id)).toBe(false)
    await api.hide({ type: 'post', id: sent.postId }, { code: 'off_topic', note: '' })
    const hidden = await api.hiddenContent()
    expect(hidden.map((h) => h.targetId)).toEqual(expect.arrayContaining([comment.id, sent.postId]))
    expect(hidden.find((h) => h.targetId === sent.postId)?.reason).toEqual({ code: 'off_topic', note: '' })
    await api.restore({ type: 'post', id: sent.postId })
    const after = (await api.hiddenContent()).map((h) => h.targetId)
    expect(after).toContain(comment.id)
    expect(after).not.toContain(sent.postId)

    as(author)
    const kinds = (await api.notifications()).map((n) => n.kind)
    expect(kinds).toEqual(expect.arrayContaining(['approved', 'rejected', 'hidden', 'restored', 'comment_hidden']))
    await api.markNotificationsRead()
    expect((await api.notifications()).every((n) => n.read)).toBe(true)

    as(admin)
    expect((await api.setTagActive(tag.id, false)).active).toBe(false)
  })
})
