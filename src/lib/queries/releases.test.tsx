// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../instance-api'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import {
  invalidateEnvironmentReleases,
  useCreateGitlabDeployKey,
  useCreateRepository,
  useDeleteRepository,
  useGitConnections,
  useConnectionRepositories,
  useRollbackEnvironment,
  useServiceReleases,
  useRefreshRepository,
  useRepositoryDetail,
  useRepositoryInspection,
  useRepositoryLabelsById,
  useRepositories,
  useUpdateRepository,
  useAttachRepository,
} from './releases'

const {
  fetchServiceReleases,
  rollbackEnvironment,
  fetchRepositories,
  fetchRepository,
  inspectRepository,
  fetchGitConnections,
  fetchConnectionRepositories,
  createRepository,
  attachRepository,
  createGitlabDeployKey,
  updateRepository,
  refreshRepository,
  deleteRepository,
} = vi.hoisted(() => ({
  fetchServiceReleases: vi.fn(),
  rollbackEnvironment: vi.fn(),
  fetchRepositories: vi.fn(),
  fetchRepository: vi.fn(),
  inspectRepository: vi.fn(),
  fetchGitConnections: vi.fn(),
  fetchConnectionRepositories: vi.fn(),
  createRepository: vi.fn(),
  attachRepository: vi.fn(),
  createGitlabDeployKey: vi.fn(),
  updateRepository: vi.fn(),
  refreshRepository: vi.fn(),
  deleteRepository: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return {
    ...actual,
    fetchServiceReleases,
    rollbackEnvironment,
    fetchRepositories,
    fetchRepository,
    inspectRepository,
    fetchGitConnections,
    fetchConnectionRepositories,
    createRepository,
    attachRepository,
    createGitlabDeployKey,
    updateRepository,
    refreshRepository,
    deleteRepository,
  }
})

function createTestQueryClient(): ReturnType<typeof createAppQueryClient> {
  const client = createAppQueryClient()
  client.setDefaultOptions({
    queries: { retry: false },
  })
  return client
}

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function repositoryRow(
  id: string,
  repositoryUrl: string,
): RepositoryRecord {
  return {
    id,
    organizationId: 'org1',
    connectionId: null,
    secretId: null,
    provider: 'github',
    repositoryUrl,
    repositoryExternalId: null,
    defaultBranch: 'main',
    subdirectory: null,
    autoDeploy: 'disabled',
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('releases query hooks', () => {
  const orgId = 'org-1'
  const environmentId = 'env-1'
  const repositoryId = 'src-1'
  const connectionId = 'inst-1'

  it('useServiceReleases loads releases for an environment', async () => {
    fetchServiceReleases.mockResolvedValueOnce({ releases: [] })

    const { result } = renderHook(
      () => useServiceReleases(orgId, environmentId, 'web', { limit: 5 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServiceReleases).toHaveBeenCalledWith(environmentId, 'web', {
      limit: 5,
    })
  })

  it('useServiceReleases stays idle when org or environment is empty', () => {
    const { result } = renderHook(
      () => useServiceReleases('', environmentId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServiceReleases).not.toHaveBeenCalled()
  })

  it('useServiceReleases omits limit when not provided', async () => {
    fetchServiceReleases.mockResolvedValueOnce({ releases: [] })

    const { result } = renderHook(
      () => useServiceReleases(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServiceReleases).toHaveBeenCalledWith(
      environmentId,
      undefined,
      {},
    )
  })

  it('invalidateEnvironmentReleases invalidates the environment subtree', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await invalidateEnvironmentReleases(client, orgId, environmentId)

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).environments.releases(environmentId),
      exact: false,
    })
  })

  it('useRollbackEnvironment enqueues rollback and invalidates related keys', async () => {
    rollbackEnvironment.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRollbackEnvironment(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({
        composeServiceName: 'web',
        releaseId: 'rel-1',
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).environments.releases(environmentId),
        exact: false,
      })
    })
    expect(rollbackEnvironment).toHaveBeenCalledWith(environmentId, {
      composeServiceName: 'web',
      releaseId: 'rel-1',
    })
  })

  it('useRepositories loads org repository bindings', async () => {
    fetchRepositories.mockResolvedValueOnce({ repositories: [] })

    const { result } = renderHook(() => useRepositories(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchRepositories).toHaveBeenCalled()
  })

  it('useRepositories stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useRepositories(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchRepositories).not.toHaveBeenCalled()
  })

  it('useRepositoryDetail stays off by default', () => {
    const { result } = renderHook(
      () => useRepositoryDetail(orgId, repositoryId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchRepository).not.toHaveBeenCalled()
  })

  it('useRepositoryDetail loads when explicitly enabled', async () => {
    fetchRepository.mockResolvedValueOnce({
      repository: { id: repositoryId, name: 'repo' },
    })

    const { result } = renderHook(
      () => useRepositoryDetail(orgId, repositoryId, { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchRepository).toHaveBeenCalledWith(repositoryId)
  })

  it('useRepositoryInspection stays off by default', () => {
    const { result } = renderHook(
      () => useRepositoryInspection(orgId, repositoryId, 'main'),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(inspectRepository).not.toHaveBeenCalled()
  })

  it('useRepositoryInspection loads when explicitly enabled', async () => {
    inspectRepository.mockResolvedValueOnce({ files: [] })

    const { result } = renderHook(
      () =>
        useRepositoryInspection(orgId, repositoryId, 'main', { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(inspectRepository).toHaveBeenCalledWith(repositoryId, 'main')
  })

  it('useGitConnections loads provider connections', async () => {
    fetchGitConnections.mockResolvedValueOnce({ connections: [] })

    const { result } = renderHook(() => useGitConnections(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchGitConnections).toHaveBeenCalled()
  })

  it('useConnectionRepositories stays idle without connection id', () => {
    const { result } = renderHook(
      () => useConnectionRepositories(orgId, ''),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchConnectionRepositories).not.toHaveBeenCalled()
  })

  it('useConnectionRepositories loads repositories for one connection', async () => {
    fetchConnectionRepositories.mockResolvedValueOnce({ repositories: [] })

    const { result } = renderHook(
      () => useConnectionRepositories(orgId, connectionId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchConnectionRepositories).toHaveBeenCalledWith(connectionId)
  })

  it('useDeleteRepository disconnects a repository', async () => {
    deleteRepository.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteRepository(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run(repositoryId)).resolves.toMatchObject({
      ok: true,
    })

    expect(deleteRepository).toHaveBeenCalledWith(repositoryId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    })
  })
})

describe('useRepositoryLabelsById', () => {
  it('maps repository rows to short names keyed by id', async () => {
    fetchRepositories.mockResolvedValue({
      repositories: [
        repositoryRow('r1', 'https://github.com/acme/web-api.git'),
        repositoryRow('r2', 'git@gitlab.com:acme/worker.git'),
      ],
    })

    const { result } = renderHook(() => useRepositoryLabelsById('org1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current).toEqual({ r1: 'web-api', r2: 'worker' })
    })
  })

  it('resolves an empty map when the repositories read is forbidden', async () => {
    fetchRepositories.mockRejectedValue(new Error('repositories failed: HTTP 403'))

    const { result } = renderHook(() => useRepositoryLabelsById('org1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(fetchRepositories).toHaveBeenCalled()
    })
    expect(result.current).toEqual({})
  })

  it('surfaces non-403 failures as query errors, keeping the stable empty map', async () => {
    fetchRepositories.mockRejectedValue(new Error('repositories failed: HTTP 500'))
    const client = createTestQueryClient()

    const { result } = renderHook(() => useRepositoryLabelsById('org1'), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      const query = client
        .getQueryCache()
        .find({ queryKey: queryKeys.org('org1').repositories.labels })
      expect(query?.state.status).toBe('error')
    })
    expect(result.current).toEqual({})
  })

  it('never fetches without an organization id', () => {
    const { result } = renderHook(() => useRepositoryLabelsById(''), {
      wrapper: createWrapper(),
    })

    expect(fetchRepositories).not.toHaveBeenCalled()
    expect(result.current).toEqual({})
  })
})

describe('useCreateRepository', () => {
  it('fetches the created row and appends it to the cached list', async () => {
    const created = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    createRepository.mockResolvedValue({ id: 'r1', reused: false })
    fetchRepository.mockResolvedValue({ repository: created })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const listKey = queryKeys.org('org1').repositories.list

    const { result } = renderHook(() => useCreateRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'github',
        repositoryUrl: 'https://github.com/acme/web-api.git',
      })
    })

    expect(createRepository).toHaveBeenCalledWith({
      provider: 'github',
      repositoryUrl: 'https://github.com/acme/web-api.git',
    })
    expect(fetchRepository).toHaveBeenCalledWith('r1')
    expect(client.getQueryData(listKey)).toEqual({ repositories: [created] })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org('org1').repositories.all,
    })
  })

  it('keeps the cached list unchanged when the row is already present', async () => {
    const created = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    createRepository.mockResolvedValue({ id: 'r1', reused: true })
    fetchRepository.mockResolvedValue({ repository: created })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list
    client.setQueryData(listKey, { repositories: [created] })

    const { result } = renderHook(() => useCreateRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'git',
        repositoryUrl: 'https://github.com/acme/web-api.git',
      })
    })

    expect(client.getQueryData(listKey)).toEqual({ repositories: [created] })
  })
})

