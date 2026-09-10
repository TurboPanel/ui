// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useContainers } from '@/lib/queries/containers'
import { useEnvironments } from '@/lib/queries/environments'
import { useProjects } from '@/lib/queries/projects'
import { useServices } from '@/lib/queries/services'
import { useServerSystemIngress } from '@/lib/queries/system'
import { useWorkspaces } from '@/lib/queries/workspaces'
import {
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  TURBOPANEL_WORKSPACE_KIND,
} from '@/lib/system-inventory'

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
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

function idleQuery() {
  return { data: undefined, isLoading: false, error: null }
}

function mockTree(overrides: {
  workspaces?: unknown
  projects?: unknown
  environments?: unknown
  services?: unknown
  containers?: unknown
}) {
  vi.mocked(useWorkspaces).mockReturnValue(
    (overrides.workspaces ?? idleQuery()) as ReturnType<typeof useWorkspaces>,
  )
  vi.mocked(useProjects).mockReturnValue(
    (overrides.projects ?? idleQuery()) as ReturnType<typeof useProjects>,
  )
  vi.mocked(useEnvironments).mockReturnValue(
    (overrides.environments ?? idleQuery()) as ReturnType<typeof useEnvironments>,
  )
  vi.mocked(useServices).mockReturnValue(
    (overrides.services ?? idleQuery()) as ReturnType<typeof useServices>,
  )
  vi.mocked(useContainers).mockReturnValue(
    (overrides.containers ?? idleQuery()) as ReturnType<typeof useContainers>,
  )
}

function platformWorkspace() {
  return {
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
  }
}

function ingressProject() {
  return {
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
  }
}

function ingressEnvironment(serverId: string) {
  return {
    data: {
      environments: [{ id: 'env-ingress', name: 'Ingress', serverId }],
    },
    isLoading: false,
    error: null,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useServerSystemIngress remaining branches', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('is loading while projects load after the platform workspace is known', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: { data: undefined, isLoading: true, error: null },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.workspaceId).toBe('ws-platform')
    expect(result.current.projectId).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('is loading while environments load after the ingress project is known', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: { data: undefined, isLoading: true, error: null },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.projectId).toBe('proj-ingress')
    expect(result.current.environment).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('is loading while services or containers load for a provisioned environment', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: { data: undefined, isLoading: true, error: null },
      containers: { data: { containers: [] }, isLoading: false, error: null },
    })

    const servicesLoading = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )
    expect(servicesLoading.result.current.environment?.id).toBe('env-ingress')
    expect(servicesLoading.result.current.isLoading).toBe(true)

    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: {
        data: { services: [{ id: 'svc-ingress', name: 'ingress' }] },
        isLoading: false,
        error: null,
      },
      containers: { data: undefined, isLoading: true, error: null },
    })
    const containersLoading = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )
    expect(containersLoading.result.current.isLoading).toBe(true)
  })

  it('surfaces the first nested query error', () => {
    const boom = new Error('projects failed')
    mockTree({
      workspaces: platformWorkspace(),
      projects: { data: undefined, isLoading: false, error: boom },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.error).toBe(boom)
  })

  it('surfaces environment, service, and container errors after parent queries succeed', () => {
    const envBoom = new Error('environments failed')
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: { data: undefined, isLoading: false, error: envBoom },
    })
    const envHook = renderHook(() => useServerSystemIngress(orgId, serverId), {
      wrapper: createWrapper(),
    })
    expect(envHook.result.current.error).toBe(envBoom)

    const svcBoom = new Error('services failed')
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: { data: undefined, isLoading: false, error: svcBoom },
    })
    const svcHook = renderHook(() => useServerSystemIngress(orgId, serverId), {
      wrapper: createWrapper(),
    })
    expect(svcHook.result.current.error).toBe(svcBoom)

    const ctrBoom = new Error('containers failed')
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: {
        data: { services: [{ id: 'svc-ingress', name: 'ingress' }] },
        isLoading: false,
        error: null,
      },
      containers: { data: undefined, isLoading: false, error: ctrBoom },
    })
    const ctrHook = renderHook(() => useServerSystemIngress(orgId, serverId), {
      wrapper: createWrapper(),
    })
    expect(ctrHook.result.current.error).toBe(ctrBoom)
  })

  it('ignores projects that are not the hosting-ingress component', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: {
        data: {
          projects: [
            {
              id: 'proj-other',
              name: 'App',
              metadata: { component: 'managed-ingress' },
            },
          ],
        },
        isLoading: false,
        error: null,
      },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.projectId).toBeNull()
    expect(result.current.status).toBe('not_provisioned')
  })

  it('returns a null service when the environment has no services', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: { data: { services: [] }, isLoading: false, error: null },
      containers: { data: { containers: [] }, isLoading: false, error: null },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.service).toBeNull()
    expect(result.current.status).toBe('pending')
  })

  it('treats a blank or non-string docker id as still pending', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: {
        data: { services: [{ id: 'svc-ingress', name: 'ingress' }] },
        isLoading: false,
        error: null,
      },
      containers: {
        data: {
          containers: [
            { id: 'ctr-1', containerId: '', status: 'running' },
            { id: 'ctr-2', containerId: 12, status: 'running' },
          ],
        },
        isLoading: false,
        error: null,
      },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('pending')
  })

  it('prefers running over exited when both are present', () => {
    mockTree({
      workspaces: platformWorkspace(),
      projects: ingressProject(),
      environments: ingressEnvironment(serverId),
      services: {
        data: { services: [{ id: 'svc-ingress', name: 'ingress' }] },
        isLoading: false,
        error: null,
      },
      containers: {
        data: {
          containers: [
            { id: 'ctr-1', containerId: 'docker-a', status: 'exited' },
            { id: 'ctr-2', containerId: 'docker-b', status: 'running' },
          ],
        },
        isLoading: false,
        error: null,
      },
    })

    const { result } = renderHook(
      () => useServerSystemIngress(orgId, serverId),
      { wrapper: createWrapper() },
    )

    expect(result.current.status).toBe('running')
  })
})
