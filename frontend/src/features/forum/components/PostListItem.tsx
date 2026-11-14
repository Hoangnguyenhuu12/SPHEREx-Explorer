import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import { forumPostPath } from '../../../app/config'
import { plural } from '../format'
import type { PostSummary } from '../types'
import { ObservationHint, TagChips, TimeAgo } from './bits'

export function PostListItem({ post }: { post: PostSummary }) {
  return (
    <article className="post-row">
      <h2 className="post-row__title">
        <Link to={forumPostPath(post.id)}>{post.title}</Link>
      </h2>
      <p className="post-row__excerpt">{post.excerpt}</p>
      {post.observationLink && <ObservationHint href={post.observationLink} />}
      <div className="post-row__foot">
        <TagChips tags={post.tags} />
        <p className="post-row__meta">
          <span>{post.author.displayName}</span>
          <TimeAgo iso={post.publishedAt} />
          <span className="post-row__comments">
            <MessageSquare aria-hidden />
            {plural(post.commentCount, 'comment')}
          </span>
        </p>
      </div>
    </article>
  )
}
