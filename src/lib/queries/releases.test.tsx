// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  invalidateEnvironmentReleases,
  useCreateGitlabDeployKey,
  useCreateSource,
  useDeleteSource,
  useGitInstallations,
  useInstallationRepositories,
  useRollbackEnvironment,
  useServiceReleases,
  useSourceDetail,
  useSourceInspection,
  useSources,
  useUpdateSource,
} from '@/lib/queries/releases'

const {
  fetchServiceReleases,
  rollbackEnvironment,
  fetchSources,
  fetchSource,
  inspectSource,
  fetchGitInstallations,
  fetchInstallationRepositories,
  createSource,
  createGitlabDeployKey,
  updateSource,
  deleteSource,
} = vi.hoisted(() => ({
  fetchServiceReleases: vi.fn(),
  rollbackEnvironment: vi.fn(),
  fetchSources: vi.fn(),
  fetchSource: vi.fn(),
  inspectSource: vi.fn(),
  fetchGitInstallations: vi.fn(),
  fetchInstallationRepositories: vi.fn(),
  createSource: vi.fn(),
  createGitlabDeployKey: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchServiceReleases,
    rollbackEnvironment,
    fetchSources,
    fetchSource,
    inspectSource,
    fetchGitInstallations,
    fetchInstallationRepositories,
    createSource,
    createGitlabDeployKey,
    updateSource,
    deleteSource,
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
  const sourceId = 'src-1'
  const installationId = 'inst-1'

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

  it('useSources loads org repository bindings', async () => {
    fetchSources.mockResolvedValueOnce({ sources: [] })

    const { result } = renderHook(() => useSources(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchSources).toHaveBeenCalled()
  })

  it('useSources stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useSources(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSources).not.toHaveBeenCalled()
  })

  it('useSourceDetail stays off by default', () => {
    const { result } = renderHook(
      () => useSourceDetail(orgId, sourceId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSource).not.toHaveBeenCalled()
  })

  it('useSourceDetail loads when explicitly enabled', async () => {
    fetchSource.mockResolvedValueOnce({
      source: { id: sourceId, name: 'repo' },
    })

    const { result } = renderHook(
      () => useSourceDetail(orgId, sourceId, { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchSource).toHaveBeenCalledWith(sourceId)
  })

  it('useSourceInspection stays off by default', () => {
    const { result } = renderHook(
      () => useSourceInspection(orgId, sourceId, 'main'),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(inspectSource).not.toHaveBeenCalled()
  })

  it('useSourceInspection loads when explicitly enabled', async () => {
    inspectSource.mockResolvedValueOnce({ files: [] })

    const { result } = renderHook(
      () =>
        useSourceInspection(orgId, sourceId, 'main', { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(inspectSource).toHaveBeenCalledWith(sourceId, 'main')
  })

  it('useGitInstallations loads provider connections', async () => {
    fetchGitInstallations.mockResolvedValueOnce({ installations: [] })

    const { result } = renderHook(() => useGitInstallations(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchGitInstallations).toHaveBeenCalled()
  })

  it('useInstallationRepositories stays idle without installation id', () => {
    const { result } = renderHook(
      () => useInstallationRepositories(orgId, ''),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchInstallationRepositories).not.toHaveBeenCalled()
  })

  it('useInstallationRepositories loads repositories for one connection', async () => {
    fetchInstallationRepositories.mockResolvedValueOnce({ repositories: [] })

    const { result } = renderHook(
      () => useInstallationRepositories(orgId, installationId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchInstallationRepositories).toHaveBeenCalledWith(installationId)
  })

  it('useCreateSource invalidates the sources cache', async () => {
    createSource.mockResolvedValueOnce({ ok: true, id: 'src-2' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateSource(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        provider: 'github',
        installationId,
        repositoryUrl: 'https://github.com/org/repo.git',
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    })
  })

  it('useCreateGitlabDeployKey invalidates the sources cache', async () => {
    createGitlabDeployKey.mockResolvedValueOnce({
      credentialId: 'cred-1',
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
        queryKey: queryKeys.org(orgId).sources.all,
      })
    })
  })

  it('useUpdateSource patches a source row', async () => {
    updateSource.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateSource(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        sourceId,
        patch: { autoDeploy: 'disabled' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateSource).toHaveBeenCalledWith(sourceId, {
      autoDeploy: 'disabled',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    })
  })

  it('useDeleteSource disconnects a repository', async () => {
    deleteSource.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteSource(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run(sourceId)).resolves.toMatchObject({
      ok: true,
    })

    expect(deleteSource).toHaveBeenCalledWith(sourceId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    })
  })
})
