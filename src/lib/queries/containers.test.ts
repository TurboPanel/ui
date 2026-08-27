// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContainerRecord } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { COMMAND_POLL_MS } from '@/lib/queries/commands'
import {
  CONTAINER_LOG_TAIL_POLL_MS,
  useContainerLogTail,
  useContainers,
  useContainersByProject,
  useContainersByServices,
} from '@/lib/queries/containers'

const { fetchContainers, fetchContainerLogTail } = vi.hoisted(() => ({
  fetchContainers: vi.fn(),
  fetchContainerLogTail: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchContainers,
    fetchContainerLogTail,
  }
})

function createTestQueryClient(): ReturnType<typeof createAppQueryClient> {
  const client = createAppQueryClient()
  client.setDefaultOptions({
    queries: { retry: false },
  })
  return client
}

function createWrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

function resolveRefetchInterval(
  client: ReturnType<typeof createAppQueryClient>,
  queryKey: readonly unknown[],
  data?: unknown,
): number | false | undefined {
  const query = client.getQueryCache().find({ queryKey })
  if (!query) throw new TypeError('expected query in cache')
  const interval = (
    query.options as { refetchInterval?: unknown }
  ).refetchInterval
  if (typeof interval === 'function') {
    if (data !== undefined) {
      query.setState({ ...query.state, data })
    }
    return interval(query) as number | false
  }
  if (typeof interval === 'number' || interval === false) return interval
  return undefined
}

function queryFocusOption(
  client: ReturnType<typeof createAppQueryClient>,
  queryKey: readonly unknown[],
): boolean | undefined {
  const query = client.getQueryCache().find({ queryKey })
  if (!query) throw new TypeError('expected query in cache')
  return (query.options as { refetchOnWindowFocus?: boolean }).refetchOnWindowFocus
}

function row(
  overrides: Partial<ContainerRecord> = {},
): ContainerRecord {
  return {
    id: overrides.id ?? 'row-1',
    serviceId: overrides.serviceId ?? 'svc-1',
    environmentId: overrides.environmentId ?? 'env-1',
    serverId: overrides.serverId ?? 'srv-1',
    containerId: overrides.containerId ?? '',
    containerName: overrides.containerName ?? 'web',
    status: overrides.status ?? 'pending',
    role: overrides.role ?? 'service',
    composeServiceName: overrides.composeServiceName ?? 'web',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useContainers', () => {
  const orgId = 'org-1'

  it('loads a filtered list', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [row({ id: 'c1' })],
    })

    const { result } = renderHook(
      () => useContainers(orgId, { projectId: 'proj-1' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchContainers).toHaveBeenCalledWith({ projectId: 'proj-1' })
    expect(result.current.data?.containers).toHaveLength(1)
  })

  it('stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useContainers(orgId, undefined, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useContainers(''), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchContainers).not.toHaveBeenCalled()
  })

  it('polls observeUntilHostDeployed until a host id is stamped', async () => {
    const client = createTestQueryClient()
    const pending = [row({ status: 'pending', containerId: '' })]
    fetchContainers.mockResolvedValue({ containers: pending })

    renderHook(
      () =>
        useContainers(orgId, { projectId: 'proj-1' }, {
          observeUntilHostDeployed: true,
        }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).containers.list({ projectId: 'proj-1' })
    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, key, { containers: pending }),
      ).toBe(COMMAND_POLL_MS)
    })
    expect(resolveRefetchInterval(client, key, { containers: [] })).toBe(false)
    expect(resolveRefetchInterval(client, key, {})).toBe(false)
    expect(
      resolveRefetchInterval(client, key, {
        containers: [row({ status: 'pending', containerId: 'abc123' })],
      }),
    ).toBe(false)
  })

  it('uses an explicit refetchInterval when not observing host deploy', async () => {
    const client = createTestQueryClient()
    fetchContainers.mockResolvedValue({ containers: [] })

    renderHook(
      () => useContainers(orgId, undefined, { refetchInterval: 4_000 }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).containers.list()
    await waitFor(() => {
      expect(resolveRefetchInterval(client, key)).toBe(4_000)
    })
  })

  it('defaults refetch to off without observeUntilHostDeployed', async () => {
    const client = createTestQueryClient()
    fetchContainers.mockResolvedValue({ containers: [] })

    renderHook(() => useContainers(orgId), {
      wrapper: createWrapper(client),
    })

    const key = queryKeys.org(orgId).containers.list()
    await waitFor(() => {
      expect(resolveRefetchInterval(client, key)).toBe(false)
    })
  })
})

