import { describe, expect, it } from 'vitest'
import {
  resolveSiteReadiness,
  siteReadinessLabel,
} from './network-readiness'

describe('resolveSiteReadiness', () => {
  it('reports missing private CIDR and missing per-server addresses', () => {
    const readiness = resolveSiteReadiness({
      datacenter: { privateCidrs: [] },
      memberServers: [{ id: 's-1' }, { id: 's-2' }],
      datacenterScopedIps: [
        { serverId: 's-1', scope: 'datacenter' },
      ],
    })
    expect(readiness.hasPrivateCidr).toBe(false)
    expect(readiness.serversMissingPrivateAddress).toEqual(['s-2'])
  })

  it('treats any privateCidrs entry as ready for the site prefix', () => {
    const readiness = resolveSiteReadiness({
      datacenter: { privateCidrs: ['10.0.0.0/24'] },
      memberServers: [{ id: 's-1' }],
      datacenterScopedIps: [{ serverId: 's-1', scope: 'datacenter' }],
    })
    expect(readiness.hasPrivateCidr).toBe(true)
    expect(readiness.serversMissingPrivateAddress).toEqual([])
  })

  it('ignores non-datacenter-scoped IPs', () => {
    const readiness = resolveSiteReadiness({
      datacenter: { privateCidrs: ['10.0.0.0/24'] },
      memberServers: [{ id: 's-1' }],
      datacenterScopedIps: [{ serverId: 's-1', scope: 'public' }],
    })
    expect(readiness.serversMissingPrivateAddress).toEqual(['s-1'])
  })

  it('counts a member server addressed when its private IP has null datacenterId', () => {
    // Server-owned private rows often omit/null datacenterId; readiness must
    // key on serverId + scope, not site-keyed maps of ip.datacenterId.
    const readiness = resolveSiteReadiness({
      datacenter: { privateCidrs: ['10.0.0.0/24'] },
      memberServers: [{ id: 's-1' }, { id: 's-2' }],
      datacenterScopedIps: [
        {
          serverId: 's-1',
          scope: 'datacenter',
          datacenterId: null,
        },
        {
          serverId: 's-2',
          scope: 'datacenter',
          datacenterId: 'site-a',
        },
      ],
    })
    expect(readiness.hasPrivateCidr).toBe(true)
    expect(readiness.serversMissingPrivateAddress).toEqual([])
  })
})

describe('siteReadinessLabel', () => {
  it('returns the literal readiness union', () => {
    expect(
      siteReadinessLabel({
        hasPrivateCidr: false,
        serversMissingPrivateAddress: [],
      }),
    ).toBe('no-private-network')
    expect(
      siteReadinessLabel({
        hasPrivateCidr: true,
        serversMissingPrivateAddress: ['s-1'],
      }),
    ).toBe('servers-missing-address')
    expect(
      siteReadinessLabel({
        hasPrivateCidr: true,
        serversMissingPrivateAddress: [],
      }),
    ).toBe('ready')
  })
})
