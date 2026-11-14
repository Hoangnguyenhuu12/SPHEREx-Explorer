import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { forumApi } from './api'
import type { ListQuery } from './types'

/**
 * Every Forum key starts with 'forum'. AuthProvider removes them all on login, logout and role
 * change, so private data never carries over to another account (AC12).
 */
export const forumKeys = {
  all: ['forum'] as const,
  tags: ['forum', 'tags'] as const,
  lists: ['forum', 'list'] as const,
  list: (q: ListQuery) => ['forum', 'list', q] as const,
  post: (id: string) => ['forum', 'post', id] as const,
  comments: (id: string) => ['forum', 'comments', id] as const,
  mine: ['forum', 'private', 'mine'] as const,
  notifications: ['forum', 'private', 'notifications'] as const,
  editor: (id: string) => ['forum', 'private', 'editor', id] as const,
  moderation: ['forum', 'admin'] as const,
  counts: ['forum', 'admin', 'counts'] as const,
  queue: ['forum', 'admin', 'queue'] as const,
  submission: (id: string) => ['forum', 'admin', 'submission', id] as const,
  reports: ['forum', 'admin', 'reports'] as const,
  hidden: ['forum', 'admin', 'hidden'] as const,
  allTags: ['forum', 'admin', 'tags'] as const,
}

export function useTags() {
  return useQuery({ queryKey: forumKeys.tags, queryFn: () => forumApi.listTags(), staleTime: 60_000 })
}

export function usePosts(q: ListQuery) {
  return useQuery({ queryKey: forumKeys.list(q), queryFn: () => forumApi.listPosts(q), placeholderData: (prev) => prev })
}

export function usePost(id: string) {
  return useQuery({ queryKey: forumKeys.post(id), queryFn: () => forumApi.getPost(id) })
}

export function useComments(id: string, enabled = true) {
  return useQuery({ queryKey: forumKeys.comments(id), queryFn: () => forumApi.listComments(id), enabled })
}

export function useMyPosts() {
  const { user } = useSession()
  return useQuery({ queryKey: forumKeys.mine, queryFn: () => forumApi.myPosts(), enabled: Boolean(user) })
}

export function useNotifications() {
  const { user } = useSession()
  return useQuery({ queryKey: forumKeys.notifications, queryFn: () => forumApi.notifications(), enabled: Boolean(user) })
}
