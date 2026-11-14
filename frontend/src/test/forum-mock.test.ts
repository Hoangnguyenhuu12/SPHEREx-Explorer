// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { endSession, startSession, userIdFor } from '../features/auth/session'
import { ForumError } from '../features/forum/errors'
import { mockForumApi as api, setMockDelay } from '../features/forum/mock/mockForumApi'
import { resetDb } from '../features/forum/mock/store'
import type { PostContent } from '../features/forum/types'

setMockDelay(0)

const valid: PostContent = {
  title: 'Faint dot near WISE 0855 in D6',
  body: 'I see a faint dot that moves between the first and last frame. Is that the brown dwarf?',
  tagIds: ['tag_4'],
  links: ['/the-eyes?q=wise0855&det=6'],
}

function setName(id: string, displayName: string, role: 'member' | 'admin' = 'member') {
  const all = JSON.parse(localStorage.getItem('spherex-profiles-v1') ?? '{}')
  all[id] = { displayName, role }
  localStorage.setItem('spherex-profiles-v1', JSON.stringify(all))
}

function loginAs(email: string, role: 'member' | 'admin' = 'member') {
  setName(userIdFor(email), email.split('@')[0], role)
  return startSession(email)
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'OK'
  } catch (e) {
    return e instanceof ForumError ? `${e.code}${e.details.reason ? `:${e.details.reason}` : ''}` : 'UNKNOWN'
  }
}

async function publishedTitles() {
  return (await api.listPosts({ q: '', tag: null, page: 1 })).items.map((p) => p.title)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  endSession()
  resetDb()
})

describe('public reading (AC01, AC10)', () => {
  it('guests see only published posts, newest first', async () => {
    const page = await api.listPosts({ q: '', tag: null, page: 1 })
    expect(page.total).toBe(5)
    expect(page.items.map((p) => p.publishedAt)).toEqual([...page.items.map((p) => p.publishedAt)].sort().reverse())
    expect(page.items.some((p) => p.title.startsWith('Epsilon Indi'))).toBe(false)
  })
  it('filters by tag and searches title and body, ignoring case and accents', async () => {
    expect((await api.listPosts({ q: '', tag: 'brown-dwarfs', page: 1 })).total).toBe(1)
    expect((await api.listPosts({ q: 'MÍRA', tag: null, page: 1 })).items[0].title).toMatch(/R Draconis/)
  })
  it('tag counts include published posts only', async () => {
    const tags = await api.listTags()
    // The pending Eps Ind post also uses #brown-dwarfs, but must not be counted.
    expect(tags.find((t) => t.slug === 'brown-dwarfs')!.count).toBe(1)
  })
  it('guests cannot write', async () => {
    expect(await code(api.submit({ postId: null, content: valid, clientKey: 'k' }))).toBe('UNAUTHENTICATED')
    expect(await code(api.addComment('post_x', 'hi'))).toBe('UNAUTHENTICATED')
  })
})

