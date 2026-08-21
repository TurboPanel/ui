// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useContainers,
  useContainersByEnvironments,
} from '@/lib/queries/containers'

const { fetchContainers } = vi.hoisted(() => ({
  fetchContainers: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchContainers,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('containers query hooks', () => {
  const orgId = 'org-1'
  const environmentId = 'env-1'

  it('useContainers loads filtered containers', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [{ id: 'ctr-1', serviceId: 'svc-1' }],
    })

    const { result } = renderHook(
      () => useContainers(orgId, { environmentId }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchContainers).toHaveBeenCalledWith({ environmentId })
    expect(result.current.data?.containers).toHaveLength(1)
  })

  it('useContainersByEnvironments maps per-environment results', async () => {
    fetchContainers
      .mockResolvedValueOnce({ containers: [{ id: 'ctr-a' }] })
      .mockResolvedValueOnce({ containers: [{ id: 'ctr-b' }] })

    const { result } = renderHook(
      () => useContainersByEnvironments(orgId, ['env-a', 'env-b']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.containersByEnv['env-a']).toHaveLength(1)
    expect(result.current.containersByEnv['env-b']).toHaveLength(1)
  })

  it('useContainers accepts observeUntilHostDeployed without changing the fetch', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [{ id: 'ctr-1', serviceId: 'svc-1', status: 'pending', containerId: '' }],
    })

    const { result } = renderHook(
      () =>
        useContainers(orgId, { environmentId }, { observeUntilHostDeployed: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchContainers).toHaveBeenCalledWith({ environmentId })
    expect(result.current.data?.containers).toHaveLength(1)
  })
})
