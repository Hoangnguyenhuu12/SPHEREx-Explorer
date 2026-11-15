import { describe, expect, it } from 'vitest'
import { TEAM, TEAM_NAME } from '../shared/config/team'

describe('About us team list', () => {
  it('has the six members with unique names', () => {
    expect(TEAM).toHaveLength(6)
    expect(new Set(TEAM.map((m) => m.name)).size).toBe(6)
    expect(TEAM_NAME).toBe('MINIONS')
  })

  it('gives every member a role and a WebP portrait', () => {
    for (const m of TEAM) {
      expect(m.role.trim()).not.toBe('')
      expect(m.photo).toMatch(/\.webp($|\?)/)
    }
  })
})