describe('submission workflow', () => {
  it('a pending post is invisible to others even by URL (AC02)', async () => {
    loginAs('author@example.com')
    const { postId } = await api.submit({ postId: null, content: valid, clientKey: 'k1' })
    const mine = await api.myPosts()
    expect(mine[0]).toMatchObject({ id: postId, group: 'review' })
    endSession()
    expect(await code(api.getPost(postId))).toBe('NOT_FOUND')
    loginAs('other@example.com')
    expect(await code(api.getPost(postId))).toBe('NOT_FOUND')
    expect(await publishedTitles()).not.toContain(valid.title)
  })

  it('stores Eyes links copied as full URLs in relative form, so the observation card works', async () => {
    loginAs('author@example.com')
    const full = `${location.origin}/the-eyes?q=wise0855&det=6`
    const { postId } = await api.submit({ postId: null, content: { ...valid, links: [full] }, clientKey: 'k' })
    expect((await api.getPost(postId)).working!.links).toEqual(['/the-eyes?q=wise0855&det=6'])
  })

  it('double submit does not create two posts (BA §7)', async () => {
    loginAs('author@example.com')
    const [a, b] = await Promise.all([
      api.submit({ postId: null, content: valid, clientKey: 'same' }),
      api.submit({ postId: null, content: valid, clientKey: 'same' }),
    ])
    expect(a.postId).toBe(b.postId)
    expect(await api.myPosts()).toHaveLength(1)
  })

  it('approve publishes once; reject needs a reason and keeps it private (AC03, AC04)', async () => {
    loginAs('author@example.com')
    const { revisionId, postId } = await api.submit({ postId: null, content: valid, clientKey: 'k' })
    loginAs('mod@example.com', 'admin')
    expect(await code(api.reject(revisionId, { code: 'other', note: '' }))).toBe('VALIDATION')
    await api.reject(revisionId, { code: 'needs_context', note: 'Say which frames.' })
    expect(await publishedTitles()).not.toContain(valid.title)
    loginAs('author@example.com')
    const view = await api.getPost(postId)
    expect(view.working).toMatchObject({ state: 'rejected', reason: { code: 'needs_context' } })
    expect((await api.notifications())[0]).toMatchObject({ kind: 'rejected' })
    // Resubmit creates a new revision; the rejected snapshot stays.
    const again = await api.submit({ postId, content: { ...valid, body: `${valid.body} Frames 1 and 3.` }, clientKey: 'k' })
    expect(again.revisionId).not.toBe(revisionId)
    loginAs('mod@example.com', 'admin')
    await api.approve(again.revisionId)
    expect(await publishedTitles()).toContain(valid.title)
  })

  it('pending revisions are locked until withdrawn (BA §6)', async () => {
    loginAs('author@example.com')
    const { postId, revisionId } = await api.submit({ postId: null, content: valid, clientKey: 'k' })
    expect(await code(api.saveDraft({ postId, content: valid, clientKey: 'k' }))).toBe('CONFLICT:PENDING_LOCK')
    await api.withdraw(postId, revisionId)
    expect(await code(api.saveDraft({ postId, content: { ...valid, title: 'A better title for my post' }, clientKey: 'k' }))).toBe('OK')
  })

  it('editing a published post keeps the old version public until approved (AC05, AC06)', async () => {
    loginAs('author@example.com')
    const first = await api.submit({ postId: null, content: valid, clientKey: 'k' })
    loginAs('mod@example.com', 'admin')
    await api.approve(first.revisionId)
    loginAs('author@example.com')
    const edit = await api.submit({ postId: first.postId, content: { ...valid, title: 'Updated: faint dot near WISE 0855', tagIds: ['tag_4', 'tag_7'] }, clientKey: 'k' })
    endSession()
    const publicView = await api.getPost(first.postId)
    expect(publicView.published!.title).toBe(valid.title)
    expect(publicView.published!.tagIds).toEqual(['tag_4'])
    expect(publicView.working).toBeNull()
    loginAs('mod@example.com', 'admin')
    await api.reject(edit.revisionId, { code: 'off_topic', note: '' })
    expect((await api.getPost(first.postId)).published!.title).toBe(valid.title)
    loginAs('author@example.com')
    const edit2 = await api.submit({ postId: first.postId, content: { ...valid, title: 'Updated: faint dot near WISE 0855' }, clientKey: 'k' })
    loginAs('mod@example.com', 'admin')
    await api.approve(edit2.revisionId)
    const after = await api.getPost(first.postId)
    expect(after.published!.title).toBe('Updated: faint dot near WISE 0855')
    expect(after.editedAt).not.toBeNull()
  })

  it('stale decisions do not overwrite (AC07)', async () => {
    loginAs('author@example.com')
    const { postId, revisionId } = await api.submit({ postId: null, content: valid, clientKey: 'k' })
    await api.withdraw(postId, revisionId)
    loginAs('mod@example.com', 'admin')
    expect(await code(api.approve(revisionId))).toBe('CONFLICT:STALE_DECISION')
    const [queueItem] = (await api.queue()).filter((q) => q.kind === 'first')
    await api.approve(queueItem.revisionId)
    expect(await code(api.reject(queueItem.revisionId, { code: 'spam', note: '' }))).toBe('CONFLICT:STALE_DECISION')
  })
})

