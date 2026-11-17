import { useState } from 'react'
import { TEAM } from '../../shared/config/team'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase()
}

/** About Us: one circular portrait per member, with name and role. */
export function TeamGrid() {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  return (
    <ul className="team-grid">
      {TEAM.map((m) => (
        <li key={m.name} className="team-card">
          {failed[m.name] ? (
            <span className="avatar avatar--fallback" role="img" aria-label={`Portrait of ${m.name}`}>
              {initials(m.name)}
            </span>
          ) : (
            <img
              className="avatar"
              src={m.photo}
              alt={`Portrait of ${m.name}`}
              width={112}
              height={112}
              decoding="async"
              onError={() => setFailed((prev) => ({ ...prev, [m.name]: true }))}
            />
          )}
          <h4 className="team-card__name">{m.name}</h4>
          <p className="team-card__role">{m.role}</p>
        </li>
      ))}
    </ul>
  )
}
