import { describe, expect, it } from 'vitest'
import { hasReadEligibleReplica } from './managed-read-endpoint'
import type { ManagedMemberRecord } from '@/lib/managed-services'

function member(
  partial: Pick<ManagedMemberRecord, 'role' | 'readEligible'> &
    Partial<ManagedMemberRecord>,
): ManagedMemberRecord {
  return {
    id: partial.id ?? 'm-1',
    serverId: partial.serverId ?? 'srv-1',
    serverDisplayName: partial.serverDisplayName ?? null,
    role: partial.role,
    replicaClass:
      partial.replicaClass ?? (partial.role === 'replica' ? 'failover' : null),
    readEligible: partial.readEligible,
    ordinal: partial.ordinal ?? 1,
    status: partial.status ?? 'ready',
    replicationTransport: partial.replicationTransport ?? null,
    privatePort: partial.privatePort ?? null,
  }
}

describe('hasReadEligibleReplica', () => {
  it('is false for primary-only clusters even when primary is readEligible', () => {
    expect(
      hasReadEligibleReplica([
        member({ role: 'primary', readEligible: true }),
      ]),
    ).toBe(false)
  })

  it('is true when a replica is readEligible', () => {
    expect(
      hasReadEligibleReplica([
        member({ role: 'primary', readEligible: true, id: 'p' }),
        member({
          role: 'replica',
          readEligible: true,
          id: 'r',
          ordinal: 2,
        }),
      ]),
    ).toBe(true)
  })

  it('is false when replicas exist but none are readEligible', () => {
    expect(
      hasReadEligibleReplica([
        member({ role: 'primary', readEligible: false, id: 'p' }),
        member({
          role: 'replica',
          readEligible: false,
          id: 'r',
          ordinal: 2,
        }),
      ]),
    ).toBe(false)
  })

  it('is false for empty / undefined members', () => {
    expect(hasReadEligibleReplica(undefined)).toBe(false)
    expect(hasReadEligibleReplica([])).toBe(false)
  })
})
