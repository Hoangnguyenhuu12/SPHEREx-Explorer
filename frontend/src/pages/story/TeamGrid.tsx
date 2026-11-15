import { TEAM } from '../../shared/config/team'

/** About Us: one circular portrait per member, with name and role. */
export function TeamGrid() {
  return (
    <ul className="team-grid">
      {TEAM.map((m) => (
        <li key={m.name} className="team-card">
          <img className="avatar" src={m.photo} alt={`Portrait of ${m.name}`} width={112} height={112} loading="lazy" decoding="async" />
          <h4 className="team-card__name">{m.name}</h4>
          <p className="team-card__role">{m.role}</p>
        </li>
      ))}
    </ul>
  )
}
