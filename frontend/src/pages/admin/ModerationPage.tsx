import { useQuery } from '@tanstack/react-query'
import { useRef, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PATHS } from '../../app/config'
import { RequireAuth } from '../../features/auth/RequireAuth'
import { useSession } from '../../features/auth/session'
import { forumApi, USING_DEMO_DATA } from '../../features/forum/api'
import { useFlash } from '../../features/forum/components/Flash'
import { ForumHeaderActions, ForumMessage } from '../../features/forum/components/ForumChrome'
import { QueueTab } from '../../features/forum/moderation/QueueTab'
import { ReportsTab } from '../../features/forum/moderation/ReportsTab'
import { TagsTab } from '../../features/forum/moderation/TagsTab'
import { forumKeys } from '../../features/forum/queries'
import '../../features/forum/forum.css'
import '../../features/forum/moderation/moderation.css'
import { PageShell } from '../../shared/layout/Shell'
import { useDocumentTitle } from '../forum/useDocumentTitle'

const TABS = [
  { key: 'queue', label: 'Review queue' },
  { key: 'reports', label: 'Reports' },
  { key: 'tags', label: 'Topics' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default function ModerationPage() {
  useDocumentTitle('Moderation')
  return (
    <RequireAuth>
      <PageShell headerActions={<ForumHeaderActions showWrite={false} />}>
        <Gate />
      </PageShell>
    </RequireAuth>
  )
}

function Gate() {
  const { user } = useSession()
  // Hiding the page is convenience only: the API refuses members on every call (AC11).
  if (user?.role !== 'admin')
    return (
      <ForumMessage title="No access">
        Moderation is only for the moderators of this Forum.
        {USING_DEMO_DATA && ' In this demo, switch to Moderator in your account menu.'}
      </ForumMessage>
    )
  return <Moderation />
}

function Moderation() {
  const [params, setParams] = useSearchParams()
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as TabKey) : 'queue'
  const item = params.get('item')
  const counts = useQuery({ queryKey: forumKeys.counts, queryFn: () => forumApi.moderationCounts() })
  const flash = useFlash()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const go = (next: TabKey, nextItem: string | null = null) => {
    const p = new URLSearchParams()
    if (next !== 'queue') p.set('tab', next)
    if (nextItem) p.set('item', nextItem)
    setParams(p)
  }

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + TABS.length) % TABS.length
    tabRefs.current[n]?.focus()
    go(TABS[n].key)
  }

  const badge = (key: TabKey) => (key === 'queue' ? counts.data?.queue : key === 'reports' ? counts.data?.reports : undefined)

  return (
    <div className="wrap forum moderation">
      <header className="forum__head moderation__head">
        <h1>Moderation</h1>
        <p className="forum__lead">Approve posts that follow the community rules. Approval is about the rules, not about whether a finding is scientifically correct.</p>
        <p className="caption">
          <Link to={PATHS.forum}>Back to the Forum</Link>
        </p>
      </header>

      <div className="tabs moderation__tabs" role="tablist" aria-label="Moderation sections">
        {TABS.map((t, i) => {
          const n = badge(t.key)
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => go(t.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
              {n ? <span className="tab-count num">{n}</span> : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="moderation__panel">
        {tab === 'queue' && <QueueTab selected={item} onSelect={(id) => go('queue', id)} onDone={flash.show} />}
        {tab === 'reports' && <ReportsTab onDone={flash.show} />}
        {tab === 'tags' && <TagsTab onDone={flash.show} />}
      </div>
      {flash.node}
    </div>
  )
}
