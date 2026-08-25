// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateHosting,
  useCreateService,
  useHostings,
  useHostingsByServices,
  useServices,
  useServicesByEnvironments,
  useUpdateHosting,
  useUpdateService,
  useUpsertHosting,
} from '@/lib/queries/services'

const {
  fetchVisibleServices,
  fetchVisibleHostings,
  createService,
  createHosting,
  updateHosting,
  updateService,
} = vi.hoisted(() => ({
  fetchVisibleServices: vi.fn(),
  fetchVisibleHostings: vi.fn(),
  createService: vi.fn(),
  createHosting: vi.fn(),
  updateHosting: vi.fn(),
  updateService: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVisibleServices,
  fetchVisibleHostings,
  createService,
  createHosting,
  updateHosting,
  updateService,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('services query hooks', () => {
  const orgId = 'org-1'
  const environmentId = 'env-1'
  const serviceId = 'svc-1'

  it('useServices loads environment services', async () => {
    fetchVisibleServices.mockResolvedValueOnce({
      services: [{ id: serviceId, name: 'web' }],
    })

    const { result } = renderHook(() => useServices(orgId, environmentId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchVisibleServices).toHaveBeenCalledWith(environmentId)
  })

  it('useHostings loads service hostings', async () => {
    fetchVisibleHostings.mockResolvedValueOnce({
      hostings: [{ id: 'host-1', name: 'app.example.com' }],
    })

    const { result } = renderHook(() => useHostings(orgId, serviceId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchVisibleHostings).toHaveBeenCalledWith(serviceId)
  })

  it('useCreateService creates service in environment', async () => {
    createService.mockResolvedValueOnce({ ok: true, id: 'svc-2' })

    const { result } = renderHook(() => useCreateService(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        environmentId,
        body: { name: 'api' },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(createService).toHaveBeenCalledWith(environmentId, {
      name: 'api',
    })
  })

  it('useUpsertHosting creates hosting when id is omitted', async () => {
    createHosting.mockResolvedValueOnce({ ok: true, id: 'host-2' })

    const { result } = renderHook(() => useUpsertHosting(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        serviceId,
        body: { name: 'www' },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(createHosting).toHaveBeenCalledWith(serviceId, {
      name: 'www',
    })
  })

  it('useUpsertHosting updates hosting when id is provided', async () => {
    updateHosting.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useUpsertHosting(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        serviceId,
        hostingId: 'host-1',
        body: { name: 'www-updated' },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateHosting).toHaveBeenCalledWith('host-1', {
      name: 'www-updated',
    })
  })

  it('useUpdateService invalidates services and hostings', async () => {
    updateService.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateService(orgId, serviceId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ name: 'api-renamed' }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateService).toHaveBeenCalledWith(serviceId, {
      name: 'api-renamed',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: expect.arrayContaining(['org', orgId, 'services']),
      })
    })
  })

  it('useCreateHosting creates hosting for one service', async () => {
    createHosting.mockResolvedValueOnce({ ok: true, id: 'host-3' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateHosting(orgId, serviceId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ name: 'app.example.com' }),
    ).resolves.toMatchObject({ ok: true })

    expect(createHosting).toHaveBeenCalledWith(serviceId, {
      name: 'app.example.com',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: expect.arrayContaining([serviceId]),
      })
    })
  })

  it('useUpdateHosting updates hosting for one service', async () => {
    updateHosting.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateHosting(orgId, serviceId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({
        hostingId: 'host-1',
        body: { name: 'updated.example.com' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateHosting).toHaveBeenCalledWith('host-1', {
      name: 'updated.example.com',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled()
    })
  })

  it('useHostingsByServices maps hostings by service id', async () => {
    fetchVisibleHostings.mockResolvedValueOnce({
      hostings: [{ id: 'host-1', name: 'app.example.com' }],
    })

    const { result } = renderHook(
      () => useHostingsByServices(orgId, [serviceId]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.hostingsByService[serviceId]).toHaveLength(1)
    expect(fetchVisibleHostings).toHaveBeenCalledWith(serviceId)
  })

  it('useServicesByEnvironments maps services by environment id', async () => {
    fetchVisibleServices.mockResolvedValueOnce({
      services: [{ id: serviceId, name: 'web' }],
    })

    const { result } = renderHook(
      () => useServicesByEnvironments(orgId, [environmentId]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.servicesByEnv[environmentId]).toHaveLength(1)
    expect(fetchVisibleServices).toHaveBeenCalledWith(environmentId)
  })
})
