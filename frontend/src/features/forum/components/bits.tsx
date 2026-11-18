/** Small presentational pieces shared by the Forum pages. */
import { CircleAlert, CircleCheck, Clock, EyeOff, PencilLine, Telescope, Undo2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PATHS } from '../../../app/config'
import { fullDate, relativeTime } from '../format'
import { describeObservation } from '../links'
import type { RevisionState, Tag } from '../types'
import { useLanguage } from '../../../shared/i18n/language'
import { StableLabel } from '../../../shared/i18n/StableLabel'

export type BadgeKind = RevisionState | 'published' | 'hidden'

const BADGES: Record<BadgeKind, { label: string; icon: LucideIcon; tone: string }> = {
  draft: { label: 'Draft', icon: PencilLine, tone: 'muted' },
  pending: { label: 'Pending review', icon: Clock, tone: 'warn' },
  approved: { label: 'Approved', icon: CircleCheck, tone: 'ok' },
  published: { label: 'Published', icon: CircleCheck, tone: 'ok' },
  rejected: { label: 'Not approved', icon: CircleAlert, tone: 'danger' },
  withdrawn: { label: 'Withdrawn', icon: Undo2, tone: 'muted' },
  hidden: { label: 'Hidden', icon: EyeOff, tone: 'danger' },
}

/** Status shown with words and an icon, never colour alone. */
export function StatusBadge({ kind, label }: { kind: BadgeKind; label?: string }) {
  const { lang } = useLanguage()
  const b = BADGES[kind]
  const Icon = b.icon
  return (
    <span className={`status status--${b.tone}`}>
      <Icon aria-hidden />
      {label ?? (lang === 'vi' ? ({ draft: 'Bản nháp', pending: 'Chờ kiểm duyệt', approved: 'Đã duyệt', published: 'Đã đăng', rejected: 'Không được duyệt', withdrawn: 'Đã rút lại', hidden: 'Đã ẩn' } as const)[kind] : b.label)}
    </span>
  )
}

export function TagChips({ tags, linked = true }: { tags: Tag[]; linked?: boolean }) {
  if (tags.length === 0) return null
  return (
    <ul className="chip-list" aria-label="Topics">
      {tags.map((t) => (
        <li key={t.id}>
          {linked ? (
            <Link className="chip" to={`${PATHS.forum}?tag=${encodeURIComponent(t.slug)}`}>
              #{t.slug}
            </Link>
          ) : (
            <span className="chip">#{t.slug}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function TimeAgo({ iso, prefix }: { iso: string; prefix?: string }) {
  const { lang } = useLanguage()
  const displayPrefix = lang === 'vi' ? ({ Posted: 'Đã đăng', Edited: 'Đã sửa', Saved: 'Đã lưu' } as Record<string, string>)[prefix ?? ''] ?? prefix : prefix
  const otherPrefix = lang === 'en' ? ({ Posted: 'Đã đăng', Edited: 'Đã sửa', Saved: 'Đã lưu' } as Record<string, string>)[prefix ?? ''] ?? prefix : prefix
  const now = Date.now()
  const text = `${displayPrefix ? `${displayPrefix} ` : ''}${relativeTime(iso, now, lang)}`
  const alt = `${otherPrefix ? `${otherPrefix} ` : ''}${relativeTime(iso, now, lang === 'vi' ? 'en' : 'vi')}`
  return (
    <time dateTime={iso} title={fullDate(iso)}>
      <StableLabel text={text} alt={alt} />
    </time>
  )
}

/** Compact one-line hint for lists: "◎ Barnard's Star · D6". */
export function ObservationHint({ href }: { href: string }) {
  const { lang } = useLanguage()
  const obs = describeObservation(href)
  if (!obs) return null
  return (
    <p className="obs-hint">
      <Telescope aria-hidden />
      <span>
        {obs.label}
        {obs.detector ? `, ${lang === 'vi' ? 'cảm biến' : 'detector'} D${obs.detector}` : ''}
      </span>
    </p>
  )
}

/** The one accent element of the Forum: a link to The Eyes shown as an observation card (AC14). */
export function ObservationLinkCard({ href }: { href: string }) {
  const { lang } = useLanguage()
  const obs = describeObservation(href)
  if (!obs) return null
  const details = [obs.detector ? `${lang === 'vi' ? 'Cảm biến' : 'Detector'} D${obs.detector}` : null, obs.fovArcmin ? (lang === 'vi' ? `trường nhìn ${obs.fovArcmin}′` : `${obs.fovArcmin}′ field`) : null].filter(Boolean)
  return (
    <div className="obs-card">
      <Telescope className="obs-card__icon" aria-hidden />
      <div className="obs-card__text">
        <p className="obs-card__label">{obs.label}</p>
        {details.length > 0 && <p className="obs-card__meta">{details.join(', ')}</p>}
      </div>
      <Link to={obs.href} className="btn btn-secondary btn-sm">
        {lang === 'vi' ? 'Mở trong Đôi mắt' : 'Open in The Eyes'}
      </Link>
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__body">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  )
}
