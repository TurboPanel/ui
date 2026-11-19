import { describe, expect, it } from 'vitest'
import { orgMembership, orgRouteGate } from '@/lib/org-route-gate'

const base = {
  isLoading: false,
  needsInstall: false,
  hasSession: true,
  orgId: 'org-1',
  orgAllowed: true as boolean | null,
}

describe('orgRouteGate', () => {
  it('shows the placeholder chrome while the session is read', () => {
    expect(orgRouteGate({ ...base, isLoading: true, hasSession: false })).toBe('pending')
  })

  it('shows the placeholder chrome until membership is known', () => {
    expect(orgRouteGate({ ...base, orgAllowed: null })).toBe('pending')
  })

  it('renders the organization only for a confirmed member', () => {
    expect(orgRouteGate(base)).toBe('ready')
  })

  it('sends a non-member to the organization list', () => {
    expect(orgRouteGate({ ...base, orgAllowed: false })).toBe('organizations')
  })

  it('sends an organization-less route to the organization list', () => {
    expect(orgRouteGate({ ...base, orgId: undefined, orgAllowed: null })).toBe('organizations')
  })

  it('redirects before checking membership when install or sign-in is needed', () => {
    expect(orgRouteGate({ ...base, needsInstall: true, orgAllowed: null })).toBe('install')
    expect(orgRouteGate({ ...base, hasSession: false, orgAllowed: null })).toBe('sign-in')
  })
})

describe('orgMembership', () => {
  const orgs = [{ id: 'org-1' }, { id: 'org-2' }]
  const input = {
    orgId: 'org-1',
    hasSession: true,
    isPending: false,
    isError: false,
    organizations: orgs,
  }

  it('is unknown without a session, an id or an answer', () => {
    expect(orgMembership({ ...input, hasSession: false })).toBeNull()
    expect(orgMembership({ ...input, orgId: undefined })).toBeNull()
    expect(orgMembership({ ...input, isPending: true, organizations: undefined })).toBeNull()
  })

  it('confirms a listed organization and refuses an unlisted one', () => {
    expect(orgMembership(input)).toBe(true)
    expect(orgMembership({ ...input, orgId: 'org-9' })).toBe(false)
  })

  it('treats a failed read (403 or 404) as not a member', () => {
    expect(orgMembership({ ...input, isError: true, organizations: undefined })).toBe(false)
    expect(orgMembership({ ...input, organizations: undefined })).toBe(false)
  })
})
