import { describe, expect, it } from 'vitest'
import {
  acceptInvitationPath,
  acceptInvitationTokenPath,
  invitationLandingPath,
  invitationSignInContext,
  invitationSignInDescription,
  safeAuthReturnPath,
  signInForInvitationHref,
  signInReturningTo,
  signInWithReturnHref,
} from './invitation-return'

describe('safeAuthReturnPath', () => {
  it('accepts a same-origin relative path', () => {
    expect(safeAuthReturnPath('/accept-invitation?id=abc')).toBe(
      '/accept-invitation?id=abc',
    )
  })

  it('rejects empty, protocol-relative, and absolute URLs', () => {
    expect(safeAuthReturnPath(undefined)).toBeNull()
    expect(safeAuthReturnPath('')).toBeNull()
    expect(safeAuthReturnPath('   ')).toBeNull()
    expect(safeAuthReturnPath('https://evil.example/phish')).toBeNull()
    expect(safeAuthReturnPath('//evil.example/phish')).toBeNull()
    expect(safeAuthReturnPath('/accept-invitation\\id=abc')).toBeNull()
    expect(safeAuthReturnPath('accept-invitation')).toBeNull()
  })
})

describe('invitation return hrefs', () => {
  it('builds accept and sign-in return targets from the invitation id', () => {
    const invitationId = '11111111-1111-4111-8111-111111111111'
    const acceptPath = acceptInvitationPath(invitationId)
    expect(acceptPath).toBe(`/accept-invitation?id=${invitationId}`)
    expect(signInWithReturnHref(acceptPath)).toBe(
      `/sign-in?redirectTo=${encodeURIComponent(acceptPath)}`,
    )
    expect(signInForInvitationHref(invitationId)).toBe(
      `/sign-in?redirectTo=${encodeURIComponent(acceptPath)}`,
    )
  })
})

describe('invitation sign-in hand-off', () => {
  const invitationId = '11111111-1111-4111-8111-111111111111'

  it('carries the invited email and organization to sign-in', () => {
    const href = signInForInvitationHref(invitationId, {
      email: 'ada@example.com',
      organizationName: 'Acme & Co',
    })
    const url = new URL(href, 'https://console.example')
    expect(url.pathname).toBe('/sign-in')
    expect(url.searchParams.get('redirectTo')).toBe(acceptInvitationPath(invitationId))
    expect(url.searchParams.get('email')).toBe('ada@example.com')
    expect(url.searchParams.get('org')).toBe('Acme & Co')
  })

  it('shows invitation copy only when sign-in returns to an invitation', () => {
    const redirectTo = acceptInvitationPath(invitationId)
    const context = invitationSignInContext({ redirectTo, email: ' ada@example.com ', org: 'Acme' })
    expect(context).toEqual({ email: 'ada@example.com', organizationName: 'Acme' })
    expect(invitationSignInDescription(context)).toBe('Sign in to accept your invitation to Acme.')
    expect(invitationSignInContext({ redirectTo: '/servers', org: 'Acme' })).toBeNull()
    expect(invitationSignInContext({ org: 'Acme' })).toBeNull()
    expect(invitationSignInDescription(null)).toBeUndefined()
  })

  it('drops a malformed email and an overlong organization name', () => {
    const redirectTo = acceptInvitationPath(invitationId)
    const context = invitationSignInContext({ redirectTo, email: 'not-an-email', org: 'x'.repeat(201) })
    expect(context).toEqual({})
    expect(invitationSignInDescription(context)).toBe('Sign in to accept your invitation.')
  })
})

describe('secret links', () => {
  it('returns to the emailed-secret landing page after sign-in', () => {
    const token = 'b'.repeat(64)
    const landing = acceptInvitationTokenPath(token)
    expect(landing).toBe(`/accept-invitation?token=${token}`)
    expect(invitationLandingPath({ kind: 'token', token })).toBe(landing)
    expect(invitationLandingPath({ kind: 'id', id: 'inv' })).toBe(acceptInvitationPath('inv'))
    const url = new URL(signInReturningTo(landing, { organizationName: 'Acme' }), 'https://c.example')
    expect(url.searchParams.get('redirectTo')).toBe(landing)
    expect(invitationSignInContext({ redirectTo: landing, org: 'Acme' })).toEqual({ organizationName: 'Acme' })
  })
})
