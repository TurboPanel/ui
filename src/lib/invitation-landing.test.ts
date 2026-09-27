import { describe, expect, it } from 'vitest'
import type { InvitationPreview } from './instance-api'
import {
  invitationActionErrorCopy,
  invitationLandingView,
  invitationLinkFromParams,
  isAccountExistsError,
  isInvitationNotFound,
  unavailableInvitationCopy,
  type InvitationLandingInput,
  type InvitationLink,
} from './invitation-landing'

const TOKEN_LINK: InvitationLink = { kind: 'token', token: 'a'.repeat(64) }
const ID_LINK: InvitationLink = { kind: 'id', id: 'inv-1' }

const pending: InvitationPreview = {
  ok: true,
  status: 'pending',
  organizationName: 'Acme',
  teamName: 'Everyone',
  inviterName: 'Ada',
  invitationId: 'inv-1',
  email: 'new@example.com',
  accountExists: false,
}

/** What the id route returns: never the email or accountExists. */
const publicPending: InvitationPreview = {
  ok: true,
  status: 'pending',
  organizationName: 'Acme',
  teamName: 'Everyone',
  inviterName: 'Ada',
}

function input(overrides: Partial<InvitationLandingInput> = {}): InvitationLandingInput {
  return {
    link: TOKEN_LINK,
    sessionLoading: false,
    sessionEmail: null,
    preview: pending,
    previewLoading: false,
    previewError: undefined,
    ...overrides,
  }
}

describe('invitationLinkFromParams', () => {
  it('prefers the secret over the id and trims', () => {
    expect(invitationLinkFromParams({ token: ' abc ', id: 'x' })).toEqual({ kind: 'token', token: 'abc' })
    expect(invitationLinkFromParams({ id: ' inv ' })).toEqual({ kind: 'id', id: 'inv' })
    expect(invitationLinkFromParams({ token: '  ', id: '' })).toBeNull()
    expect(invitationLinkFromParams({})).toBeNull()
  })
})

describe('invitationLandingView — emailed secret', () => {
  it('needs a link', () => {
    expect(invitationLandingView(input({ link: null }))).toEqual({ kind: 'missing-link' })
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

  it('signed in as the invited address shows the Accept button for the id, case-insensitively', () => {
    expect(invitationLandingView(input({ sessionEmail: 'NEW@example.com ' }))).toEqual({
      kind: 'accept',
      organizationName: 'Acme',
      inviterName: 'Ada',
      invitationId: 'inv-1',
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

  it('an unknown or re-sent secret is not-found; other failures offer a retry, never an accept', () => {
    const notFound = new Error('/api/client/v1/auth/invitations/by-token/x failed: HTTP 404: not_found')
    expect(invitationLandingView(input({ previewError: notFound }))).toEqual({ kind: 'not-found' })
    expect(
      invitationLandingView(input({ previewError: new Error('network'), sessionEmail: 'a@b.c' })),
    ).toEqual({ kind: 'error' })
  })
})

describe('invitationLandingView — old id links', () => {
  it('signed out: sign in (or sign up) with the invited email, no password step, no email shown', () => {
    const view = invitationLandingView(input({ link: ID_LINK, preview: publicPending }))
    expect(view).toEqual({ kind: 'sign-in-to-accept', organizationName: 'Acme', invitationId: 'inv-1' })
  })

  it('signed in: the Accept button (the server checks the email)', () => {
    expect(
      invitationLandingView(input({ link: ID_LINK, preview: publicPending, sessionEmail: 'any@example.com' })),
    ).toEqual({ kind: 'accept', organizationName: 'Acme', inviterName: 'Ada', invitationId: 'inv-1' })
  })

  it('never offers create-password, even if a preview carried an email', () => {
    const view = invitationLandingView(input({ link: ID_LINK, preview: pending }))
    expect(view.kind).toBe('sign-in-to-accept')
  })

  it('without a preview still lets a signed-in person accept, or sends them to sign in', () => {
    const err = new Error('network')
    expect(invitationLandingView(input({ link: ID_LINK, previewError: err, sessionEmail: 'a@b.c' }))).toEqual({
      kind: 'accept',
      organizationName: 'this organization',
      inviterName: null,
      invitationId: 'inv-1',
    })
    expect(invitationLandingView(input({ link: ID_LINK, previewError: err }))).toEqual({
      kind: 'sign-in-to-accept',
      organizationName: 'this organization',
      invitationId: 'inv-1',
    })
  })

  it('unavailable states apply to id links too', () => {
    const view = invitationLandingView(input({ link: ID_LINK, preview: { ...publicPending, status: 'revoked' } }))
    expect(view).toEqual({ kind: 'unavailable', status: 'revoked', organizationName: 'Acme' })
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
    expect(invitationActionErrorCopy(new Error('x failed: HTTP 410: gone'))).toContain('re-sent')
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
