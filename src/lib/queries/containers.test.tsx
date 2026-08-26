// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useContainers,
  useContainersByProject,
  useContainersByServices,
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

  it('useContainersByProject groups one project fetch by environment', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [
        { id: 'ctr-a', environmentId: 'env-a' },
        { id: 'ctr-b', environmentId: 'env-b' },
        { id: 'ctr-c', environmentId: 'env-b' },
      ],
    })

    const { result } = renderHook(
      () =>
        useContainersByProject(orgId, 'proj-1', {
          environmentIds: ['env-a', 'env-b', 'env-empty'],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    // One request for the whole project, never one per environment.
    expect(fetchContainers).toHaveBeenCalledTimes(1)
    expect(fetchContainers).toHaveBeenCalledWith({ projectId: 'proj-1' })
    expect(result.current.containersByEnv['env-a']).toHaveLength(1)
    expect(result.current.containersByEnv['env-b']).toHaveLength(2)
    // Environments with nothing running still get a bucket to read.
    expect(result.current.containersByEnv['env-empty']).toEqual([])
  })

  it('useContainersByProject buckets an environment absent from the id list', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [{ id: 'ctr-new', environmentId: 'env-created-since' }],
    })

    const { result } = renderHook(
      () =>
        useContainersByProject(orgId, 'proj-1', { environmentIds: ['env-a'] }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.containersByEnv['env-created-since']).toHaveLength(1)
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

  it('useContainersByServices maps one fetch per service id', async () => {
    fetchContainers
      .mockResolvedValueOnce({
        containers: [{ id: 'ctr-a', serviceId: 'svc-a' }],
      })
      .mockResolvedValueOnce({
        containers: [
          { id: 'ctr-b1', serviceId: 'svc-b' },
          { id: 'ctr-b2', serviceId: 'svc-b' },
        ],
      })

    const { result } = renderHook(
      () => useContainersByServices(orgId, ['svc-a', 'svc-b']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(fetchContainers).toHaveBeenCalledTimes(2)
    expect(fetchContainers).toHaveBeenCalledWith({ serviceId: 'svc-a' })
    expect(fetchContainers).toHaveBeenCalledWith({ serviceId: 'svc-b' })
    expect(result.current.containersByService['svc-a']).toHaveLength(1)
    expect(result.current.containersByService['svc-b']).toHaveLength(2)
  })

  it('useContainersByServices stays idle when orgId is empty', () => {
    const { result } = renderHook(
      () => useContainersByServices('', ['svc-a']),
      { wrapper: createWrapper() },
    )
    expect(result.current.isLoading).toBe(false)
    expect(fetchContainers).not.toHaveBeenCalled()
  })

  it('useContainersByServices skips blank service ids', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [{ id: 'ctr-a', serviceId: 'svc-a' }],
    })

    const { result } = renderHook(
      () => useContainersByServices(orgId, ['', 'svc-a']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(fetchContainers).toHaveBeenCalledTimes(1)
    expect(fetchContainers).toHaveBeenCalledWith({ serviceId: 'svc-a' })
    expect(result.current.containersByService['svc-a']).toHaveLength(1)
    expect(result.current.containersByService['']).toBeUndefined()
  })
})
