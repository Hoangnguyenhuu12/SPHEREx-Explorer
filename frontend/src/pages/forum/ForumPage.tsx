import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PATHS } from '../../app/config'
import { loginPath } from '../../features/auth/returnTo'
import { useSession } from '../../features/auth/session'
import { USING_DEMO_DATA } from '../../features/forum/api'
import { EmptyState, Skeleton } from '../../features/forum/components/bits'
import { ErrorNotice, ForumHeaderActions, Pagination } from '../../features/forum/components/ForumChrome'
import { PostListItem } from '../../features/forum/components/PostListItem'
import { TopicList } from '../../features/forum/components/TopicList'
import { SEARCH_DEBOUNCE_MS } from '../../features/forum/config'
import { plural } from '../../features/forum/format'
import { usePosts, useTags } from '../../features/forum/queries'
import '../../features/forum/forum.css'
import { PageShell } from '../../shared/layout/Shell'
import { useDocumentTitle } from './useDocumentTitle'

export default function ForumPage() {
  useDocumentTitle('Forum')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tag = params.get('tag') || null
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = { q, tag, page }
  const posts = usePosts(query)
  const tags = useTags()
  const { user } = useSession()

  const [text, setText] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  // Keep the box in sync when the URL changes (Back button, clicking a tag).
  const [lastQ, setLastQ] = useState(q)
  if (lastQ !== q) {
    setLastQ(q)
    setText(q)
  }

  const apply = (nextQ: string) => {
    const p = new URLSearchParams(params)
    if (nextQ.trim()) p.set('q', nextQ.trim())
    else p.delete('q')
    p.delete('page')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    if (text.trim() === q) return
    const t = setTimeout(() => apply(text), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    apply(text)
  }

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(params)
    if (p > 1) next.set('page', String(p))
    else next.delete('page')
    return `${PATHS.forum}?${next.toString()}`
  }

  const tagInfo = tag ? tags.data?.find((t) => t.slug === tag) : null
  const filtered = Boolean(q || tag)
  const total = posts.data?.total ?? null
  const writeHref = user ? PATHS.forumNew : loginPath(PATHS.forumNew)

  return (
    <PageShell headerActions={<ForumHeaderActions />}>
      <div className="wrap forum">
        <header className="forum__head">
          <h1>Forum</h1>
          <p className="forum__lead">Ask about SPHEREx images, share what you spotted, and help others read the sky.</p>
          {USING_DEMO_DATA && (
            <p className="demo-tag forum__demo">Illustrative demo: sample posts, stored only in this browser. New posts wait for a moderator.</p>
          )}
        </header>

        <div className="forum-layout">
          <TopicList activeTag={tag} q={q} total={tag ? null : total} />

          <section className="forum-main" aria-labelledby="results-title">
            <form className="forum-search" role="search" onSubmit={submit}>
              <label htmlFor="forum-q" className="sr-only">
                Search posts
              </label>
              <Search className="forum-search__icon" aria-hidden />
              <input
                ref={inputRef}
                id="forum-q"
                name="q"
                className="input forum-search__input"
                type="search"
                placeholder="Search posts, e.g. Barnard…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
              />
              {text && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm forum-search__clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setText('')
                    apply('')
                    inputRef.current?.focus()
                  }}
                >
                  <X aria-hidden />
                </button>
              )}
            </form>

            <div className="forum-status">
              <h2 id="results-title" className="forum-status__text" aria-live="polite">
                {posts.isPending
                  ? 'Loading posts…'
                  : total === null
                    ? 'Posts'
                    : filtered
                      ? `${plural(total, 'post')}${q ? ` for “${q}”` : ''}${tag ? ` in #${tag}` : ''}`
                      : 'Latest posts'}
              </h2>
              {filtered && (
                <Link className="btn btn-ghost btn-sm" to={PATHS.forum}>
                  Clear filters
                </Link>
              )}
            </div>
            {tagInfo && !tagInfo.active && <p className="caption">This topic is retired. You can still read its posts.</p>}

            {posts.isPending ? (
              <div className="post-list">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="post-row">
                    <Skeleton lines={3} />
                  </div>
                ))}
              </div>
            ) : posts.isError ? (
              <ErrorNotice error={posts.error} onRetry={() => posts.refetch()} />
            ) : posts.data.items.length === 0 ? (
              filtered ? (
                <EmptyState
                  title="No posts match"
                  action={
                    <Link className="btn btn-secondary" to={PATHS.forum}>
                      Clear filters
                    </Link>
                  }
                >
                  Try fewer words, or look in all topics.
                </EmptyState>
              ) : (
                <EmptyState
                  title="No posts yet"
                  action={
                    <Link className="btn btn-primary" to={writeHref}>
                      Write the first post
                    </Link>
                  }
                >
                  Ask a question about something you saw in The Eyes.
                </EmptyState>
              )
            ) : (
              <>
                <div className={`post-list${posts.isPlaceholderData ? ' is-stale' : ''}`}>
                  {posts.data.items.map((p) => (
                    <PostListItem key={p.id} post={p} />
                  ))}
                </div>
                <Pagination page={posts.data.page} pageCount={posts.data.pageCount} hrefFor={hrefFor} />
              </>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  )
}