describe('useAttachRepository', () => {
  it('fetches the attached row and appends it to the cached list', async () => {
    const attached = repositoryRow('r2', 'https://github.com/acme/worker.git')
    attachRepository.mockResolvedValue({ id: 'r2' })
    fetchRepository.mockResolvedValue({ repository: attached })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list
    const existing = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    client.setQueryData(listKey, { repositories: [existing] })

    const { result } = renderHook(() => useAttachRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        connectionId: 'conn1',
        repositoryExternalId: '42',
        repositoryUrl: 'https://github.com/acme/attached.git',
      })
    })

    expect(client.getQueryData(listKey)).toEqual({
      repositories: [existing, attached],
    })
  })

  it('keeps the cached list unchanged when the row is already present', async () => {
    const attached = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    attachRepository.mockResolvedValue({ id: 'r1' })
    fetchRepository.mockResolvedValue({ repository: attached })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list
    client.setQueryData(listKey, { repositories: [attached] })

    const { result } = renderHook(() => useAttachRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        connectionId: 'conn1',
        repositoryExternalId: '42',
        repositoryUrl: 'https://github.com/acme/attached.git',
      })
    })

    expect(client.getQueryData(listKey)).toEqual({ repositories: [attached] })
  })

  it('seeds the list from scratch when nothing is cached yet', async () => {
    const attached = repositoryRow('r3', 'https://github.com/acme/api.git')
    attachRepository.mockResolvedValue({ id: 'r3' })
    fetchRepository.mockResolvedValue({ repository: attached })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list

    const { result } = renderHook(() => useAttachRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        connectionId: 'conn1',
        repositoryExternalId: '7',
        repositoryUrl: 'https://github.com/acme/api.git',
      })
    })

    expect(client.getQueryData(listKey)).toEqual({ repositories: [attached] })
  })
})

