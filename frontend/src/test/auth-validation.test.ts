import { describe, expect, it } from 'vitest'
import {
  passwordRules,
  validateAuth,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '../features/auth/validation'

describe('validateEmail', () => {
  it.each(['name@example.com', 'first.last+tag@sub.domain.org', '  padded@example.io  ', 'A@B.CO'])('accepts %s', (email) => {
    expect(validateEmail(email)).toBeUndefined()
  })
  it('asks for an email when empty or blank', () => {
    expect(validateEmail('')).toBe('Enter your email address.')
    expect(validateEmail('   ')).toBe('Enter your email address.')
  })
  it.each(['plain', 'no-at.example.com', 'a@b', 'a@b.c', 'a b@example.com', 'a@@example.com', '@example.com', 'a@.com', 'a@example..com', 'a@example.c0m'])(
    'rejects %s',
    (email) => {
      expect(validateEmail(email)).toMatch(/valid email/)
    },
  )
  it('rejects addresses over 254 characters', () => {
    expect(validateEmail(`${'a'.repeat(250)}@example.com`)).toMatch(/valid email/)
  })
})

describe('validatePassword', () => {
  it('requires a value in both modes', () => {
    expect(validatePassword('', 'login')).toBe('Enter your password.')
    expect(validatePassword('', 'signup')).toBe('Enter your password.')
  })
  it('does not apply strength rules when logging in', () => {
    expect(validatePassword('x', 'login')).toBeUndefined()
  })
  it('enforces length, a letter and a number on sign up', () => {
    expect(validatePassword('abc123', 'signup')).toMatch(/at least 8/)
    expect(validatePassword('abcdefgh', 'signup')).toMatch(/letter and one number/)
    expect(validatePassword('12345678', 'signup')).toMatch(/letter and one number/)
    expect(validatePassword('stars2026', 'signup')).toBeUndefined()
  })
})

describe('validateConfirmPassword', () => {
  it('requires a matching value', () => {
    expect(validateConfirmPassword('stars2026', '')).toBe('Enter your password again.')
    expect(validateConfirmPassword('stars2026', 'stars2025')).toBe('Passwords do not match.')
    expect(validateConfirmPassword('stars2026', 'stars2026')).toBeUndefined()
  })
})

describe('validateAuth', () => {
  it('ignores the confirmation field on log in', () => {
    expect(validateAuth({ email: 'a@example.com', password: 'x', confirmPassword: '' }, 'login')).toEqual({})
  })
  it('reports every invalid field on sign up', () => {
    const errors = validateAuth({ email: 'bad', password: 'short', confirmPassword: 'other' }, 'signup')
    expect(Object.keys(errors).sort()).toEqual(['confirmPassword', 'email', 'password'])
  })
  it('passes a valid sign up', () => {
    expect(validateAuth({ email: 'a@example.com', password: 'stars2026', confirmPassword: 'stars2026' }, 'signup')).toEqual({})
  })
})

describe('passwordRules', () => {
  it('tracks each requirement', () => {
    expect(passwordRules('ab1').map((r) => r.met)).toEqual([false, true, true])
    expect(passwordRules('stars2026').every((r) => r.met)).toBe(true)
  })
})
