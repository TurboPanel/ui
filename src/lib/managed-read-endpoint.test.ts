import { describe, expect, it } from 'vitest'
import {
  hasReadEligibleReplica,
  readOnlyLoginNames,
} from './managed-read-endpoint'
import type {
  ManagedMemberRecord,
  ManagedUserRecord,
} from '@/lib/managed-services'

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

function user(
  username: string,
  connectionRole: ManagedUserRecord['connectionRole'],
): ManagedUserRecord {
  return {
    id: `u-${username}`,
    username,
    databases: ['app'],
    privileges: [],
    connectionRole,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('readOnlyLoginNames', () => {
  it('keeps only read-only logins, sorted', () => {
    expect(
      readOnlyLoginNames([
        user('reports_ro', 'read-only'),
        user('app_rw', 'read-write'),
        user('analytics_ro', 'read-only'),
      ]),
    ).toEqual(['analytics_ro', 'reports_ro'])
  })

  it('is empty when no read-only login exists', () => {
    expect(readOnlyLoginNames([user('app_rw', 'read-write')])).toEqual([])
    expect(readOnlyLoginNames([])).toEqual([])
    expect(readOnlyLoginNames(undefined)).toEqual([])
  })
})
