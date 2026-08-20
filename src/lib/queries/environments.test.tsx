// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useDeployEnvironment,
  useDeployPreview,
  useEnvironments,
  useRunEnvironmentLifecycle,
} from '@/lib/queries/environments'

const {
  fetchVisibleEnvironments,
  fetchDeployPreview,
  deployEnvironment,
  runEnvironmentLifecycle,
} = vi.hoisted(() => ({
  fetchVisibleEnvironments: vi.fn(),
  fetchDeployPreview: vi.fn(),
  deployEnvironment: vi.fn(),
  runEnvironmentLifecycle: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchVisibleEnvironments,
    fetchDeployPreview,
    deployEnvironment,
    runEnvironmentLifecycle,
    fetchEnvironment: vi.fn(),
    createEnvironment: vi.fn(),
    updateEnvironment: vi.fn(),
    deleteEnvironment: vi.fn(),
    stopEnvironment: vi.fn(),
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
})
