// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEnvironmentOverviewModel } from '@/components/org/project/environment-overview/use-environment-overview'
import { configView, container, serviceRecord } from '@/lib/v4/environment-overview.fixtures'

type Query = Record<string, unknown>

const q = vi.hoisted(() => ({
  view: {} as Query,
  services: {} as Query,
  containers: {} as Query,
  hostings: {} as { hostingsByService: Record<string, never[]>; isLoading: boolean },
  tls: {} as Query,
  storage: {} as Query,
  bindings: {} as Query,
  principals: {} as Query,
  history: {} as Query,
  ips: {} as Query,
  servers: {} as Query,
  servicesOptions: [] as unknown[],
  containersOptions: [] as unknown[],
  project: null as Record<string, unknown> | null,
  selected: { id: 'env-1', name: 'Staging' } as Record<string, unknown> | null,
  projectLoading: false,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({
    orgId: 'o',
    projectId: 'p',
    project: q.project,
    selectedEnvironment: q.selected,
    loading: q.projectLoading,
  }),
}))
vi.mock('@/lib/queries/environments', () => ({ useEnvironmentConfigView: () => q.view }))
vi.mock('@/lib/queries/services', () => ({
  useServices: (_org: string, _env: string, options: unknown) => {
    q.servicesOptions.push(options)
    return q.services
  },
  useHostingsByServices: () => q.hostings,
}))
vi.mock('@/lib/queries/containers', () => ({
  useContainers: (_org: string, _filters: unknown, options: unknown) => {
    q.containersOptions.push(options)
    return q.containers
  },
}))
vi.mock('@/lib/queries/tls', () => ({ useTlsLibrary: () => q.tls }))
vi.mock('@/lib/queries/storage', () => ({ useStorage: () => q.storage }))
vi.mock('@/lib/queries/bindings', () => ({ useEnvironmentBindings: () => q.bindings }))
vi.mock('@/lib/queries/projects', () => ({ useProjectPrincipals: () => q.principals }))
vi.mock('@/lib/queries/execution-logs', () => ({
  DEPLOYMENT_POLL_MS: 5000,
  useEnvironmentDeployments: () => q.history,
}))
vi.mock('@/lib/queries/topology', () => ({ useIps: () => q.ips }))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => q.servers }))

beforeEach(() => {
  q.selected = { id: 'env-1', name: 'Staging' }
  q.projectLoading = false
  q.view = { data: configView(), isError: false }
  q.services = { data: { services: [serviceRecord('web')] }, isSuccess: true }
  q.containers = { data: { containers: [container('web', 'running')] } }
  q.hostings = { hostingsByService: {}, isLoading: false }
  q.tls = { data: { tls: [] } }
  q.storage = { data: { storage: [] } }
  q.bindings = { data: { bindings: [] } }
  q.principals = { data: { principals: [] } }
  q.history = { data: { deployments: [] } }
  q.ips = { data: { ips: [] } }
  q.servers = { data: { servers: [] } }
  q.project = null
  q.servicesOptions = []
  q.containersOptions = []
})

describe('useEnvironmentOverviewModel', () => {
  it('is ready with what each call said, and running when a container runs', () => {
    const { result } = renderHook(() => useEnvironmentOverviewModel())
    expect(result.current).toMatchObject({ state: 'ready', running: true, deployments: [] })
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.source).toMatchObject({ envName: 'Staging', tls: [], storage: [], bindings: [] })
    expect(result.current.source.containers).toHaveLength(1)
    expect(result.current.source).toMatchObject({
      publicIps: [],
      serverId: null,
      primaryHostname: null,
    })
  })

  it('reads the server from the environment, else the project, and the primary hostname', () => {
    q.project = { options: { defaultServerId: 'srv-project' } }
    let { result } = renderHook(() => useEnvironmentOverviewModel())
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.source.serverId).toBe('srv-project')
    q.selected = {
      id: 'env-1',
      name: 'Staging',
      serverId: 'srv-env',
      options: { primaryHostname: 'shop.example.com' },
    }
    ;({ result } = renderHook(() => useEnvironmentOverviewModel()))
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.source).toMatchObject({
      serverId: 'srv-env',
      primaryHostname: 'shop.example.com',
    })
  })

  it("reads the server's own public addresses for the served line", () => {
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current).toMatchObject({
      source: { serverAddresses: undefined },
    })
    q.selected = { id: 'env-1', name: 'Staging', serverId: 'srv-env' }
    q.servers = {
      data: {
        servers: [
          { id: 'srv-other', ips: [{ address: '198.51.100.9', version: 4, scope: 'public' }] },
          { id: 'srv-env', ips: [{ address: '45.32.200.170', version: 4, scope: 'public' }] },
        ],
      },
    }
    let { result } = renderHook(() => useEnvironmentOverviewModel())
    expect(result.current).toMatchObject({ source: { serverAddresses: ['45.32.200.170'] } })
    q.servers = { data: undefined }
    ;({ result } = renderHook(() => useEnvironmentOverviewModel()))
    expect(result.current).toMatchObject({ source: { serverAddresses: undefined } })
  })

  it('waits for the config view, the services and the domains', () => {
    q.view = { data: undefined, isError: false }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('loading')
    q.view = { data: configView(), isError: false }
    q.services = { data: undefined, isSuccess: false }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('loading')
    q.services = { data: { services: [] }, isSuccess: true }
    q.hostings = { hostingsByService: {}, isLoading: true }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('loading')
  })

  it('is unavailable when the config view cannot be read, so the old screen stays', () => {
    q.view = { data: undefined, isError: true }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('unavailable')
  })

  it('is unavailable when the service list fails, instead of spinning for ever', () => {
    q.services = { data: undefined, isSuccess: false, isError: true }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('unavailable')
  })

  it('with no environment selected, hands over to the old screen instead of spinning for ever', () => {
    q.selected = null
    q.view = { data: undefined, isError: false }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('unavailable')
  })

  it('with no environment yet, waits only while the project is still loading', () => {
    q.selected = null
    q.projectLoading = true
    q.view = { data: undefined, isError: false }
    expect(renderHook(() => useEnvironmentOverviewModel()).result.current.state).toBe('loading')
  })

  it('leaves out what a failed call would have said instead of guessing', () => {
    q.containers = { data: undefined }
    q.tls = { data: undefined }
    q.storage = { data: undefined }
    q.bindings = { data: undefined }
    q.principals = { data: undefined }
    q.history = { data: undefined }
    q.ips = { data: undefined }
    const { result } = renderHook(() => useEnvironmentOverviewModel())
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.running).toBe(false)
    expect(result.current.source).toMatchObject({
      containers: undefined,
      tls: undefined,
      storage: [],
      bindings: [],
      principals: [],
      publicIps: undefined,
    })
    expect(result.current.deployments).toEqual([])
  })

  it('follows a running deploy: the apps and containers are read again at the history pace', () => {
    q.history = { data: { deployments: [{ id: 'd1', generation: 1, status: 'queued' }] } }
    renderHook(() => useEnvironmentOverviewModel())
    expect(q.servicesOptions.at(-1)).toMatchObject({ refetchInterval: 5000 })
    expect(q.containersOptions.at(-1)).toMatchObject({ refetchInterval: 5000 })
  })

  it('stops reading them again once no deploy runs', () => {
    q.history = { data: { deployments: [{ id: 'd1', generation: 1, status: 'succeeded' }] } }
    renderHook(() => useEnvironmentOverviewModel())
    expect(q.servicesOptions.at(-1)).toMatchObject({ refetchInterval: false })
    expect(q.containersOptions.at(-1)).toMatchObject({ refetchInterval: false })
  })
})