describe('comments, hiding and reports', () => {
  it('comments appear at once; hidden posts take none (AC08, AC09)', async () => {
    const [post] = (await api.listPosts({ q: '', tag: null, page: 1 })).items
    loginAs('reader@example.com')
    const c = await api.addComment(post.id, 'Thanks, this helped!')
    expect((await api.listComments(post.id)).map((x) => x.id)).toContain(c.id)
    loginAs('mod@example.com', 'admin')
    await api.hide({ type: 'post', id: post.id }, { code: 'off_topic', note: '' })
    loginAs('reader@example.com')
    expect(await code(api.addComment(post.id, 'Another one'))).toBe('NOT_FOUND')
    endSession()
    expect(await code(api.getPost(post.id))).toBe('NOT_FOUND')
    expect(await publishedTitles()).not.toContain(post.title)
  })

  it('approving an edit does not restore a hidden post (AC09)', async () => {
    const posts = (await api.listPosts({ q: '', tag: null, page: 1 })).items
    const rdra = posts.find((p) => p.title.startsWith('R Draconis'))!
    loginAs('mod@example.com', 'admin')
    await api.hide({ type: 'post', id: rdra.id }, { code: 'needs_context', note: '' })
    const edit = (await api.queue()).find((q) => q.postId === rdra.id)!
    await api.approve(edit.revisionId)
    expect((await api.getPost(rdra.id)).visibility).toBe('hidden')
  })

  it('members cannot moderate (AC11)', async () => {
    loginAs('reader@example.com')
    expect(await code(api.queue())).toBe('FORBIDDEN')
    const [q] = await (async () => {
      loginAs('mod@example.com', 'admin')
      return api.queue()
    })()
    loginAs('reader@example.com')
    expect(await code(api.approve(q.revisionId))).toBe('FORBIDDEN')
  })

  it('a repeated report is not stored twice and does not hide content (AC13)', async () => {
    const [post] = (await api.listPosts({ q: '', tag: null, page: 1 })).items
    loginAs('reader@example.com')
    expect(await api.report({ targetType: 'post', targetId: post.id, reason: { code: 'spam', note: '' } })).toEqual({ duplicate: false })
    expect(await api.report({ targetType: 'post', targetId: post.id, reason: { code: 'spam', note: '' } })).toEqual({ duplicate: true })
    expect(await publishedTitles()).toContain(post.title)
    loginAs('mod@example.com', 'admin')
    expect((await api.reports()).filter((r) => r.targetId === post.id)).toHaveLength(1)
  })
})

describe('hashtags (D04, AC10)', () => {
  it('retired tags cannot be chosen, and slugs are normalised and unique', async () => {
    loginAs('mod@example.com', 'admin')
    await api.setTagActive('tag_4', false)
    expect(await code(api.createTag({ name: 'SPHEREx', slug: '#SPHEREx' }))).toBe('CONFLICT:SLUG_TAKEN')
    loginAs('author@example.com')
    expect(await code(api.submit({ postId: null, content: valid, clientKey: 'k' }))).toBe('VALIDATION:INACTIVE_TAG')
    // Retired tags stay on old posts and remain filterable.
    expect((await api.listPosts({ q: '', tag: 'brown-dwarfs', page: 1 })).total).toBe(1)
  })
  it('typing #something in the body does not create a tag', async () => {
    loginAs('author@example.com')
    await api.submit({ postId: null, content: { ...valid, body: `${valid.body} #newtopic` }, clientKey: 'k' })
    expect((await api.listTags()).some((t) => t.slug === 'newtopic')).toBe(false)
  })
})
