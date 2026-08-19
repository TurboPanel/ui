// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateBinding,
  useEnvironmentBindings,
  useServiceBindings,
} from '@/lib/queries/bindings'

const {
  fetchBindings,
  createBinding,
} = vi.hoisted(() => ({
  fetchBindings: vi.fn(),
  createBinding: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchBindings,
  createBinding,
  updateBinding: vi.fn(),
  deleteBinding: vi.fn(),
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
})