describe('useContainersByProject', () => {
  const orgId = 'org-1'
  const projectId = 'proj-1'

  it('seeds empty environment buckets and groups rows', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [
        row({ id: 'c1', environmentId: 'env-1' }),
        row({ id: 'c2', environmentId: 'env-new' }),
      ],
    })

    const { result } = renderHook(
      () =>
        useContainersByProject(orgId, projectId, {
          environmentIds: ['env-1', '', 'env-empty'],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.containersByEnv['env-1']).toHaveLength(1)
    })
    expect(result.current.containersByEnv['env-empty']).toEqual([])
    expect(result.current.containersByEnv['']).toBeUndefined()
    expect(result.current.containersByEnv['env-new']).toHaveLength(1)
    expect(fetchContainers).toHaveBeenCalledWith({ projectId })
  })

  it('groups rows when environmentIds is omitted', async () => {
    fetchContainers.mockResolvedValueOnce({
      containers: [row({ id: 'c1', environmentId: 'env-1' })],
    })

    const { result } = renderHook(
      () => useContainersByProject(orgId, projectId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.containersByEnv['env-1']).toHaveLength(1)
    })
    expect(Object.keys(result.current.containersByEnv)).toEqual(['env-1'])
  })

  it('keeps an empty map for an empty environmentIds list with no rows', async () => {
    fetchContainers.mockResolvedValueOnce({ containers: [] })

    const { result } = renderHook(
      () =>
        useContainersByProject(orgId, projectId, { environmentIds: [] }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.containersByEnv).toEqual({})
  })

  it('polls observeUntilHostDeployed until allocator pins gain a Docker id', async () => {
    const client = createTestQueryClient()
    const pending = [row({ status: 'pending', containerId: '' })]
    fetchContainers.mockResolvedValue({ containers: pending })

    renderHook(
      () =>
        useContainersByProject(orgId, projectId, {
          observeUntilHostDeployed: true,
        }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).containers.list({ projectId })
    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, key, { containers: pending }),
      ).toBe(COMMAND_POLL_MS)
    })
    expect(resolveRefetchInterval(client, key, { containers: [] })).toBe(false)
    expect(
      resolveRefetchInterval(client, key, {
        containers: [row({ status: 'running', containerId: '' })],
      }),
    ).toBe(false)
  })

  it('does not poll when observeUntilHostDeployed is omitted', async () => {
    const client = createTestQueryClient()
    fetchContainers.mockResolvedValue({
      containers: [row({ status: 'pending', containerId: '' })],
    })

    renderHook(() => useContainersByProject(orgId, projectId), {
      wrapper: createWrapper(client),
    })

    const key = queryKeys.org(orgId).containers.list({ projectId })
    await waitFor(() => {
      expect(resolveRefetchInterval(client, key)).toBe(false)
    })
  })

  it('refetchAll and refetchOne refresh the single project list query', async () => {
    fetchContainers.mockResolvedValue({
      containers: [row({ environmentId: 'env-1' })],
    })
    const client = createTestQueryClient()
    const refetchQueries = vi.spyOn(client, 'refetchQueries')

    const { result } = renderHook(
      () => useContainersByProject(orgId, projectId),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    refetchQueries.mockClear()
    await act(async () => {
      await result.current.refetchAll()
    })
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).containers.list({ projectId }),
    })

    refetchQueries.mockClear()
    await act(async () => {
      await result.current.refetchOne('env-ignored')
    })
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).containers.list({ projectId }),
    })
  })

  it('stays idle without org, project, or when disabled', () => {
    const disabled = renderHook(
      () => useContainersByProject(orgId, projectId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const emptyOrg = renderHook(() => useContainersByProject('', projectId), {
      wrapper: createWrapper(),
    })
    const emptyProject = renderHook(() => useContainersByProject(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.isLoading).toBe(false)
    expect(emptyOrg.result.current.isLoading).toBe(false)
    expect(emptyProject.result.current.isLoading).toBe(false)
    expect(fetchContainers).not.toHaveBeenCalled()
  })
})

describe('useContainersByServices', () => {
  const orgId = 'org-1'

  it('maps containers per service and skips blank service ids', async () => {
    fetchContainers.mockImplementation(async (filters: { serviceId?: string }) => {
      if (filters.serviceId === 'svc-1') {
        return { containers: [row({ id: 'c1', serviceId: 'svc-1' })] }
      }
      return { containers: [row({ id: 'c2', serviceId: 'svc-2' })] }
    })

    const { result } = renderHook(
      () => useContainersByServices(orgId, ['svc-1', '', 'svc-2']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.containersByService['svc-1']).toHaveLength(1)
    expect(result.current.containersByService['svc-2']).toHaveLength(1)
    expect(result.current.containersByService['']).toBeUndefined()
    expect(fetchContainers).toHaveBeenCalledTimes(2)
  })

  it('returns an empty map for an empty service list', () => {
    const { result } = renderHook(() => useContainersByServices(orgId, []), {
      wrapper: createWrapper(),
    })
    expect(result.current.containersByService).toEqual({})
    expect(result.current.isLoading).toBe(false)
    expect(fetchContainers).not.toHaveBeenCalled()
  })

  it('refetchAll refetches every service query', async () => {
    fetchContainers.mockResolvedValue({ containers: [] })

    const { result } = renderHook(
      () => useContainersByServices(orgId, ['svc-1', 'svc-2']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(fetchContainers).toHaveBeenCalledTimes(2)

    fetchContainers.mockClear()
    fetchContainers.mockResolvedValue({ containers: [] })
    await act(async () => {
      await result.current.refetchAll()
    })
    expect(fetchContainers).toHaveBeenCalledTimes(2)
    expect(fetchContainers).toHaveBeenCalledWith({ serviceId: 'svc-1' })
    expect(fetchContainers).toHaveBeenCalledWith({ serviceId: 'svc-2' })
  })

  it('stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useContainersByServices(orgId, ['svc-1'], { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useContainersByServices('', ['svc-1']), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.isLoading).toBe(false)
    expect(empty.result.current.isLoading).toBe(false)
    expect(fetchContainers).not.toHaveBeenCalled()
  })
})

describe('useContainerLogTail', () => {
  const orgId = 'org-1'
  const containerId = 'ctr-1'

  it('is disabled by default', () => {
    const { result } = renderHook(
      () => useContainerLogTail(orgId, containerId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchContainerLogTail).not.toHaveBeenCalled()
  })

  it('fetches a snapshot when enabled and passes tail', async () => {
    fetchContainerLogTail.mockResolvedValueOnce({ logs: 'hello' })

    const { result } = renderHook(
      () =>
        useContainerLogTail(orgId, containerId, { enabled: true, tail: 80 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchContainerLogTail).toHaveBeenCalledWith(containerId, 80)
    expect(result.current.data?.logs).toBe('hello')
  })

  it('follow polls on an interval and refetches on focus', async () => {
    const client = createTestQueryClient()
    fetchContainerLogTail.mockResolvedValue({ logs: '' })

    renderHook(
      () =>
        useContainerLogTail(orgId, containerId, {
          enabled: true,
          follow: true,
        }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).containers.logs(containerId)
    await waitFor(() => {
      expect(resolveRefetchInterval(client, key)).toBe(
        CONTAINER_LOG_TAIL_POLL_MS,
      )
    })
    expect(queryFocusOption(client, key)).toBe(true)
  })

  it('does not poll when follow is omitted', async () => {
    const client = createTestQueryClient()
    fetchContainerLogTail.mockResolvedValue({ logs: '' })

    renderHook(
      () => useContainerLogTail(orgId, containerId, { enabled: true }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).containers.logs(containerId)
    await waitFor(() => {
      expect(resolveRefetchInterval(client, key)).toBe(false)
    })
    expect(queryFocusOption(client, key)).toBe(false)
  })

  it('stays idle without org or container id', () => {
    const emptyOrg = renderHook(
      () => useContainerLogTail('', containerId, { enabled: true }),
      { wrapper: createWrapper() },
    )
    const emptyContainer = renderHook(
      () => useContainerLogTail(orgId, '', { enabled: true }),
      { wrapper: createWrapper() },
    )
    expect(emptyOrg.result.current.fetchStatus).toBe('idle')
    expect(emptyContainer.result.current.fetchStatus).toBe('idle')
    expect(fetchContainerLogTail).not.toHaveBeenCalled()
  })
})
