// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedMemberRecord } from '@/lib/managed-services'
import { createAppQueryClient } from '@/lib/query-client'
import {
  alignMemberStatusesWithCluster,
  mergeManagedMembers,
  useCreateEnvironmentManaged,
} from './managed'

const { createEnvironmentManaged } = vi.hoisted(() => ({
  createEnvironmentManaged: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    createEnvironmentManaged,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

function member(
  overrides: Partial<ManagedMemberRecord> & Pick<ManagedMemberRecord, 'id'>,
): ManagedMemberRecord {
  return {
    id: overrides.id,
    serverId: overrides.serverId ?? 'server-1',
    serverName: overrides.serverName ?? 'host',
    role: overrides.role ?? 'primary',
    replicaClass:
      overrides.replicaClass ??
      (overrides.role === 'replica' ? 'failover' : null),
    readEligible: overrides.readEligible ?? true,
    ordinal: overrides.ordinal ?? 1,
    status: overrides.status ?? 'provisioning',
    replicationTransport: overrides.replicationTransport ?? null,
    privatePort: overrides.privatePort ?? null,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

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
        replicaClass: null,
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

  it('drops detail members with no identity id', () => {
    const ghost = { ...member({ id: '' }), memberId: '' }
    const merged = mergeManagedMembers(
      [ghost, member({ id: 'm1', role: 'replica', ordinal: 2 })],
      null,
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('m1')
  })

  it('identifies a detail member from memberId when id is empty', () => {
    const legacy = { ...member({ id: '' }), memberId: 'legacy-1' }
    const merged = mergeManagedMembers([legacy], undefined)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('legacy-1')
  })

  it('skips non-object status rows and treats missing lists as empty', () => {
    const merged = mergeManagedMembers(undefined, [
      null,
      'not-a-member',
      12,
      member({ id: 's1', role: 'replica', ordinal: 3 }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('s1')
    expect(merged[0]?.role).toBe('replica')
  })

  it('sorts primary ahead of replicas, then by ordinal', () => {
    const merged = mergeManagedMembers(
      [
        member({ id: 'r2', role: 'replica', ordinal: 2 }),
        member({ id: 'p1', role: 'primary', ordinal: 9 }),
        member({ id: 'r1', role: 'replica', ordinal: 1 }),
      ],
      [],
    )
    expect(merged.map((row) => row.id)).toEqual(['p1', 'r1', 'r2'])
  })

  it('sorts a later primary ahead of an earlier replica', () => {
    const merged = mergeManagedMembers(
      [member({ id: 'r1', role: 'replica', ordinal: 1 })],
      [member({ id: 'p1', role: 'primary', ordinal: 1 })],
    )
    expect(merged.map((row) => row.id)).toEqual(['p1', 'r1'])
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

  it('marks applying members failed and passes through already-terminal rows', () => {
    const aligned = alignMemberStatusesWithCluster(
      [
        member({ id: 'ready', status: 'ready' }),
        member({ id: 'applying', status: 'applying' }),
        member({ id: 'failed', status: 'failed' }),
      ],
      'failed',
    )
    expect(aligned.map((row) => row.status)).toEqual([
      'ready',
      'failed',
      'failed',
    ])
  })
})

describe('useShowOnceSecretMutation error fallback', () => {
  it('uses the fallback message when the rejection is not an Error', async () => {
    createEnvironmentManaged.mockRejectedValueOnce('offline')

    const { result } = renderHook(
      () => useCreateEnvironmentManaged('org-1', 'env-1'),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run(undefined)).resolves.toEqual({
      ok: false,
      error: 'Failed to create managed service',
    })
    await waitFor(() => {
      expect(result.current.actionError).toBe('Failed to create managed service')
    })
  })
})
