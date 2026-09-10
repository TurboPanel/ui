// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useDeleteBinding,
  useEnvironmentBindings,
  useServiceBindings,
  useUpdateBinding,
} from '@/lib/queries/bindings'

const { fetchBindings, updateBinding, deleteBinding } = vi.hoisted(() => ({
  fetchBindings: vi.fn(),
  updateBinding: vi.fn(),
  deleteBinding: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchBindings,
    updateBinding,
    deleteBinding,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('binding idle and dual-scope invalidation', () => {
  const orgId = 'org-1'
  const serviceId = 'svc-1'
  const environmentId = 'env-1'
  const managedEnvironmentId = 'menv-1'

  it('useServiceBindings stays idle without a service id', () => {
    const { result } = renderHook(() => useServiceBindings(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchBindings).not.toHaveBeenCalled()
  })

  it('useEnvironmentBindings stays idle without an environment id', () => {
    const { result } = renderHook(() => useEnvironmentBindings(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchBindings).not.toHaveBeenCalled()
  })

  it('useUpdateBinding invalidates both consumer and managed-cluster lists', async () => {
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
        managedEnvironmentId,
        body: { databaseName: 'app' },
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).bindings.list({ environmentId }),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).bindings.list({ managedEnvironmentId }),
    })
  })

  it('useDeleteBinding invalidates the consumer environment list', async () => {
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
        environmentId,
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).bindings.list({ environmentId }),
      })
    })
  })
})
