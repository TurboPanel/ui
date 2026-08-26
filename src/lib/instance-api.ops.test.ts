import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
import {
  addPrincipalSshKey,
  createGitlabDeployKey,
  createProjectPrincipal,
  createSource,
  createStorage,
  deletePrincipalSshKey,
  deleteProjectPrincipal,
  deleteSource,
  deleteStorage,
  fetchCommandLog,
  fetchCommandStatuses,
  fetchContainerLogs,
  fetchEmailSettings,
  fetchEnvironmentDeployment,
  fetchEnvironmentDeployments,
  fetchFleetMetricsLatest,
  fetchGitInstallations,
  fetchInstallationRepositories,
  fetchOrgContainerLogSettings,
  fetchOrgResourceLimits,
  fetchPrincipalSshKeys,
  fetchProjectPrincipals,
  fetchServerResourceLimits,
  fetchServerUpdate,
  fetchServersUpdateStatus,
  fetchServiceReleases,
  fetchSource,
  fetchSources,
  fetchStorage,
  githubAppInstallUrl,
  gitlabOauthConnectUrl,
  inspectSource,
  MetricsBackendUnavailableError,
  resetServerUpdateStatus,
  restartSystemComponent,
  rollbackEnvironment,
  saveEmailSettings,
  saveOrgContainerLogSettings,
  saveOrgResourceLimits,
  saveServerResourceLimits,
  saveSignupSettings,
  fetchSignupSettings,
  SOURCE_REFERENCED_BY_COMPOSE_ERROR,
  triggerAllServerUpdates,
  triggerServerUpdate,
  updateProjectPrincipal,
  updateProjectPrincipalAssignments,
  updateSource,
  updateStorage,
  updateStorageMount,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status })
}

