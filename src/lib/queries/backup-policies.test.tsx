// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useBackupPolicies,
  useBackupRuns,
  useCreateBackupPolicy,
  useDeleteBackupPolicy,
  useUpdateBackupPolicy,
} from '@/lib/queries/backup-policies'

const {
  fetchBackupPolicies,
  fetchBackupRuns,
  createBackupPolicy,
  updateBackupPolicy,
  deleteBackupPolicy,
} = vi.hoisted(() => ({
  fetchBackupPolicies: vi.fn(),
  fetchBackupRuns: vi.fn(),
  createBackupPolicy: vi.fn(),
  updateBackupPolicy: vi.fn(),
  deleteBackupPolicy: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchBackupPolicies,
    fetchBackupRuns,
    createBackupPolicy,
    updateBackupPolicy,
    deleteBackupPolicy,
  }
})

const orgId = 'org-1'
const environmentId = 'env-1'
const reconcile = { queuedServerIds: ['srv-1'], failedServerIds: [] }

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function policiesKey() {
  return queryKeys.org(orgId).managed.backupPolicies(environmentId)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('backup policy queries', () => {
  it('useBackupPolicies loads the list', async () => {
    fetchBackupPolicies.mockResolvedValueOnce({ policies: [] })
    const { result } = renderHook(() => useBackupPolicies(orgId, environmentId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchBackupPolicies).toHaveBeenCalledWith(environmentId)
  })

  it('useBackupPolicies stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(() => useBackupPolicies(orgId, environmentId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    const empty = renderHook(() => useBackupPolicies('', environmentId), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchBackupPolicies).not.toHaveBeenCalled()
  })

  it('useBackupRuns loads a policy history with the limit', async () => {
    fetchBackupRuns.mockResolvedValueOnce({ runs: [] })
    const { result } = renderHook(
      () => useBackupRuns(orgId, environmentId, 'pol-1', { limit: 50 }),
      { wrapper: createWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchBackupRuns).toHaveBeenCalledWith(environmentId, 'pol-1', 50)
  })

  it('useBackupRuns stays idle without a policy or when disabled', () => {
    const none = renderHook(() => useBackupRuns(orgId, environmentId, null), {
      wrapper: createWrapper(),
    })
    expect(none.result.current.fetchStatus).toBe('idle')
    const disabled = renderHook(
      () => useBackupRuns(orgId, environmentId, 'pol-1', { enabled: false }),
      { wrapper: createWrapper() }
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')
    const noEnv = renderHook(() => useBackupRuns(orgId, '', 'pol-1'), {
      wrapper: createWrapper(),
    })
    expect(noEnv.result.current.fetchStatus).toBe('idle')
    expect(fetchBackupRuns).not.toHaveBeenCalled()
  })

  it('create, update and delete each invalidate the policy list', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    createBackupPolicy.mockResolvedValueOnce({ policy: {}, reconcile })
    updateBackupPolicy.mockResolvedValueOnce({ policy: {}, reconcile: null })
    deleteBackupPolicy.mockResolvedValueOnce({ ok: true, reconcile })

    const create = renderHook(() => useCreateBackupPolicy(orgId, environmentId), {
      wrapper: createWrapper(client),
    })
    const body = { name: 'Daily', schedule: '0 3 * * *', retentionKeep: 7 }
    await act(async () => {
      await create.result.current.mutateAsync(body)
    })
    expect(createBackupPolicy).toHaveBeenCalledWith(environmentId, body)

    const update = renderHook(() => useUpdateBackupPolicy(orgId, environmentId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await update.result.current.mutateAsync({ policyId: 'pol-1', body: { enabled: false } })
    })
    expect(updateBackupPolicy).toHaveBeenCalledWith(environmentId, 'pol-1', { enabled: false })

    const remove = renderHook(() => useDeleteBackupPolicy(orgId, environmentId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await remove.result.current.mutateAsync('pol-1')
    })
    expect(deleteBackupPolicy).toHaveBeenCalledWith(environmentId, 'pol-1')

    const listInvalidations = invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(policiesKey())
    )
    expect(listInvalidations).toHaveLength(3)
  })
})
