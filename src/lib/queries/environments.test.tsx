// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useCreateEnvironment,
  useDeleteEnvironment,
  useDeployEnvironment,
  useDeployPreview,
  useEnvironment,
  useEnvironments,
  useRunEnvironmentLifecycle,
  useStopEnvironment,
  useStopEnvironmentMutation,
  useUpdateEnvironment,
} from '@/lib/queries/environments'

const {
  fetchVisibleEnvironments,
  fetchDeployPreview,
  deployEnvironment,
  runEnvironmentLifecycle,
  fetchEnvironment,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  stopEnvironment,
} = vi.hoisted(() => ({
  fetchVisibleEnvironments: vi.fn(),
  fetchDeployPreview: vi.fn(),
  deployEnvironment: vi.fn(),
  runEnvironmentLifecycle: vi.fn(),
  fetchEnvironment: vi.fn(),
  createEnvironment: vi.fn(),
  updateEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
  stopEnvironment: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchVisibleEnvironments,
    fetchDeployPreview,
    deployEnvironment,
    runEnvironmentLifecycle,
    fetchEnvironment,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    stopEnvironment,
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

describe('environments query hooks', () => {
  const orgId = 'org-1'
  const projectId = 'proj-1'
  const environmentId = 'env-1'

  it('useEnvironments loads project environments', async () => {
    fetchVisibleEnvironments.mockResolvedValueOnce({
      environments: [{ id: environmentId, name: 'Production' }],
    })

    const { result } = renderHook(() => useEnvironments(orgId, projectId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchVisibleEnvironments).toHaveBeenCalledWith(projectId)
  })

  it('useDeployPreview does not retry placement-required errors', async () => {
    fetchDeployPreview.mockRejectedValue(
      new Error('HTTP 409: server_placement_required'),
    )

    const { result } = renderHook(
      () => useDeployPreview(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(fetchDeployPreview).toHaveBeenCalledTimes(1)
  })

  it('useDeployPreview loads prepared compose', async () => {
    fetchDeployPreview.mockResolvedValueOnce({
      composeYaml: 'services:\n  web:\n    image: nginx',
    })

    const { result } = renderHook(
      () => useDeployPreview(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchDeployPreview).toHaveBeenCalledWith(environmentId)
  })

  it('useDeployPreview stays idle when environmentId is empty', () => {
    const { result } = renderHook(() => useDeployPreview(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchDeployPreview).not.toHaveBeenCalled()
  })

  it('useEnvironment loads one environment', async () => {
    fetchEnvironment.mockResolvedValueOnce({
      environment: { id: environmentId, name: 'Production' },
    })

    const { result } = renderHook(
      () => useEnvironment(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEnvironment).toHaveBeenCalledWith(environmentId)
  })

  it('useDeployEnvironment enqueues deploy', async () => {
    deployEnvironment.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })

    const { result } = renderHook(
      () => useDeployEnvironment(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(
      result.current.run({ noCache: true }),
    ).resolves.toMatchObject({ ok: true })
    expect(deployEnvironment).toHaveBeenCalledWith(environmentId, {
      noCache: true,
    })
  })

  it('useRunEnvironmentLifecycle enqueues lifecycle action', async () => {
    runEnvironmentLifecycle.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-2',
      serverId: 'srv-1',
    })

    const { result } = renderHook(
      () => useRunEnvironmentLifecycle(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run('restart')).resolves.toMatchObject({
      ok: true,
    })
    expect(runEnvironmentLifecycle).toHaveBeenCalledWith(environmentId, 'restart')
  })

  it('useCreateEnvironment invalidates environment lists', async () => {
    createEnvironment.mockResolvedValueOnce({ ok: true, id: 'env-2' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateEnvironment(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        projectId,
        name: 'Staging',
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).environments.all,
      })
    })
  })

  it('useUpdateEnvironment invalidates environment subtree', async () => {
    updateEnvironment.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateEnvironment(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ name: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).environments.detail(environmentId),
      })
    })
  })

  it('useDeleteEnvironment invalidates environment subtree', async () => {
    deleteEnvironment.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteEnvironment(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run(environmentId)).resolves.toMatchObject({
      ok: true,
    })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).environments.all,
      })
    })
  })

  it('useStopEnvironment enqueues destructive stop', async () => {
    stopEnvironment.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-3',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useStopEnvironment(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(stopEnvironment).toHaveBeenCalledWith(environmentId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    })
  })

  it('useStopEnvironmentMutation stops any environment by id', async () => {
    stopEnvironment.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-4',
      serverId: 'srv-1',
    })

    const { result } = renderHook(
      () => useStopEnvironmentMutation(orgId),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run(environmentId)).resolves.toMatchObject({
      ok: true,
    })
    expect(stopEnvironment.mock.calls[0]?.[0]).toBe(environmentId)
  })
})
