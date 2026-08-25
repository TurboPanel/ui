import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
import {
  BINDING_KEY_PREFIX_IN_USE_ERROR,
  MANAGED_DATABASE_HAS_BINDINGS_ERROR,
  MANAGED_MEMBER_EXISTS_ERROR,
  MANAGED_NO_READ_TARGETS_ERROR,
  MANAGED_REPLICA_NOT_PROMOTABLE_ERROR,
  MANAGED_USER_HAS_BINDINGS_ERROR,
  addManagedReplica,
  applyEnvironmentManaged,
  createBinding,
  createEnvironmentManaged,
  createManagedBackup,
  createManagedDatabase,
  createManagedUser,
  deleteBinding,
  deleteEnvironmentManaged,
  deleteManagedBackup,
  deleteManagedDatabase,
  deleteManagedUser,
  downloadOrganizationCaPem,
  fetchBindings,
  fetchEnvironmentManaged,
  fetchManagedBackups,
  fetchManagedDatabases,
  fetchManagedLogs,
  fetchManagedMembers,
  fetchManagedStatus,
  fetchManagedUsers,
  fetchOrganizationManaged,
  promoteManagedDisasterRecovery,
  promoteManagedMember,
  removeManagedMember,
  restoreManagedBackup,
  rotateManagedRootPassword,
  rotateManagedUserPassword,
  runEnvironmentLifecycle,
  runManagedLifecycle,
  updateBinding,
  updateEnvironmentManaged,
  updateManagedMember,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api managed-engine fetch wrappers', () => {
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

  function lastFetch(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    if (typeof url !== 'string') {
      throw new TypeError('expected fetch URL')
    }
    if (!init || typeof init !== 'object') {
      throw new TypeError('expected fetch init')
    }
    return { url, init: init as RequestInit }
  }

  function lastJsonBody(): unknown {
    const { init } = lastFetch()
    if (typeof init.body !== 'string') {
      throw new TypeError('expected JSON request body')
    }
    return JSON.parse(init.body)
  }

  const managedRecord = {
    id: 'managed-1',
    environmentId: 'env-1',
    name: 'Primary',
    engine: 'postgres' as const,
    status: 'running' as const,
    host: '203.0.113.10',
    port: 15432,
    serverId: 'srv-1',
    metadata: {},
    options: null,
    createdAt: 't',
    updatedAt: 't',
  }

  const managedCommand = {
    ok: true as const,
    commandId: 'cmd-1',
    status: 'queued' as const,
    serverId: 'srv-1',
  }

  it('fetchEnvironmentManaged returns detail including a null pre-create row', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        managed: null,
        connection: null,
        settings: { ssl: {}, exposure: { enabled: false } },
        ssl: {
          configured: null,
          effective: 'require',
          organizationDefault: null,
        },
        release: null,
        server: null,
        rootUsername: 'postgres',
        members: [],
        recovery: null,
      }),
    )
    const detail = await fetchEnvironmentManaged('env-1')
    if (detail.managed !== null) {
      throw new TypeError('expected managed to be null before create')
    }
    expect(detail.rootUsername).toBe('postgres')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/environments/env-1/managed',
    )
  })

  it('createEnvironmentManaged posts optional series/variant and returns show-once password', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        managed: managedRecord,
        commandId: 'cmd-create',
        serverId: 'srv-1',
        rootPassword: 'show-once-root',
      }),
    )
    const created = await createEnvironmentManaged('env-1', {
      engineSeries: '18',
      imageVariant: 'alpine',
    })
    if (typeof created.rootPassword !== 'string') {
      throw new TypeError('expected show-once rootPassword')
    }
    expect(created.rootPassword).toBe('show-once-root')
    expect(created.alreadyProvisioned).toBeUndefined()
    expect(lastFetch().init.method).toBe('POST')
    expect(lastJsonBody()).toEqual({
      engineSeries: '18',
      imageVariant: 'alpine',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        managed: managedRecord,
        alreadyProvisioned: true,
      }),
    )
    const existing = await createEnvironmentManaged('env-1')
    if (existing.alreadyProvisioned !== true) {
      throw new TypeError('expected alreadyProvisioned')
    }
    expect(lastJsonBody()).toEqual({})
  })

  it('createEnvironmentManaged surfaces 422 managed_version_unsupported', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'managed_version_unsupported' }, 422),
    )
    await expect(
      createEnvironmentManaged('env-1', {
        engineSeries: '99',
        imageVariant: 'alpine',
      }),
    ).rejects.toThrow('HTTP 422: managed_version_unsupported')
  })

  it('updateEnvironmentManaged PATCHes settings and apply/lifecycle/delete enqueue commands', async () => {
    const settings = {
      ssl: {},
      exposure: { enabled: true, scope: 'public' as const },
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        managed: managedRecord,
        settings,
      }),
    )
    await expect(
      updateEnvironmentManaged('env-1', { settings }),
    ).resolves.toMatchObject({ ok: true, settings })
    expect(lastFetch().init.method).toBe('PATCH')
    expect(lastJsonBody()).toEqual({ settings })

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(applyEnvironmentManaged('env-1')).resolves.toEqual(managedCommand)
    expect(String(lastFetch().url)).toContain('/managed/apply')
    expect(lastJsonBody()).toEqual({})

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(runManagedLifecycle('env-1', 'restart')).resolves.toEqual(
      managedCommand,
    )
    expect(String(lastFetch().url)).toContain('/managed/lifecycle')
    expect(lastJsonBody()).toEqual({ action: 'restart' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        deleted: true,
        commandId: 'cmd-destroy',
        serverId: 'srv-1',
      }),
    )
    await expect(deleteEnvironmentManaged('env-1')).resolves.toMatchObject({
      deleted: true,
      commandId: 'cmd-destroy',
    })
    expect(lastFetch().init.method).toBe('DELETE')
  })

  it('runEnvironmentLifecycle posts start stop and restart', async () => {
    for (const action of ['start', 'stop', 'restart'] as const) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          commandId: `cmd-${action}`,
          status: 'queued',
        }),
      )
      await expect(runEnvironmentLifecycle('env-1', action)).resolves.toMatchObject({
        commandId: `cmd-${action}`,
      })
      expect(String(lastFetch().url)).toContain('/environments/env-1/lifecycle')
      expect(lastJsonBody()).toEqual({ action })
    }
  })

  it('applyEnvironmentManaged surfaces 409 managed_busy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'managed_busy' }, 409))
    await expect(applyEnvironmentManaged('env-1')).rejects.toThrow(
      'HTTP 409: managed_busy',
    )
  })

  it('rotateManagedRootPassword and rotateManagedUserPassword return show-once secrets', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        rootPassword: 'rotated-root',
        commandId: 'cmd-root',
        serverId: 'srv-1',
        redeployRequired: { count: 1, services: [] },
      }),
    )
    const root = await rotateManagedRootPassword('env-1')
    if (typeof root.rootPassword !== 'string') {
      throw new TypeError('expected show-once rootPassword')
    }
    expect(root.rootPassword).toBe('rotated-root')
    expect(String(lastFetch().url)).toContain('/managed/root-password')
    expect(lastJsonBody()).toEqual({})

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        password: 'rotated-user',
        commandId: 'cmd-user',
        serverId: 'srv-1',
      }),
    )
    const user = await rotateManagedUserPassword('env-1', 'principal/a b')
    if (typeof user.password !== 'string') {
      throw new TypeError('expected show-once password')
    }
    expect(user.password).toBe('rotated-user')
    expect(String(lastFetch().url)).toContain(
      `/managed/users/${encodeURIComponent('principal/a b')}/password`,
    )
  })

  it('fetchManagedUsers createManagedUser and deleteManagedUser send connectionRole', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [
          {
            id: 'u-1',
            username: 'app',
            databases: ['app'],
            privileges: ['ALL'],
            connectionRole: 'read-write',
            createdAt: 't',
          },
        ],
      }),
    )
    const listed = await fetchManagedUsers('env-1')
    if (!Array.isArray(listed.users)) {
      throw new TypeError('expected users array')
    }
    expect(listed.users[0]?.connectionRole).toBe('read-write')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        user: {
          id: 'u-2',
          username: 'reader',
          databases: ['app'],
          privileges: ['SELECT'],
          connectionRole: 'read-only',
          createdAt: 't',
        },
        password: 'show-once-user',
        commandId: 'cmd-user',
        serverId: 'srv-1',
      }),
    )
    const created = await createManagedUser('env-1', {
      username: 'reader',
      databases: ['app'],
      connectionRole: 'read-only',
    })
    if (typeof created.password !== 'string') {
      throw new TypeError('expected show-once user password')
    }
    expect(created.user.connectionRole).toBe('read-only')
    expect(lastJsonBody()).toEqual({
      username: 'reader',
      databases: ['app'],
      connectionRole: 'read-only',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(deleteManagedUser('env-1', 'principal/a b')).resolves.toEqual(
      managedCommand,
    )
    expect(lastFetch().init.method).toBe('DELETE')
    expect(String(lastFetch().url)).toContain(
      `/managed/users/${encodeURIComponent('principal/a b')}`,
    )
  })

  it('createManagedUser surfaces 422 managed_no_read_targets', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: MANAGED_NO_READ_TARGETS_ERROR }, 422),
    )
    await expect(
      createManagedUser('env-1', {
        username: 'reader',
        databases: ['app'],
        connectionRole: 'read-only',
      }),
    ).rejects.toThrow(`HTTP 422: ${MANAGED_NO_READ_TARGETS_ERROR}`)
  })

  it('deleteManagedUser surfaces 409 managed_user_has_bindings', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: MANAGED_USER_HAS_BINDINGS_ERROR }, 409),
    )
    await expect(deleteManagedUser('env-1', 'u-1')).rejects.toThrow(
      `HTTP 409: ${MANAGED_USER_HAS_BINDINGS_ERROR}`,
    )
  })

  it('managed database wrappers list create and URL-encode delete names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ databases: ['app'] }))
    await expect(fetchManagedDatabases('env-1')).resolves.toEqual({
      databases: ['app'],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        databases: ['app', 'analytics'],
        commandId: 'cmd-db',
        serverId: 'srv-1',
      }),
    )
    await expect(
      createManagedDatabase('env-1', { name: 'analytics' }),
    ).resolves.toMatchObject({ databases: ['app', 'analytics'] })
    expect(lastJsonBody()).toEqual({ name: 'analytics' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        databases: ['app'],
        commandId: 'cmd-drop',
        serverId: 'srv-1',
      }),
    )
    await expect(deleteManagedDatabase('env-1', 'app/db name')).resolves.toMatchObject({
      ok: true,
    })
    expect(lastFetch().init.method).toBe('DELETE')
    expect(String(lastFetch().url)).toContain(
      `/managed/databases/${encodeURIComponent('app/db name')}`,
    )
  })

  it('deleteManagedDatabase surfaces 409 managed_database_has_bindings', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: MANAGED_DATABASE_HAS_BINDINGS_ERROR }, 409),
    )
    await expect(deleteManagedDatabase('env-1', 'app')).rejects.toThrow(
      `HTTP 409: ${MANAGED_DATABASE_HAS_BINDINGS_ERROR}`,
    )
  })

  it('fetchManagedStatus fetchManagedLogs and fetchOrganizationManaged proxy list routes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'failed',
        host: '203.0.113.10',
        port: 15432,
        error: 'apply failed',
        containers: [],
        members: [],
      }),
    )
    const status = await fetchManagedStatus('env-1')
    if (status.error === null) {
      throw new TypeError('expected failed status error')
    }
    expect(status.host).toBe('203.0.113.10')
    expect(String(lastFetch().url)).toContain('/managed/status')

    fetchMock.mockResolvedValueOnce(jsonResponse({ logs: 'ready' }))
    await expect(fetchManagedLogs('env-1')).resolves.toEqual({ logs: 'ready' })
    expect(String(lastFetch().url)).not.toContain('tail=')

    fetchMock.mockResolvedValueOnce(jsonResponse({ logs: 'tail' }))
    await expect(fetchManagedLogs('env-1', 80)).resolves.toEqual({ logs: 'tail' })
    expect(String(lastFetch().url)).toContain('tail=80')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        managed: [
          {
            ...managedRecord,
            engineDisplayName: 'PostgreSQL',
            environmentName: 'Production',
            projectId: 'p1',
            projectName: 'DB',
            workspaceId: 'ws-1',
            workspaceName: 'Default',
            serverName: 'Huey',
            members: [],
          },
        ],
      }),
    )
    const org = await fetchOrganizationManaged('org-1')
    if (!Array.isArray(org.managed)) {
      throw new TypeError('expected managed list')
    }
    expect(String(lastFetch().url)).toContain('/organizations/org-1/managed')
  })

  it('backup wrappers list create delete and restore without download bytes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        backups: [
          {
            id: 'bak-1',
            createdAt: 't',
            sizeBytes: 12,
            checksum: 'abc123',
            path: '/var/lib/turbopanel/backups/bak-1',
          },
        ],
      }),
    )
    const listed = await fetchManagedBackups('env-1')
    if (!listed.backups[0]) {
      throw new TypeError('expected backup metadata')
    }
    expect(listed.backups[0].path).not.toMatch(/^https?:/)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        backupId: 'bak-2',
        commandId: 'cmd-bak',
        serverId: 'srv-1',
      }),
    )
    await expect(createManagedBackup('env-1')).resolves.toMatchObject({
      backupId: 'bak-2',
    })
    expect(lastJsonBody()).toEqual({})

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        backupId: 'bak-3',
        commandId: 'cmd-bak-db',
        serverId: 'srv-1',
      }),
    )
    await expect(
      createManagedBackup('env-1', { database: 'app' }),
    ).resolves.toMatchObject({ backupId: 'bak-3' })
    expect(lastJsonBody()).toEqual({ database: 'app' })

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(deleteManagedBackup('env-1', 'bak/one')).resolves.toEqual(
      managedCommand,
    )
    expect(lastFetch().init.method).toBe('DELETE')
    expect(String(lastFetch().url)).toContain(
      `/managed/backups/${encodeURIComponent('bak/one')}`,
    )

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(restoreManagedBackup('env-1', 'bak/one')).resolves.toEqual(
      managedCommand,
    )
    expect(String(lastFetch().url)).toContain(
      `/managed/backups/${encodeURIComponent('bak/one')}/restore`,
    )
    expect(lastJsonBody()).toEqual({})
  })

  it('member wrappers add update remove and promote with force', async () => {
    const member = {
      id: 'mem-1',
      serverId: 'srv-2',
      serverName: 'Dewey',
      role: 'replica' as const,
      replicaClass: 'failover' as const,
      readEligible: false,
      ordinal: 2,
      status: 'running',
      replicationTransport: 'datacenter' as const,
      privatePort: 45001,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse({ members: [member] }))
    await expect(fetchManagedMembers('env-1')).resolves.toMatchObject({
      members: [{ id: 'mem-1' }],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...managedCommand, member }),
    )
    await expect(
      addManagedReplica('env-1', {
        serverId: 'srv-2',
        replicaClass: 'read',
        readEligible: true,
      }),
    ).resolves.toMatchObject({ member: { serverId: 'srv-2' } })
    expect(lastJsonBody()).toEqual({
      serverId: 'srv-2',
      replicaClass: 'read',
      readEligible: true,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...managedCommand, member: { ...member, readEligible: true } }),
    )
    await expect(
      updateManagedMember('env-1', 'mem/1', {
        readEligible: true,
        replicaClass: 'failover',
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(lastFetch().init.method).toBe('PATCH')
    expect(String(lastFetch().url)).toContain(
      `/managed/members/${encodeURIComponent('mem/1')}`,
    )
    expect(lastJsonBody()).toEqual({
      readEligible: true,
      replicaClass: 'failover',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(removeManagedMember('env-1', 'mem/1')).resolves.toEqual(
      managedCommand,
    )
    expect(lastFetch().init.method).toBe('DELETE')

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(promoteManagedMember('env-1', 'mem/1')).resolves.toEqual(
      managedCommand,
    )
    expect(lastJsonBody()).toEqual({})

    fetchMock.mockResolvedValueOnce(jsonResponse(managedCommand))
    await expect(
      promoteManagedMember('env-1', 'mem/1', { force: true }),
    ).resolves.toEqual(managedCommand)
    expect(String(lastFetch().url)).toContain(
      `/managed/members/${encodeURIComponent('mem/1')}/promote`,
    )
    expect(lastJsonBody()).toEqual({ force: true })
  })

  it('addManagedReplica and promoteManagedMember surface 409/422 managed codes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: MANAGED_MEMBER_EXISTS_ERROR }, 409),
    )
    await expect(
      addManagedReplica('env-1', { serverId: 'srv-2' }),
    ).rejects.toThrow(`HTTP 409: ${MANAGED_MEMBER_EXISTS_ERROR}`)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: MANAGED_REPLICA_NOT_PROMOTABLE_ERROR }, 422),
    )
    await expect(
      promoteManagedMember('env-1', 'mem-read', { force: true }),
    ).rejects.toThrow(`HTTP 422: ${MANAGED_REPLICA_NOT_PROMOTABLE_ERROR}`)
  })

  it('promoteManagedDisasterRecovery posts confirm true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...managedCommand,
        fencePending: false,
        kind: 'disaster-recovery',
        lagBytes: 0,
        source: { memberId: 'mem-p', serverId: 'srv-1', datacenterId: null },
        target: { memberId: 'mem-r', serverId: 'srv-2', datacenterId: null },
      }),
    )
    const result = await promoteManagedDisasterRecovery('env-1', {
      memberId: 'mem-r',
      confirm: true,
    })
    if (result.kind !== 'disaster-recovery') {
      throw new TypeError('expected disaster-recovery kind')
    }
    expect(result.fencePending).toBe(false)
    expect(String(lastFetch().url)).toContain(
      '/managed/disaster-recovery/promote',
    )
    expect(lastJsonBody()).toEqual({ memberId: 'mem-r', confirm: true })
  })

  it('fetchBindings uses mutually exclusive filters and binding mutations proxy routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await expect(fetchBindings({ serviceId: 'svc-1' })).resolves.toEqual({
      bindings: [],
    })
    expect(String(lastFetch().url)).toContain('serviceId=svc-1')
    expect(String(lastFetch().url)).not.toContain('environmentId=')
    expect(String(lastFetch().url)).not.toContain('managedEnvironmentId=')

    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await fetchBindings({ environmentId: 'env-1' })
    expect(String(lastFetch().url)).toContain('environmentId=env-1')
    expect(String(lastFetch().url)).not.toContain('serviceId=')
    expect(String(lastFetch().url)).not.toContain('managedEnvironmentId=')

    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await fetchBindings({ managedEnvironmentId: 'env-managed' })
    expect(String(lastFetch().url)).toContain('managedEnvironmentId=env-managed')
    expect(String(lastFetch().url)).not.toContain('serviceId=')
    expect(String(lastFetch().url)).not.toContain('environmentId=')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'bind-1' }))
    await expect(
      createBinding({
        principalId: 'principal-1',
        serviceId: 'svc-1',
        databaseName: 'app',
        keyPrefix: 'APP_DB',
      }),
    ).resolves.toEqual({ ok: true, id: 'bind-1' })
    expect(lastFetch().init.method).toBe('POST')
    expect(lastJsonBody()).toEqual({
      principalId: 'principal-1',
      serviceId: 'svc-1',
      databaseName: 'app',
      keyPrefix: 'APP_DB',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateBinding('bind/1', { keyPrefix: 'APP', emitEngineDefaults: false }),
    ).resolves.toEqual({ ok: true })
    expect(lastFetch().init.method).toBe('PATCH')
    expect(String(lastFetch().url)).toContain(
      `/bindings/${encodeURIComponent('bind/1')}`,
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteBinding('bind/1')).resolves.toEqual({ ok: true })
    expect(lastFetch().init.method).toBe('DELETE')
  })

  it('createBinding surfaces 409 binding_key_prefix_in_use', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: BINDING_KEY_PREFIX_IN_USE_ERROR }, 409),
    )
    await expect(
      createBinding({
        principalId: 'principal-1',
        serviceId: 'svc-1',
        databaseName: 'app',
      }),
    ).rejects.toThrow(`HTTP 409: ${BINDING_KEY_PREFIX_IN_USE_ERROR}`)
  })

  it('downloadOrganizationCaPem returns PEM text and attaches the org header', async () => {
    setActiveOrganizationId('org-99')
    fetchMock.mockResolvedValueOnce(
      new Response('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n', {
        status: 200,
        headers: { 'content-type': 'application/x-pem-file' },
      }),
    )
    await expect(downloadOrganizationCaPem()).resolves.toContain('BEGIN CERTIFICATE')
    const { url, init } = lastFetch()
    expect(url).toContain('/tls/ca/download')
    expect(init.headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-99',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'forbidden' }, 403),
    )
    await expect(downloadOrganizationCaPem()).rejects.toThrow(
      '/api/client/v1/tls/ca/download failed: HTTP 403: forbidden',
    )
  })
})
