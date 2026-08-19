// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
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

vi.mock('@/lib/instance-api', () => ({
  restartSystemComponent,
}))

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

afterEach(() => {
  vi.clearAllMocks()
})

describe('system query hooks', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('useServerSystemIngress derives running ingress status', () => {
    vi.mocked(useWorkspaces).mockReturnValue({
      data: {
        workspaces: [
          {
            id: 'ws-platform',
            displayName: 'TurboPanel',
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
            displayName: 'Ingress',
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
            displayName: 'Ingress',
            serverId,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useEnvironments>)

    vi.mocked(useServices).mockReturnValue({
      data: { services: [{ id: 'svc-ingress', displayName: 'ingress' }] },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useServices>)

    vi.mocked(useContainers).mockReturnValue({
      data: {
        containers: [
          {
            id: 'ctr-1',
            containerId: 'docker-abc',
            status: 'running',
          },
        ],
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContainers>)

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('running')
    expect(result.current.environment?.id).toBe('env-ingress')
    expect(result.current.containers).toHaveLength(1)
  })

  it('useRestartSystemComponent restarts system component', async () => {
    restartSystemComponent.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-restart',
      serverId,
    })

    const { result } = renderHook(
      () => useRestartSystemComponent(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await expect(
      result.current.run('hosting-ingress'),
    ).resolves.toMatchObject({ ok: true })
    expect(restartSystemComponent).toHaveBeenCalledWith(
      serverId,
      'hosting-ingress',
    )
  })
})
