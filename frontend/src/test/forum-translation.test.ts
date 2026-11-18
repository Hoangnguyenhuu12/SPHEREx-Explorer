import { describe, expect, it } from 'vitest'
import { demoComment, demoPost } from '../features/forum/translations'
import { PUBLISHED } from '../features/forum/mock/store'
import { excerpt } from '../features/forum/markdown'

describe('forum demo translations', () => {
  it('translates each unmodified sample in full and in the feed', () => {
    for (const post of PUBLISHED) {
      const full = demoPost(post.author, post.title, post.body, 'vi')
      const summary = demoPost(post.author, post.title, excerpt(post.body), 'vi', true)
      expect(full?.title).toBeTruthy()
      expect(full?.title).not.toBe(post.title)
      expect(summary).toEqual(full)
    }
  })

  it('translates sample comments but preserves user-authored or edited content', () => {
    for (const comment of PUBLISHED.flatMap((post) => post.comments ?? [])) {
      expect(demoComment(comment.author, comment.body, 'vi')).not.toBe(comment.body)
      expect(demoComment('real_user', comment.body, 'vi')).toBe(comment.body)
    }
    const post = PUBLISHED[0]
    expect(demoPost(post.author, post.title, `${post.body} changed`, 'vi')).toBeUndefined()
    expect(demoPost('real_user', post.title, post.body, 'vi')).toBeUndefined()
  })
})
