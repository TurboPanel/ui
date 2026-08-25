// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useCreateBinding,
  useDeleteBinding,
  useEnvironmentBindings,
  useManagedEnvironmentBindings,
  useServiceBindings,
  useUpdateBinding,
} from '@/lib/queries/bindings'

const {
  fetchBindings,
  createBinding,
  updateBinding,
  deleteBinding,
} = vi.hoisted(() => ({
  fetchBindings: vi.fn(),
  createBinding: vi.fn(),
  updateBinding: vi.fn(),
  deleteBinding: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchBindings,
  createBinding,
  updateBinding,
  deleteBinding,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('bindings query hooks', () => {
  const orgId = 'org-1'
  const serviceId = 'svc-1'
  const environmentId = 'env-1'

  it('useServiceBindings loads service-scoped bindings', async () => {
    fetchBindings.mockResolvedValueOnce({
      bindings: [{ id: 'bind-1', serviceId }],
    })

    const { result } = renderHook(
      () => useServiceBindings(orgId, serviceId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchBindings).toHaveBeenCalledWith({ serviceId })
  })

  it('useEnvironmentBindings loads environment-scoped bindings', async () => {
    fetchBindings.mockResolvedValueOnce({ bindings: [] })

    const { result } = renderHook(
      () => useEnvironmentBindings(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchBindings).toHaveBeenCalledWith({ environmentId })
  })

  it('useCreateBinding creates binding for service', async () => {
    createBinding.mockResolvedValueOnce({ ok: true, id: 'bind-2' })

    const { result } = renderHook(() => useCreateBinding(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        serviceId,
        principalId: 'principal-1',
        databaseName: 'app',
      }),
    ).resolves.toMatchObject({ ok: true, value: { ok: true, id: 'bind-2' } })
    expect(createBinding).toHaveBeenCalledWith({
      serviceId,
      principalId: 'principal-1',
      databaseName: 'app',
    })
  })

  it('useManagedEnvironmentBindings loads managed-cluster bindings', async () => {
    fetchBindings.mockResolvedValueOnce({ bindings: [] })

    const { result } = renderHook(
      () => useManagedEnvironmentBindings(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchBindings).toHaveBeenCalledWith({
      managedEnvironmentId: environmentId,
    })
  })

  it('useManagedEnvironmentBindings stays idle without managed environment id', () => {
    const { result } = renderHook(
      () => useManagedEnvironmentBindings(orgId, ''),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchBindings).not.toHaveBeenCalled()
  })

  it('useUpdateBinding updates binding and invalidates scoped lists', async () => {
    updateBinding.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateBinding(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        id: 'bind-1',
        serviceId,
        environmentId,
        body: { databaseName: 'analytics' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateBinding).toHaveBeenCalledWith('bind-1', {
      databaseName: 'analytics',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).bindings.list({ serviceId }),
      })
    })
  })

  it('useDeleteBinding deletes binding and invalidates scoped lists', async () => {
    deleteBinding.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteBinding(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        id: 'bind-1',
        serviceId,
        managedEnvironmentId: environmentId,
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(deleteBinding).toHaveBeenCalledWith('bind-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).bindings.list({
          managedEnvironmentId: environmentId,
        }),
      })
    })
  })
})
