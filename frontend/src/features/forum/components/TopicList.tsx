import { Link } from 'react-router'
import { PATHS } from '../../../app/config'
import { useSession } from '../../auth/session'
import { useMyPosts, useNotifications, useTags } from '../queries'
import { COMMUNITY_RULES } from '../config'
import { useLanguage } from '../../../shared/i18n/language'

/** Left column of the Forum (Option B): topics with counts, then "Your posts" for members. */
export function TopicList({ activeTag, q, total }: { activeTag: string | null; q: string; total: number | null }) {
  const tags = useTags()
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const hrefFor = (slug: string | null) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (slug) p.set('tag', slug)
    const s = p.toString()
    return s ? `${PATHS.forum}?${s}` : PATHS.forum
  }

  return (
    <aside className="topics" aria-label={vi ? 'Các mục diễn đàn' : 'Forum sections'}>
      <nav aria-labelledby="topics-title">
        <h2 id="topics-title" className="topics__title">
          {vi ? 'Chủ đề' : 'Topics'}
        </h2>
        <ul className="topics__list">
          <li>
            <Link to={hrefFor(null)} aria-current={activeTag === null ? 'true' : undefined}>
              <span>{vi ? 'Tất cả bài viết' : 'All posts'}</span>
              {activeTag === null && total !== null && <span className="topics__count num">{total}</span>}
            </Link>
          </li>
          {tags.data
            ?.filter((t) => t.active || t.count > 0)
            .map((t) => (
              <li key={t.id}>
                <Link to={hrefFor(t.slug)} aria-current={activeTag === t.slug ? 'true' : undefined}>
                  <span>#{t.slug}</span>
                  <span className="topics__count num" aria-label={vi ? `${t.count} bài viết` : `${t.count} posts`}>
                    {t.count}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
        {tags.isError && <p className="caption">{vi ? 'Không thể tải chủ đề.' : 'Topics could not be loaded.'}</p>}
      </nav>
      <YourPosts />
      <details className="topics__rules">
        <summary>{vi ? 'Quy định cộng đồng' : 'Community rules'}</summary>
        <ul>
          {COMMUNITY_RULES.map((r, i) => (
            <li key={r}>{vi ? ['Trao đổi đúng chủ đề: SPHEREx, bầu trời và công cụ này.', 'Thêm bối cảnh: bạn đã xem gì, dùng cảm biến nào và mong đợi điều gì.', 'Không chia sẻ thông tin cá nhân của bạn hoặc người khác.', 'Hãy thân thiện với người mới. Mọi câu hỏi đều được chào đón.'][i] : r}</li>
          ))}
        </ul>
      </details>
    </aside>
  )
}

function YourPosts() {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const { user } = useSession()
  const mine = useMyPosts()
  const notes = useNotifications()
  if (!user) return null
  const action = mine.data?.filter((p) => p.group === 'action').length ?? 0
  const review = mine.data?.filter((p) => p.group === 'review').length ?? 0
  const unread = notes.data?.filter((n) => !n.read).length ?? 0
  return (
    <section className="topics__mine" aria-labelledby="mine-title">
      <h2 id="mine-title" className="topics__title">
        {vi ? 'Bài viết của bạn' : 'Your posts'}
      </h2>
      <ul className="topics__list">
        <li>
          <Link to={`${PATHS.myPosts}#action`}>
            <span>{vi ? 'Cần bạn xử lý' : 'Needs your action'}</span>
            <span className={`topics__count num${action ? ' topics__count--alert' : ''}`}>{action}</span>
          </Link>
        </li>
        <li>
          <Link to={`${PATHS.myPosts}#review`}>
            <span>{vi ? 'Đang kiểm duyệt' : 'In review'}</span>
            <span className="topics__count num">{review}</span>
          </Link>
        </li>
      </ul>
      {unread > 0 && (
        <p className="topics__updates" role="status">
          <Link to={PATHS.myPosts}>{vi ? `${unread} cập nhật mới về bài viết` : unread === 1 ? '1 new update on your posts' : `${unread} new updates on your posts`}</Link>
        </p>
      )}
    </section>
  )
}
