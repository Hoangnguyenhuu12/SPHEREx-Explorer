import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import { forumPostPath } from '../../../app/config'
import { plural } from '../format'
import { useLanguage } from '../../../shared/i18n/language'
import { demoPost } from '../translations'
import { excerpt } from '../markdown'
import { StableForumCopy } from './StableForumCopy'
import { StableLabel } from '../../../shared/i18n/StableLabel'
import type { PostSummary } from '../types'
import { ObservationHint, TagChips, TimeAgo } from './bits'

export function PostListItem({ post }: { post: PostSummary }) {
  const { lang } = useLanguage()
  const translated = demoPost(post.author.id, post.title, post.excerpt, 'vi', true)
  const title = lang === 'vi' && translated ? translated.title : post.title
  const text = lang === 'vi' && translated ? excerpt(translated.body) : post.excerpt
  return (
    <article className="post-row">
      <h2 className="post-row__title">
        <Link to={forumPostPath(post.id)}>{translated ? <StableForumCopy alternate={lang === 'vi' ? post.title : translated.title}>{title}</StableForumCopy> : title}</Link>
      </h2>
      <p className="post-row__excerpt">{translated ? <StableForumCopy alternate={lang === 'vi' ? post.excerpt : excerpt(translated.body)}>{text}</StableForumCopy> : text}</p>
      {post.observationLink && <ObservationHint href={post.observationLink} />}
      <div className="post-row__foot">
        <TagChips tags={post.tags} />
        <p className="post-row__meta">
          <span>{post.author.displayName}</span>
          <TimeAgo iso={post.publishedAt} />
          <span className="post-row__comments">
            <MessageSquare aria-hidden />
            <StableLabel text={lang === 'vi' ? `${post.commentCount} bình luận` : plural(post.commentCount, 'comment')} alt={lang === 'vi' ? plural(post.commentCount, 'comment') : `${post.commentCount} bình luận`} />
          </span>
        </p>
      </div>
    </article>
  )
}
