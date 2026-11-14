import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { forumKeys } from '../queries'

/** After any moderation decision, refresh everything that can show the affected content. */
export function useRefreshAfterModeration() {
  const qc = useQueryClient()
  return useCallback(
    (postId?: string) => {
      qc.invalidateQueries({ queryKey: forumKeys.moderation })
      qc.invalidateQueries({ queryKey: forumKeys.lists })
      qc.invalidateQueries({ queryKey: forumKeys.tags })
      if (postId) {
        qc.invalidateQueries({ queryKey: forumKeys.post(postId) })
        qc.invalidateQueries({ queryKey: forumKeys.comments(postId) })
      }
    },
    [qc],
  )
}
