import { describe, expect, it } from 'vitest'
import { OrganizationDeleteBlockedError } from './instance-api'
import {
  nextOrganizationAfterDelete,
  organizationDeleteBlock,
  organizationDeleteFailure,
  organizationDeleteGate,
} from './organization-delete'

describe('organizationDeleteBlock', () => {
  it('links servers to the Servers page with the count', () => {
    const out = organizationDeleteBlock(
      new OrganizationDeleteBlockedError('organization_has_servers', 'x', 2),
      'o1'
    )
    expect(out.message).toContain('2 servers')
    expect(out.link).toEqual({ label: 'Open Servers', href: '/o1/servers' })
  })

  it('links tunnels and DNS records to Tunnels', () => {
    const tunnels = organizationDeleteBlock(
      new OrganizationDeleteBlockedError('organization_has_tunnels', 'x', 1),
      'o1'
    )
    expect(tunnels.message).toContain('1 tunnel.')
    expect(tunnels.link?.href).toBe('/o1/servers/tunnels')
    const dns = organizationDeleteBlock(
      new OrganizationDeleteBlockedError('organization_has_dns_records', 'x', 4),
      'o1'
    )
    expect(dns.message).toContain('4 DNS records')
    expect(dns.link?.href).toBe('/o1/servers/tunnels')
  })

  it('has no link for the root organization', () => {
    const out = organizationDeleteBlock(
      new OrganizationDeleteBlockedError('root_organization', 'x', 0),
      'o1'
    )
    expect(out.message).toContain('root organization')
    expect(out.link).toBeNull()
  })
})

describe('organizationDeleteFailure', () => {
  it('words 403 and 404 as not allowed', () => {
    expect(organizationDeleteFailure(new Error('/x failed: HTTP 403'), 'o').message).toContain(
      'owner or a platform admin'
    )
    expect(organizationDeleteFailure(new Error('/x failed: HTTP 404'), 'o').message).toContain(
      'not found, or you are not allowed'
    )
  })
})

describe('organizationDeleteGate', () => {
  it('disables the root and explains servers', () => {
    expect(organizationDeleteGate({ isRoot: true, serverCount: 0 }).disabled).toBe(true)
    expect(organizationDeleteGate({ isRoot: false, serverCount: 1 })).toEqual({
      disabled: true,
      reason: 'Remove its 1 server first.',
    })
    expect(organizationDeleteGate({ isRoot: false, serverCount: 0 })).toEqual({
      disabled: false,
      reason: null,
    })
  })
})

describe('nextOrganizationAfterDelete', () => {
  it('picks another organization, else null for the picker', () => {
    expect(nextOrganizationAfterDelete([{ id: 'a' }, { id: 'b' }], 'a')).toBe('b')
    expect(nextOrganizationAfterDelete([{ id: 'a' }], 'a')).toBeNull()
    expect(nextOrganizationAfterDelete([], 'a')).toBeNull()
  })
})
