import { useState } from 'react'
import { TEAM } from '../../shared/config/team'
import { useLanguage } from '../../shared/i18n/language'
import { HOME_COPY } from '../../shared/i18n/homeTranslations'
import { STORY_COPY } from '../../shared/i18n/storyTranslations'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase()
}

/** About Us: one circular portrait per member, with name and role. */
export function TeamGrid() {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const { lang } = useLanguage()
  const roles = HOME_COPY[lang].teamRoles
  const portraitAlt = STORY_COPY[lang].portraitAlt

  return (
    <ul className="team-grid">
      {TEAM.map((m) => {
        const alt = portraitAlt(m.name)
        return (
          <li key={m.name} className="team-card">
            {failed[m.name] ? (
              <span className="avatar avatar--fallback" role="img" aria-label={alt}>
                {initials(m.name)}
              </span>
            ) : (
              <img
                className="avatar"
                src={m.photo}
                alt={alt}
                width={112}
                height={112}
                decoding="async"
                onError={() => setFailed((prev) => ({ ...prev, [m.name]: true }))}
              />
            )}
            <h4 className="team-card__name">{m.name}</h4>
            <p className="team-card__role">{roles[m.name] ?? m.role}</p>
          </li>
        )
      })}
    </ul>
  )
}
