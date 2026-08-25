// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useContainers } from '@/lib/queries/containers'
import { useEnvironments } from '@/lib/queries/environments'
import { useProjects } from '@/lib/queries/projects'
import { useServices } from '@/lib/queries/services'
import {
  useRestartSystemComponent,
  useServerSystemIngress,
} from '@/lib/queries/system'
import { useWorkspaces } from '@/lib/queries/workspaces'
import {
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  TURBOPANEL_WORKSPACE_KIND,
} from '@/lib/system-inventory'

const { restartSystemComponent } = vi.hoisted(() => ({
  restartSystemComponent: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    restartSystemComponent,
  }
})

vi.mock('@/lib/queries/workspaces', () => ({
  useWorkspaces: vi.fn(),
}))

vi.mock('@/lib/queries/projects', () => ({
  useProjects: vi.fn(),
}))

vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: vi.fn(),
}))

vi.mock('@/lib/queries/services', () => ({
  useServices: vi.fn(),
}))

vi.mock('@/lib/queries/containers', () => ({
  useContainers: vi.fn(),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function mockReadyIngress(serverId: string, containers: unknown[]) {
  vi.mocked(useWorkspaces).mockReturnValue({
    data: {
      workspaces: [
        {
          id: 'ws-platform',
          name: 'TurboPanel',
          kind: TURBOPANEL_WORKSPACE_KIND,
        },
      ],
    },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useWorkspaces>)

  vi.mocked(useProjects).mockReturnValue({
    data: {
      projects: [
        {
          id: 'proj-ingress',
          name: 'Ingress',
          metadata: { component: SYSTEM_HOSTING_INGRESS_COMPONENT },
        },
      ],
    },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useProjects>)

  vi.mocked(useEnvironments).mockReturnValue({
    data: {
      environments: [
        {
          id: 'env-ingress',
          name: 'Ingress',
          serverId,
        },
      ],
    },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useEnvironments>)

  vi.mocked(useServices).mockReturnValue({
    data: { services: [{ id: 'svc-ingress', name: 'ingress' }] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useServices>)

  vi.mocked(useContainers).mockReturnValue({
    data: { containers },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useContainers>)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('system query hooks', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('useServerSystemIngress derives running ingress status', () => {
    mockReadyIngress(serverId, [
      {
        id: 'ctr-1',
        containerId: 'docker-abc',
        status: 'running',
      },
    ])

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('running')
    expect(result.current.environment?.id).toBe('env-ingress')
    expect(result.current.containers).toHaveLength(1)
  })

  it('useServerSystemIngress reports not_provisioned without an environment', () => {
    vi.mocked(useWorkspaces).mockReturnValue({
      data: { workspaces: [] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkspaces>)
    vi.mocked(useProjects).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useProjects>)
    vi.mocked(useEnvironments).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useEnvironments>)
    vi.mocked(useServices).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useServices>)
    vi.mocked(useContainers).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContainers>)

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('not_provisioned')
    expect(result.current.workspaceId).toBeNull()
    expect(result.current.projectId).toBeNull()
    expect(result.current.environment).toBeNull()
    expect(result.current.service).toBeNull()
  })

  it('useServerSystemIngress reports pending when containers lack a docker id', () => {
    mockReadyIngress(serverId, [
      { id: 'ctr-1', containerId: null, status: 'created' },
    ])

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('pending')
  })

  it('useServerSystemIngress reports pending when the environment has no containers', () => {
    mockReadyIngress(serverId, [])

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('pending')
  })

  it('useServerSystemIngress reports exited for stopped containers', () => {
    mockReadyIngress(serverId, [
      { id: 'ctr-1', containerId: 'docker-abc', status: 'exited' },
    ])

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('exited')
  })

  it('useServerSystemIngress reports pending for non-running non-exited statuses', () => {
    mockReadyIngress(serverId, [
      { id: 'ctr-1', containerId: 'docker-abc', status: 'paused' },
    ])

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('pending')
  })

  it('useServerSystemIngress surfaces loading and error from child queries', () => {
    const boom = new Error('workspaces failed')
    vi.mocked(useWorkspaces).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: boom,
    } as unknown as ReturnType<typeof useWorkspaces>)
    vi.mocked(useProjects).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useProjects>)
    vi.mocked(useEnvironments).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useEnvironments>)
    vi.mocked(useServices).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useServices>)
    vi.mocked(useContainers).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContainers>)

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBe(boom)
  })

  it('useRestartSystemComponent restarts system component', async () => {
    restartSystemComponent.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-restart',
      serverId,
    })
    const client = createAppQueryClient()
    client.setQueryData(queryKeys.org(orgId).commands.all, [])

    const { result } = renderHook(
      () => useRestartSystemComponent(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run('hosting-ingress'),
    ).resolves.toMatchObject({ ok: true })
    expect(restartSystemComponent).toHaveBeenCalledWith(
      serverId,
      'hosting-ingress',
    )
  })

  it('useRestartSystemComponent returns mutation errors', async () => {
    restartSystemComponent.mockRejectedValueOnce(new Error('offline'))

    const { result } = renderHook(
      () => useRestartSystemComponent(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run('hosting-ingress')).resolves.toEqual({
      ok: false,
      error: 'offline',
    })
  })
})
