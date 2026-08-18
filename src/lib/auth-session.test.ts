import { describe, expect, it } from 'vitest'
import {
  dashboardHref,
  hasUserSession,
  isAdminSession,
  isSuperadminSession,
} from '@/lib/auth-session'
import type { SessionInfo } from '@/lib/instance-api'

const superadmin: SessionInfo = {
  userId: 'u1',
  email: 'admin@example.com',
  role: 'superadmin',
}

const admin: SessionInfo = {
  userId: 'u2',
  email: 'ops@example.com',
  role: 'admin',
}

const member: SessionInfo = {
  userId: 'u3',
  email: 'user@example.com',
  role: 'member',
}

describe('isSuperadminSession', () => {
  it('is true only for superadmin', () => {
    expect(isSuperadminSession(superadmin)).toBe(true)
    expect(isSuperadminSession(admin)).toBe(false)
    expect(isSuperadminSession(member)).toBe(false)
    expect(isSuperadminSession(null)).toBe(false)
  })
})

describe('isAdminSession', () => {
  it('includes superadmin and admin', () => {
    expect(isAdminSession(superadmin)).toBe(true)
    expect(isAdminSession(admin)).toBe(true)
    expect(isAdminSession(member)).toBe(false)
    expect(isAdminSession(null)).toBe(false)
  })
})

describe('hasUserSession', () => {
  it('is true for any non-null session', () => {
    expect(hasUserSession(member)).toBe(true)
    expect(hasUserSession(null)).toBe(false)
  })
})

describe('dashboardHref', () => {
  it('sends hosts to install when setup is required', () => {
    expect(dashboardHref(null, true)).toBe('/install')
    expect(dashboardHref(superadmin, true)).toBe('/install')
  })

  it('sends signed-in users to welcome', () => {
    expect(dashboardHref(member, false)).toBe('/welcome')
  })

  it('sends guests to sign-in', () => {
    expect(dashboardHref(null, false)).toBe('/sign-in')
  })
})
