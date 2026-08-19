import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId , ORG_ID_HEADER } from '@/lib/org-context'
import {
  applyOrgFabric,
  bootstrapInstall,
  checkPermission,
  completeInstall,
  createEnvironment,
  createOrganization,
  createProject,
  createVariable,
  createWorkspace,
  deleteEnvironment,
  deleteIp,
  deleteLicense,
  deleteProject,
  deleteVariable,
  deleteWorkspace,
  fetchAccessGrants,
  fetchCommand,
  fetchContainers,
  fetchDatacenterNameSuggestions,
  fetchDatacenters,
  fetchDeployPreview,
  fetchEnvironment,
  fetchLicenses,
  fetchOrgHostDefaults,
  fetchOrganization,
  fetchOrganizations,
  fetchPermissions,
  fetchProject,
  fetchProjectCatalog,
  fetchServerMetricsSummary,
  fetchTimezones,
  fetchVariable,
  fetchVariables,
  fetchVisibleEnvironments,
  fetchVisibleProjects,
  fetchVisibleWorkspaces,
  fetchWorkspace,
  IP_IN_USE_ERROR,
  patchOrgFabricRelay,
  pingDaemon,
  PROJECT_HAS_RUNNING_SERVICES_ERROR,
  rebootServer,
  resolveResourceId,
  runEnvironmentLifecycle,
  saveOrgFabric,
  saveOrgHostDefaults,
  setServerHostname,
  setServerNtp,
  setServerTimezone,
  signIn,
  signOut,
  signUp,
  stopEnvironment,
  updateEnvironment,
  updateOrganization,
  updateProject,
  updateServer,
  updateVariable,
  updateWorkspace,
  verifyEmail,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api fetch wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  it('signIn posts credentials and returns session fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'admin',
      }),
    )
    await expect(signIn('ops@example.com', 'secret')).resolves.toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      email: 'ops@example.com',
      password: 'secret',
    })
  })

  it('signOut posts to the client sign-out route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(signOut()).resolves.toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/sign-out')
  })

  it('signUp and verifyEmail hit install auth routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(signUp('new@example.com', 'pw')).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(verifyEmail('token-abc')).resolves.toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/verify-email')
  })

  it('bootstrapInstall and completeInstall normalize install responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      bootstrapInstall('root', 'pw'),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'admin@example.com',
        role: 'superadmin',
        organizationId: 'org-1',
      }),
    )
    await expect(
      completeInstall({
        username: 'root',
        password: 'pw',
        superadminEmail: 'admin@example.com',
        superadminPassword: 'admin-pw',
      }),
    ).resolves.toEqual({
      userId: 'u1',
      email: 'admin@example.com',
      role: 'superadmin',
      needsInstall: false,
      organizationId: 'org-1',
    })
  })

  it('organization CRUD wrappers proxy client routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        organizations: [{ id: 'org-1', displayName: 'Acme', createdAt: 't' }],
      }),
    )
    await expect(fetchOrganizations()).resolves.toMatchObject({
      organizations: [{ id: 'org-1' }],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        organization: { id: 'org-1', displayName: 'Acme', createdAt: 't' },
      }),
    )
    await expect(fetchOrganization('org-1')).resolves.toMatchObject({
      organization: { id: 'org-1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'org-2' }))
    await expect(createOrganization({ displayName: 'Beta' })).resolves.toEqual({
      ok: true,
      id: 'org-2',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        organization: { id: 'org-1', displayName: 'Renamed', createdAt: 't' },
      }),
    )
    await expect(
      updateOrganization('org-1', { displayName: 'Renamed' }),
    ).resolves.toMatchObject({
      organization: { displayName: 'Renamed' },
    })
  })

  it('authz helpers resolve resource id and check permission', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ resourceId: 'res-org-1' }),
    )
    await expect(
      resolveResourceId('organization', 'org-1'),
    ).resolves.toEqual({ resourceId: 'res-org-1' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ allowed: true }))
    await expect(
      checkPermission('res-org-1', 'organization:manage'),
    ).resolves.toEqual({ allowed: true })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access: [
          {
            id: 'grant-1',
            subjectKind: 'team',
            subjectId: 'team-1',
            resourceId: 'res-org-1',
            effect: 'allow',
            permissionKey: 'organization:manage',
          },
        ],
      }),
    )
    await expect(fetchAccessGrants('res-org-1')).resolves.toMatchObject({
      access: [{ id: 'grant-1' }],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        permissions: [{ key: 'organization:own', displayName: 'Own' }],
      }),
    )
    await expect(fetchPermissions()).resolves.toMatchObject({
      permissions: [{ key: 'organization:own' }],
    })
  })

  it('workspace CRUD wrappers proxy client routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        workspaces: [
          {
            id: 'ws-1',
            displayName: 'Default',
            description: null,
            organizationId: 'org-1',
            kind: 'user',
            createdAt: 't',
            updatedAt: 't',
          },
        ],
      }),
    )
    await expect(fetchVisibleWorkspaces()).resolves.toMatchObject({
      workspaces: [{ id: 'ws-1' }],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        workspace: {
          id: 'ws-1',
          displayName: 'Default',
          description: null,
          organizationId: 'org-1',
          kind: 'user',
          createdAt: 't',
          updatedAt: 't',
        },
      }),
    )
    await expect(fetchWorkspace('ws-1')).resolves.toMatchObject({
      workspace: { id: 'ws-1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'ws-2' }))
    await expect(createWorkspace({ displayName: 'Extra' })).resolves.toEqual({
      ok: true,
      id: 'ws-2',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateWorkspace('ws-1', { displayName: 'Renamed' }),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteWorkspace('ws-1')).resolves.toEqual({ ok: true })
  })

  it('project and environment wrappers build query strings and bodies', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ projects: [{ id: 'p1', displayName: 'Demo' }] }),
    )
    await expect(fetchVisibleProjects('ws-1')).resolves.toMatchObject({
      projects: [{ id: 'p1' }],
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('workspaceId=ws-1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ catalog: [] }))
    await expect(fetchProjectCatalog()).resolves.toEqual({ catalog: [] })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ project: { id: 'p1', displayName: 'Demo' } }),
    )
    await expect(fetchProject('p1')).resolves.toMatchObject({
      project: { id: 'p1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'p2' }))
    await expect(
      createProject({
        type: 'empty',
        displayName: 'New',
        workspaceId: 'ws-1',
      }),
    ).resolves.toEqual({ ok: true, id: 'p2' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateProject('p1', { displayName: 'Renamed' }),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteProject('p1')).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ environments: [{ id: 'env-1' }] }),
    )
    await expect(fetchVisibleEnvironments('p1')).resolves.toMatchObject({
      environments: [{ id: 'env-1' }],
    })
    const environmentsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/environments'),
    )
    expect(String(environmentsCall?.[0])).toContain('projectId=p1')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ environment: { id: 'env-1', displayName: 'Production' } }),
    )
    await expect(fetchEnvironment('env-1')).resolves.toMatchObject({
      environment: { id: 'env-1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'env-2' }))
    await expect(
      createEnvironment({ projectId: 'p1', displayName: 'Staging' }),
    ).resolves.toEqual({ ok: true, id: 'env-2' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateEnvironment('env-1', { serverId: 'srv-1' }),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteEnvironment('env-1')).resolves.toEqual({ ok: true })
  })

  it('variable CRUD wrappers encode parent filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ variables: [] }))
    await expect(
      fetchVariables({ projectId: 'p1' }),
    ).resolves.toEqual({ variables: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('projectId=p1')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ variable: { id: 'var-1', key: 'PORT', value: '5432' } }),
    )
    await expect(fetchVariable('var-1')).resolves.toMatchObject({
      variable: { id: 'var-1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'var-2' }))
    await expect(
      createVariable({ projectId: 'p1', key: 'PORT', value: '5432' }),
    ).resolves.toEqual({ ok: true, id: 'var-2' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateVariable('var-1', { value: '8080' }),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteVariable('var-1')).resolves.toEqual({ ok: true })
  })

  it('container and license list wrappers proxy filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ containers: [] }))
    await expect(
      fetchContainers({ environmentId: 'env-1', serviceId: 'svc-1' }),
    ).resolves.toEqual({ containers: [] })
    const containerUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(containerUrl).toContain('environmentId=env-1')
    expect(containerUrl).toContain('serviceId=svc-1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ licenses: [] }))
    await expect(fetchLicenses()).resolves.toEqual({ licenses: [] })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteLicense('lic-1')).resolves.toEqual({ ok: true })
  })

  it('server command wrappers enqueue and poll', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-1', status: 'queued' }),
    )
    await expect(pingDaemon('srv-1')).resolves.toMatchObject({
      commandId: 'cmd-1',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-2', status: 'queued' }),
    )
    await expect(setServerHostname('srv-1', 'huey')).resolves.toMatchObject({
      commandId: 'cmd-2',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-3', status: 'queued' }),
    )
    await expect(rebootServer('srv-1')).resolves.toMatchObject({
      commandId: 'cmd-3',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'cmd-1',
        serverId: 'srv-1',
        actorEntityType: 'user',
        actorEntityId: 'u1',
        type: 'daemon.ping',
        status: 'succeeded',
        payload: null,
        result: null,
        error: null,
        attempts: 1,
        createdAt: 't',
        updatedAt: 't',
        queuedAt: null,
        dispatchStartedAt: null,
        sentAt: null,
        ackedAt: null,
        startedAt: null,
        finishedAt: null,
        expiresAt: null,
      }),
    )
    await expect(fetchCommand('srv-1', 'cmd-1')).resolves.toMatchObject({
      id: 'cmd-1',
      status: 'succeeded',
    })
  })

  it('host defaults and timezone wrappers proxy org routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ sshPort: 2222, ntp: { enabled: true } }),
    )
    await expect(fetchOrgHostDefaults('org-1')).resolves.toMatchObject({
      sshPort: 2222,
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      saveOrgHostDefaults('org-1', { sshPort: 2222 }),
    ).resolves.toEqual({ ok: true })

    fetchMock.mockResolvedValueOnce(jsonResponse({ timezones: ['UTC'] }))
    await expect(fetchTimezones()).resolves.toEqual({ timezones: ['UTC'] })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-tz', status: 'queued' }),
    )
    await expect(setServerTimezone('srv-1', 'UTC')).resolves.toMatchObject({
      commandId: 'cmd-tz',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-ntp', status: 'queued' }),
    )
    await expect(
      setServerNtp('srv-1', { enabled: true, servers: ['pool.ntp.org'] }),
    ).resolves.toMatchObject({ commandId: 'cmd-ntp' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(updateServer('srv-1', { displayName: 'Huey' })).resolves.toEqual({
      ok: true,
    })
  })

  it('fabric save/patch/apply wrappers proxy org fabric routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        enabled: true,
        fabric: { id: 'fab-1', cidr: '10.192.0.0/16', allowRelay: false },
        relays: [],
      }),
    )
    await expect(
      saveOrgFabric('org-1', true, { allowRelay: false }),
    ).resolves.toMatchObject({ enabled: true, relays: [] })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        relay: {
          serverId: 'srv-1',
          address: '10.250.0.1',
          role: 'gateway',
          keepalive: null,
          endpointAddress: null,
          publicKey: null,
          prefix: '10.192.0.0/16',
        },
      }),
    )
    await expect(
      patchOrgFabricRelay('org-1', 'srv-1', { role: 'gateway' }),
    ).resolves.toMatchObject({ ok: true, relay: { serverId: 'srv-1' } })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        fabricId: 'fab-1',
        interfaceName: 'tp0',
        results: [{ serverId: 'srv-1', status: 'queued', commandId: 'cmd-f' }],
      }),
    )
    await expect(applyOrgFabric('org-1')).resolves.toMatchObject({
      fabricId: 'fab-1',
      interfaceName: 'tp0',
    })
  })

  it('deploy preview and lifecycle wrappers proxy environment routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        composeYaml: 'services: {}',
        projectName: 'p1',
        containers: [],
        volumes: [],
        warnings: [],
      }),
    )
    await expect(fetchDeployPreview('env-1')).resolves.toMatchObject({
      ok: true,
      composeYaml: 'services: {}',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ commandId: 'cmd-stop', serverId: 'srv-1' }),
    )
    await expect(stopEnvironment('env-1')).resolves.toMatchObject({
      commandId: 'cmd-stop',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-start', status: 'queued' }),
    )
    await expect(
      runEnvironmentLifecycle('env-1', 'start'),
    ).resolves.toMatchObject({ commandId: 'cmd-start' })
  })

  it('datacenter and IP helpers build query strings and remap ip_in_use', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ datacenters: [] }))
    await expect(fetchDatacenters()).resolves.toEqual({ datacenters: [] })

    fetchMock.mockResolvedValueOnce(jsonResponse({ suggestions: [] }))
    await expect(
      fetchDatacenterNameSuggestions({ unassignedOnly: false, limit: 5 }),
    ).resolves.toEqual({ suggestions: [] })
    const suggestionUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(suggestionUrl).toContain('unassignedOnly=0')
    expect(suggestionUrl).toContain('limit=5')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: IP_IN_USE_ERROR }, 409),
    )
    await expect(deleteIp('ip-1')).rejects.toThrow(
      'This address is pinned to a hosting — unassign it first.',
    )
  })

  it('fetchServerMetricsSummary uses the metrics summary path', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T01:00:00.000Z',
        samples: [],
      }),
    )
    await expect(
      fetchServerMetricsSummary('srv-1', {
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-01T01:00:00.000Z',
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/metrics/summary')
  })

  it('apiFetch attaches the active organization header when set', async () => {
    setActiveOrganizationId('org-99')
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await fetchOrganizations()
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-99',
    })
  })

  it('surfaces project_has_running_services in deleteProject failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: PROJECT_HAS_RUNNING_SERVICES_ERROR }, 409),
    )
    await expect(deleteProject('p1')).rejects.toThrow(
      PROJECT_HAS_RUNNING_SERVICES_ERROR,
    )
  })
})
