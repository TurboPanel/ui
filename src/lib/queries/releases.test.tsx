// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  invalidateEnvironmentReleases,
  useCreateGitlabDeployKey,
  useCreateRepository,
  useDeleteRepository,
  useGitConnections,
  useConnectionRepositories,
  useRollbackEnvironment,
  useServiceReleases,
  useRepositoryDetail,
  useRepositoryInspection,
  useRepositories,
  useUpdateRepository,
  useAttachRepository,
} from '@/lib/queries/releases'

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
  deleteRepository: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
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
    deleteRepository,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
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

  it('useCreateRepository invalidates the repositories cache', async () => {
    createRepository.mockResolvedValueOnce({ ok: true, id: 'src-2' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateRepository(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        provider: 'github',
        connectionId,
        repositoryUrl: 'https://github.com/org/repo.git',
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    })
  })

  it('useCreateGitlabDeployKey invalidates the repositories cache', async () => {
    createGitlabDeployKey.mockResolvedValueOnce({
      secretId: 'cred-1',
      publicKey: 'ssh-ed25519 AAAA',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateGitlabDeployKey(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ name: 'deploy' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    })
  })

  it('useUpdateRepository patches a repository row', async () => {
    updateRepository.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateRepository(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        repositoryId,
        patch: { autoDeploy: 'disabled' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateRepository).toHaveBeenCalledWith(repositoryId, {
      autoDeploy: 'disabled',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    })
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

  it('useAttachRepository fetches the row and invalidates the list', async () => {
    const attached = {
      id: 'src-new',
      organizationId: orgId,
      connectionId,
      serviceId: null,
      environmentId: null,
      secretId: null,
      provider: 'github' as const,
      repositoryUrl: 'https://github.com/acme/api.git',
      repositoryExternalId: 'ext-1',
      defaultBranch: 'main',
      subdirectory: null,
      autoDeploy: 'immediate' as const,
      metadata: null,
      options: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    attachRepository.mockResolvedValueOnce({
      ok: true,
      id: attached.id,
      reused: false,
    })
    fetchRepository.mockResolvedValueOnce({ repository: attached })
    fetchRepositories.mockResolvedValue({ repositories: [attached] })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useAttachRepository(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        connectionId,
        repositoryExternalId: 'ext-1',
        repositoryUrl: attached.repositoryUrl,
        defaultBranch: 'main',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: attached.id, repository: attached },
    })
    expect(attachRepository).toHaveBeenCalledWith({
      connectionId,
      repositoryExternalId: 'ext-1',
      repositoryUrl: attached.repositoryUrl,
      defaultBranch: 'main',
    })
    expect(fetchRepository).toHaveBeenCalledWith(attached.id)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    })
  })
})