describe('useCreateGitlabDeployKey', () => {
  it('mints the key and invalidates the repositories subtree', async () => {
    createGitlabDeployKey.mockResolvedValue({
      secretId: 's1',
      publicKey: 'ssh-ed25519 AAAA',
    })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateGitlabDeployKey('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: 'worker deploy key' })
    })

    expect(createGitlabDeployKey).toHaveBeenCalledWith({
      name: 'worker deploy key',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org('org1').repositories.all,
    })
  })
})

describe('useUpdateRepository', () => {
  it('patches the row and invalidates the repositories subtree', async () => {
    updateRepository.mockResolvedValue({ ok: true })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync({
        repositoryId: 'r1',
        patch: { autoDeploy: 'immediate' },
      })
    })

    expect(updateRepository).toHaveBeenCalledWith('r1', {
      autoDeploy: 'immediate',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org('org1').repositories.all,
    })
  })
})

describe('useRefreshRepository', () => {
  it('patches the refreshed row into the cached list before refetch', async () => {
    const stale = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    const refreshed = { ...stale, defaultBranch: 'trunk' }
    refreshRepository.mockResolvedValue({ repository: refreshed })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list
    const other = repositoryRow('r2', 'https://github.com/acme/worker.git')
    client.setQueryData(listKey, { repositories: [stale, other] })

    const { result } = renderHook(() => useRefreshRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync('r1')
    })

    expect(refreshRepository).toHaveBeenCalledWith('r1')
    expect(client.getQueryData(listKey)).toEqual({
      repositories: [refreshed, other],
    })
  })

  it('leaves the cache alone when no list was fetched yet', async () => {
    const refreshed = repositoryRow('r1', 'https://github.com/acme/web-api.git')
    refreshRepository.mockResolvedValue({ repository: refreshed })
    const client = createTestQueryClient()
    const listKey = queryKeys.org('org1').repositories.list

    const { result } = renderHook(() => useRefreshRepository('org1'), {
      wrapper: createWrapper(client),
    })

    await act(async () => {
      await result.current.mutateAsync('r1')
    })

    expect(client.getQueryData(listKey)).toBeUndefined()
  })
})
