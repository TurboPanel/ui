import { describe, expect, it } from 'vitest'
import type { InvitationPreview } from './instance-api'
import {
  invitationActionErrorCopy,
  invitationLandingView,
  isAccountExistsError,
  isInvitationNotFound,
  unavailableInvitationCopy,
  type InvitationLandingInput,
} from './invitation-landing'

const pending: InvitationPreview = {
  ok: true,
  status: 'pending',
  organizationName: 'Acme',
  teamName: 'Everyone',
  inviterName: 'Ada',
  email: 'new@example.com',
  accountExists: false,
}

function input(overrides: Partial<InvitationLandingInput> = {}): InvitationLandingInput {
  return {
    invitationId: 'inv-1',
    sessionLoading: false,
    sessionEmail: null,
    preview: pending,
    previewLoading: false,
    previewError: undefined,
    ...overrides,
  }
}

describe('invitationLandingView', () => {
  it('needs an id', () => {
    expect(invitationLandingView(input({ invitationId: '' }))).toEqual({ kind: 'missing-id' })
  })

  it('waits for the session and the preview', () => {
    expect(invitationLandingView(input({ sessionLoading: true })).kind).toBe('loading')
    expect(invitationLandingView(input({ previewLoading: true })).kind).toBe('loading')
    expect(invitationLandingView(input({ preview: undefined })).kind).toBe('loading')
  })

  it('a new address creates a password (that is the accept)', () => {
    expect(invitationLandingView(input())).toEqual({
      kind: 'create-password',
      organizationName: 'Acme',
      email: 'new@example.com',
    })
  })

  it('an existing account goes to sign-in with its email', () => {
    expect(invitationLandingView(input({ preview: { ...pending, accountExists: true } }))).toEqual({
      kind: 'sign-in',
      organizationName: 'Acme',
      email: 'new@example.com',
    })
  })

  it('signed in as the invited address shows the Accept button, case-insensitively', () => {
    expect(invitationLandingView(input({ sessionEmail: 'NEW@example.com ' }))).toEqual({
      kind: 'accept',
      organizationName: 'Acme',
      inviterName: 'Ada',
    })
  })

  it('signed in as someone else offers switching accounts', () => {
    expect(invitationLandingView(input({ sessionEmail: 'other@example.com' }))).toEqual({
      kind: 'wrong-account',
      organizationName: 'Acme',
      signedInAs: 'other@example.com',
      invitedEmail: 'new@example.com',
    })
  })

  it('expired, accepted and revoked invitations are unavailable', () => {
    for (const status of ['expired', 'accepted', 'revoked'] as const) {
      expect(invitationLandingView(input({ preview: { ...pending, status } }))).toEqual({
        kind: 'unavailable',
        status,
        organizationName: 'Acme',
      })
    }
  })

  it('a JSON not_found is not-found; anything else falls back without auto-accepting', () => {
    const notFound = new Error('/api/client/v1/auth/invitations/x failed: HTTP 404: not_found')
    expect(invitationLandingView(input({ previewError: notFound }))).toEqual({ kind: 'not-found' })
    const missingRoute = new Error('/api/client/v1/auth/invitations/x failed: HTTP 404')
    expect(invitationLandingView(input({ previewError: missingRoute }))).toEqual({
      kind: 'fallback',
      signedIn: false,
    })
    expect(
      invitationLandingView(input({ previewError: new Error('network'), sessionEmail: 'a@b.c' })),
    ).toEqual({ kind: 'fallback', signedIn: true })
  })
})

describe('invitation copy and error helpers', () => {
  it('describes each unavailable state', () => {
    expect(unavailableInvitationCopy('accepted', 'Acme')).toContain('already been accepted')
    expect(unavailableInvitationCopy('revoked', 'Acme')).toContain('withdrawn')
    expect(unavailableInvitationCopy('expired', 'Acme')).toContain('expired')
  })

  it('maps action errors to plain copy', () => {
    expect(invitationActionErrorCopy('nope')).toBe('Could not accept this invitation.')
    expect(invitationActionErrorCopy(new Error('x failed: HTTP 403: Forbidden'))).toContain('different email')
    expect(invitationActionErrorCopy(new Error('x failed: HTTP 404'))).toContain('could not be found')
    expect(invitationActionErrorCopy(new Error('x failed: HTTP 410: gone'))).toContain('expired')
    expect(invitationActionErrorCopy(new Error('x failed: HTTP 429'))).toContain('Too many')
    expect(invitationActionErrorCopy(new Error('boom'))).toBe('boom')
    expect(invitationActionErrorCopy(new Error(''))).toBe('Could not accept this invitation.')
  })

  it('recognises account_exists and not_found only from their JSON codes', () => {
    expect(isAccountExistsError(new Error('x failed: HTTP 409: account_exists'))).toBe(true)
    expect(isAccountExistsError(new Error('x failed: HTTP 409'))).toBe(false)
    expect(isAccountExistsError('x')).toBe(false)
    expect(isInvitationNotFound(new Error('x failed: HTTP 404: not_found'))).toBe(true)
    expect(isInvitationNotFound(new Error('x failed: HTTP 404'))).toBe(false)
  })
})
