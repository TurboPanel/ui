import { describe, expect, it } from 'vitest'
import type { ManagedMemberRecord } from '@/lib/managed-services'
import {
  alignMemberStatusesWithCluster,
  mergeManagedMembers,
} from './managed'

function member(
  overrides: Partial<ManagedMemberRecord> & Pick<ManagedMemberRecord, 'id'>,
): ManagedMemberRecord {
  return {
    id: overrides.id,
    serverId: overrides.serverId ?? 'server-1',
    serverDisplayName: overrides.serverDisplayName ?? 'host',
    role: overrides.role ?? 'primary',
    readEligible: overrides.readEligible ?? true,
    ordinal: overrides.ordinal ?? 1,
    status: overrides.status ?? 'provisioning',
    replicationTransport: overrides.replicationTransport ?? null,
    privatePort: overrides.privatePort ?? null,
  }
}

describe('mergeManagedMembers', () => {
  it('keeps a single primary when status uses id', () => {
    const detail = [member({ id: 'm1', status: 'provisioning' })]
    const status = [member({ id: 'm1', status: 'failed' })]
    const merged = mergeManagedMembers(detail, status)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('m1')
    expect(merged[0]?.status).toBe('failed')
  })

  it('does not invent a second primary when status only has memberId', () => {
    const detail = [member({ id: 'm1', status: 'provisioning' })]
    const status = [
      {
        memberId: 'm1',
        serverId: 'server-1',
        role: 'primary',
        status: 'failed',
        replicationTransport: null,
        privatePort: null,
      },
    ]
    const merged = mergeManagedMembers(detail, status)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('m1')
    expect(merged[0]?.status).toBe('failed')
    expect(merged[0]?.readEligible).toBe(true)
  })

  it('drops status rows with no identity', () => {
    const detail = [member({ id: 'm1' })]
    const status = [{ role: 'primary', status: 'failed', serverId: 'server-1' }]
    expect(mergeManagedMembers(detail, status)).toHaveLength(1)
  })
})

describe('alignMemberStatusesWithCluster', () => {
  it('marks stuck in-flight members failed when the cluster is failed', () => {
    const aligned = alignMemberStatusesWithCluster(
      [member({ id: 'm1', status: 'provisioning' })],
      'failed',
    )
    expect(aligned).toHaveLength(1)
    expect(aligned[0]?.status).toBe('failed')
  })

  it('leaves member status alone when the cluster is not failed', () => {
    const aligned = alignMemberStatusesWithCluster(
      [member({ id: 'm1', status: 'provisioning' })],
      'applying',
    )
    expect(aligned[0]?.status).toBe('provisioning')
  })
})