describe('instance-api ops/admin/source/storage/principal fetch wrappers', () => {
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

  it('server update helpers hit the update routes', async () => {
    const updateStatus = {
      ok: true,
      channel: 'trunk',
      current: null,
      target: null,
      updateAvailable: false,
      status: 'idle' as const,
      targetStatus: 'ok' as const,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(updateStatus))
    await expect(fetchServerUpdate('srv-1')).resolves.toEqual(updateStatus)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/servers/srv-1/update')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        channel: 'trunk',
        target: null,
        targetStatus: 'ok',
        servers: [{ ...updateStatus, serverId: 'srv-1' }],
      }),
    )
    await expect(fetchServersUpdateStatus()).resolves.toMatchObject({ ok: true })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/servers/updates')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        serverId: 'srv-1',
        status: 'updating',
      }),
    )
    await expect(triggerServerUpdate('srv-1')).resolves.toMatchObject({
      serverId: 'srv-1',
      status: 'updating',
    })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...updateStatus, cleared: 1 }),
    )
    await expect(resetServerUpdateStatus('srv-1')).resolves.toMatchObject({
      cleared: 1,
    })
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/update/reset')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        results: [{ serverId: 'srv-1', ok: true, status: 'updating' }],
      }),
    )
    await expect(triggerAllServerUpdates()).resolves.toMatchObject({ ok: true })
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'POST' })
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/servers/updates')
  })

  it('admin email and signup settings use admin routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        settings: {
          SMTP_HOST: { value: 'smtp.example.com', source: 'db' },
        },
      }),
    )
    await expect(fetchEmailSettings()).resolves.toEqual({
      ok: true,
      settings: {
        SMTP_HOST: { value: 'smtp.example.com', source: 'db' },
      },
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/admin/v1/settings/email',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        settings: {
          SMTP_HOST: { value: 'mail.example.com', source: 'db' },
        },
      }),
    )
    await expect(
      saveEmailSettings({ SMTP_HOST: 'mail.example.com' }),
    ).resolves.toMatchObject({ ok: true })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      SMTP_HOST: 'mail.example.com',
    })

    const signup = {
      enabled: true,
      dbValue: '1' as const,
      isEnvForced: false,
      envOverride: null,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(signup))
    await expect(fetchSignupSettings()).resolves.toEqual(signup)
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      '/api/admin/v1/settings/signup',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...signup, enabled: false }))
    await expect(saveSignupSettings(false)).resolves.toMatchObject({
      enabled: false,
    })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      enabled: false,
    })
  })

  it('restartSystemComponent POSTs the encoded component path', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        commandId: 'cmd-1',
        status: 'queued',
        serverId: 'srv-1',
      }),
    )
    await expect(
      restartSystemComponent('srv-1', 'hosting-ingress'),
    ).resolves.toMatchObject({ commandId: 'cmd-1', serverId: 'srv-1' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/servers/srv-1/system/hosting-ingress/restart',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('fetchCommandStatuses short-circuits empty ids and batches readable rows', async () => {
    await expect(fetchCommandStatuses([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    const readable = {
      id: 'cmd-1',
      serverId: 'srv-1',
      status: 'succeeded' as const,
      type: 'daemon.ping',
      queuedAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: '2026-01-01T00:00:01.000Z',
      errorCode: null,
      errorMessage: null,
      hasLog: false,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, commands: [readable] }))
    await expect(
      fetchCommandStatuses(['cmd-1', 'cmd-hidden', 'cmd-2']),
    ).resolves.toEqual([readable])
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      ids: ['cmd-1', 'cmd-hidden', 'cmd-2'],
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, commands: [readable] }))
    await expect(fetchCommandStatuses(['cmd-1', 'cmd-2'])).resolves.toEqual([
      readable,
    ])

    const manyIds = Array.from({ length: 101 }, (_, index) => `cmd-${index}`)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, commands: [] }))
    await expect(fetchCommandStatuses(manyIds)).resolves.toEqual([])
    const [, manyInit] = fetchMock.mock.calls.at(-1) ?? []
    const posted = JSON.parse(String((manyInit as RequestInit).body)) as {
      ids: string[]
    }
    expect(posted.ids).toHaveLength(101)
  })

  it('fetchCommandLog forwards from/max and accepts exists false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        text: '',
        nextSeq: 0,
        sealed: false,
        truncated: false,
        exists: false,
      }),
    )
    await expect(
      fetchCommandLog('srv-1', 'cmd-1', { from: 5, max: 256 }),
    ).resolves.toMatchObject({ exists: false, nextSeq: 0 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/servers/srv-1/commands/cmd-1/log')
    expect(url).toContain('from=5')
    expect(url).toContain('max=256')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        text: '{"seq":1}\n',
        nextSeq: 2,
        sealed: true,
        truncated: false,
        exists: true,
      }),
    )
    await expect(fetchCommandLog('srv-1', 'cmd-1')).resolves.toMatchObject({
      exists: true,
      sealed: true,
    })
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('?')
  })

  it('container log reads and settings proxy organization routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        events: [],
        nextCursor: null,
      }),
    )
    await expect(
      fetchContainerLogs('org-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
        serverId: 'srv-1',
        environmentId: 'env-1',
        serviceId: 'svc-1',
        containerId: 'ctr-1',
        stream: 'stdout',
        search: 'error',
        cursor: 'cur-next',
        limit: 50,
      }),
    ).resolves.toEqual({ events: [], nextCursor: null })
    const logsUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(logsUrl).toContain('/organizations/org-1/container-logs')
    expect(logsUrl).toContain('from=2026-01-01T00%3A00%3A00.000Z')
    expect(logsUrl).toContain('serverId=srv-1')
    expect(logsUrl).toContain('environmentId=env-1')
    expect(logsUrl).toContain('serviceId=svc-1')
    expect(logsUrl).toContain('containerId=ctr-1')
    expect(logsUrl).toContain('stream=stdout')
    expect(logsUrl).toContain('search=error')
    expect(logsUrl).toContain('cursor=cur-next')
    expect(logsUrl).toContain('limit=50')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'container_logs_disabled' },
        503,
      ),
    )
    await expect(
      fetchContainerLogs('org-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toThrow(/container_logs_disabled/)

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'container_logs_unavailable' },
        503,
      ),
    )
    await expect(
      fetchContainerLogs('org-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toThrow(/container_logs_unavailable/)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        containerLogsEnabled: false,
        retentionDays: 7,
      }),
    )
    await expect(fetchOrgContainerLogSettings('org-1')).resolves.toMatchObject({
      containerLogsEnabled: false,
      retentionDays: 7,
    })
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      '/container-logs-settings',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        containerLogsEnabled: true,
        retentionDays: 7,
      }),
    )
    await expect(
      saveOrgContainerLogSettings('org-1', { containerLogsEnabled: true }),
    ).resolves.toMatchObject({ ok: true, containerLogsEnabled: true })
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toEqual({
      containerLogsEnabled: true,
    })
  })

  it('environment deployment history and detail routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        deployments: [],
        nextCursor: null,
      }),
    )
    await expect(
      fetchEnvironmentDeployments('env-1', { limit: 10, before: 'dep-old' }),
    ).resolves.toMatchObject({ ok: true, deployments: [] })
    const listUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(listUrl).toContain('/environments/env-1/deployments')
    expect(listUrl).toContain('limit=10')
    expect(listUrl).toContain('before=dep-old')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        deployment: {
          id: 'dep-1',
          environmentId: 'env-1',
          generation: 1,
          desiredHash: 'abc',
          replicaCounts: {},
          totalReplicas: 0,
          commands: [],
          servers: [],
        },
      }),
    )
    await expect(
      fetchEnvironmentDeployment('env-1', 'dep-1'),
    ).resolves.toMatchObject({ ok: true, deployment: { id: 'dep-1' } })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/environments/env-1/deployments/dep-1',
    )
  })

  it('source helpers cover list, inspect, detail, git, and mutations', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sources: [] }))
    await expect(fetchSources()).resolves.toEqual({ sources: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/sources')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        commitSha: 'abc123',
        via: 'provider',
        files: [],
        entries: [],
      }),
    )
    await expect(inspectSource('src-1', 'main')).resolves.toMatchObject({
      commitSha: 'abc123',
    })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/sources/src-1/inspect')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('ref=main')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        source: {
          id: 'src-1',
          provider: 'github',
          repositoryUrl: 'https://github.com/org/repo',
          webhookUrl: 'https://panel.example/webhook',
        },
      }),
    )
    await expect(fetchSource('src-1')).resolves.toMatchObject({
      source: { id: 'src-1' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ installations: [] }))
    await expect(fetchGitInstallations()).resolves.toEqual({ installations: [] })
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/sources/installations')

    fetchMock.mockResolvedValueOnce(jsonResponse({ repositories: [] }))
    await expect(
      fetchInstallationRepositories('inst-1'),
    ).resolves.toEqual({ repositories: [] })
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain(
      '/sources/installations/inst-1/repositories',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'src-new' }))
    await expect(
      createSource({
        provider: 'github',
        repositoryUrl: 'https://github.com/org/repo',
        installationId: 'inst-1',
        autoDeploy: 'immediate',
      }),
    ).resolves.toEqual({ ok: true, id: 'src-new' })
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({ method: 'POST' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateSource('src-1', { autoDeploy: 'disabled', defaultBranch: 'trunk' }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[6]?.[1]).toMatchObject({ method: 'PATCH' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteSource('src-1')).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[7]?.[1]).toMatchObject({ method: 'DELETE' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: SOURCE_REFERENCED_BY_COMPOSE_ERROR }, 409),
    )
    await expect(deleteSource('src-bound')).rejects.toThrow(
      SOURCE_REFERENCED_BY_COMPOSE_ERROR,
    )
  })

  it('githubAppInstallUrl and gitlabOauthConnectUrl build browser navigation targets', () => {
    const github = githubAppInstallUrl('app-1')
    expect(github).toContain('/api/client/v1/sources/github/install')
    // The app is named on the redirect: an instance may hold several, and the
    // callback binds the resulting installation to whichever one was chosen.
    expect(github).toContain('appId=app-1')

    // Escaped so an id can never inject another parameter or path segment.
    const gitlab = gitlabOauthConnectUrl('a&b=c/d')
    expect(gitlab).toContain('/api/client/v1/sources/gitlab/oauth')
    expect(gitlab).toContain('appId=a%26b%3Dc%2Fd')
  })

  it('createGitlabDeployKey POSTs the deploy-key route', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        credentialId: 'cred-1',
        publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5',
        fingerprint: 'SHA256:abc',
      }),
    )
    await expect(createGitlabDeployKey({ name: 'deploy' })).resolves.toMatchObject({
      credentialId: 'cred-1',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/sources/gitlab/deploy-keys',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('service releases and rollback hit environment routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, releases: [] }))
    await expect(
      fetchServiceReleases('env-1', 'web', { limit: 5 }),
    ).resolves.toMatchObject({ ok: true, releases: [] })
    const releasesUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(releasesUrl).toContain('/environments/env-1/releases')
    expect(releasesUrl).toContain('composeServiceName=web')
    expect(releasesUrl).toContain('limit=5')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-roll', status: 'queued' }),
    )
    await expect(
      rollbackEnvironment('env-1', {
        composeServiceName: 'web',
        releaseId: 'rel-1',
      }),
    ).resolves.toMatchObject({ commandId: 'cmd-roll' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/rollback')
  })

  it('storage CRUD helpers build parent filters and mutation bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ storage: [] }))
    await expect(fetchStorage({ environmentId: 'env-1' })).resolves.toEqual({
      storage: [],
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('environmentId=env-1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'stor-1' }))
    await expect(
      createStorage({
        environmentId: 'env-1',
        kind: 'volume',
        name: 'data',
      }),
    ).resolves.toEqual({ ok: true, id: 'stor-1' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateStorage('stor-1', { name: 'data-v2', accessMode: 'single_writer' }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'PATCH' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateStorageMount('stor-1', 'mount-1', {
        destinationPath: '/data',
        subpath: null,
        readOnly: true,
      }),
    ).resolves.toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      '/storage/stor-1/mounts/mount-1',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteStorage('stor-1')).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('project principal and SSH key helpers proxy project routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ keys: [] }))
    await expect(
      fetchPrincipalSshKeys('proj-1', 'principal-1'),
    ).resolves.toEqual({ keys: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/projects/proj-1/principals/principal-1/ssh-keys',
    )

    const key = {
      id: 'key-1',
      name: 'laptop',
      keyType: 'ssh-ed25519',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5',
      fingerprint: 'SHA256:abc',
      comment: null,
      bits: 256,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        key,
        reconciled: { queuedServerIds: ['srv-1'], failedServerIds: [] },
      }),
    )
    await expect(
      addPrincipalSshKey('proj-1', 'principal-1', {
        name: 'laptop',
        publicKey: key.publicKey,
      }),
    ).resolves.toMatchObject({ key: { id: 'key-1' } })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        reconciled: { queuedServerIds: [], failedServerIds: ['srv-2'] },
      }),
    )
    await expect(
      deletePrincipalSshKey('proj-1', 'principal-1', 'key-1'),
    ).resolves.toMatchObject({
      ok: true,
      reconciled: { failedServerIds: ['srv-2'] },
    })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ principals: [] }))
    await expect(fetchProjectPrincipals('proj-1')).resolves.toEqual({
      principals: [],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        id: 'principal-1',
        uid: 1001,
        gid: 1001,
        serviceIds: ['svc-1'],
      }),
    )
    await expect(
      createProjectPrincipal('proj-1', {
        username: 'deploy',
        serviceIds: ['svc-1'],
        access: 'shell',
      }),
    ).resolves.toMatchObject({ id: 'principal-1', uid: 1001 })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        serviceIds: ['svc-1', 'svc-2'],
        reconciled: { queuedServerIds: ['srv-1'], failedServerIds: [] },
      }),
    )
    await expect(
      updateProjectPrincipal('proj-1', 'principal-1', {
        serviceIds: ['svc-1', 'svc-2'],
        access: 'sftp',
      }),
    ).resolves.toMatchObject({ serviceIds: ['svc-1', 'svc-2'] })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, serviceIds: ['svc-1'] }),
    )
    await expect(
      updateProjectPrincipalAssignments('proj-1', 'principal-1', ['svc-1']),
    ).resolves.toMatchObject({ serviceIds: ['svc-1'] })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      deleteProjectPrincipal('proj-1', 'principal-1'),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[7]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('resource limit helpers GET and PUT org/server caps', async () => {
    const limits = { maxCpus: 4, maxMemoryBytes: 8_000_000_000 }

    fetchMock.mockResolvedValueOnce(jsonResponse({ resourceLimits: limits }))
    await expect(fetchOrgResourceLimits('org-1')).resolves.toEqual({
      resourceLimits: limits,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/organizations/org-1/resource-limits',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, resourceLimits: limits }),
    )
    await expect(saveOrgResourceLimits('org-1', limits)).resolves.toMatchObject({
      ok: true,
      resourceLimits: limits,
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ resourceLimits: limits }))
    await expect(fetchServerResourceLimits('srv-1')).resolves.toEqual({
      resourceLimits: limits,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, resourceLimits: limits }),
    )
    await expect(saveServerResourceLimits('srv-1', limits)).resolves.toMatchObject({
      ok: true,
    })
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      '/servers/srv-1/resource-limits',
    )
  })

  it('fetchFleetMetricsLatest attaches org header and maps backend 503', async () => {
    setActiveOrganizationId('org-active')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T00:01:00.000Z',
        backend: 'clickhouse',
        available: true,
        metrics: ['cpuUsagePercent'],
        servers: [],
      }),
    )
    await expect(fetchFleetMetricsLatest()).resolves.toMatchObject({
      ok: true,
      backend: 'clickhouse',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-active',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/servers/metrics/latest',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'metrics_backend_unavailable', backend: 'disabled' },
        503,
      ),
    )
    try {
      await fetchFleetMetricsLatest('org-explicit')
      throw new TypeError('expected fetchFleetMetricsLatest to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(MetricsBackendUnavailableError)
      if (!(error instanceof MetricsBackendUnavailableError)) {
        throw new TypeError('expected MetricsBackendUnavailableError')
      }
      expect(error.backend).toBe('disabled')
    }

    fetchMock.mockResolvedValueOnce(textResponse('down', 503))
    await expect(fetchFleetMetricsLatest()).rejects.toThrow(
      /metrics\/latest failed: HTTP 503/,
    )

    fetchMock.mockResolvedValueOnce(textResponse('nope', 500))
    await expect(fetchFleetMetricsLatest()).rejects.toThrow(
      /metrics\/latest failed: HTTP 500/,
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'forbidden' }, 403),
    )
    await expect(fetchFleetMetricsLatest()).rejects.toThrow(
      /metrics\/latest failed: HTTP 403: forbidden/,
    )
  })
})
