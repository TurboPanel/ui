// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useAddManagedReplica,
  useApplyEnvironmentManaged,
  useCreateEnvironmentManaged,
  useCreateManagedBackup,
  useCreateManagedDatabase,
  useCreateManagedUser,
  useDeleteEnvironmentManaged,
  useDeleteEnvironmentManagedMutation,
  useDeleteManagedBackup,
  useDeleteManagedDatabase,
  useDeleteManagedUser,
  useEnvironmentManaged,
  useManagedBackups,
  useManagedDatabases,
  useManagedLogs,
  useManagedStatus,
  useManagedUsers,
  useOrganizationCa,
  useOrganizationManaged,
  usePromoteManagedDisasterRecovery,
  usePromoteManagedMember,
  useRemoveManagedMember,
  useRestoreManagedBackup,
  useRotateManagedRootPassword,
  useRotateManagedUserPassword,
  useRunManagedLifecycle,
  useUpdateEnvironmentManaged,
  useUpdateManagedMemberReadEligible,
  useUpdateManagedMemberReplicaClass,
} from '@/lib/queries/managed'

const {
  fetchOrganizationManaged,
  fetchEnvironmentManaged,
  fetchManagedStatus,
  fetchManagedLogs,
  fetchManagedUsers,
  fetchManagedDatabases,
  fetchManagedBackups,
  fetchOrganizationCa,
  createEnvironmentManaged,
  updateEnvironmentManaged,
  applyEnvironmentManaged,
  runManagedLifecycle,
  deleteEnvironmentManaged,
  rotateManagedRootPassword,
  rotateManagedUserPassword,
  createManagedUser,
  deleteManagedUser,
  createManagedDatabase,
  deleteManagedDatabase,
  createManagedBackup,
  deleteManagedBackup,
  restoreManagedBackup,
  addManagedReplica,
  updateManagedMember,
  removeManagedMember,
  promoteManagedMember,
  promoteManagedDisasterRecovery,
} = vi.hoisted(() => ({
  fetchOrganizationManaged: vi.fn(),
  fetchEnvironmentManaged: vi.fn(),
  fetchManagedStatus: vi.fn(),
  fetchManagedLogs: vi.fn(),
  fetchManagedUsers: vi.fn(),
  fetchManagedDatabases: vi.fn(),
  fetchManagedBackups: vi.fn(),
  fetchOrganizationCa: vi.fn(),
  createEnvironmentManaged: vi.fn(),
  updateEnvironmentManaged: vi.fn(),
  applyEnvironmentManaged: vi.fn(),
  runManagedLifecycle: vi.fn(),
  deleteEnvironmentManaged: vi.fn(),
  rotateManagedRootPassword: vi.fn(),
  rotateManagedUserPassword: vi.fn(),
  createManagedUser: vi.fn(),
  deleteManagedUser: vi.fn(),
  createManagedDatabase: vi.fn(),
  deleteManagedDatabase: vi.fn(),
  createManagedBackup: vi.fn(),
  deleteManagedBackup: vi.fn(),
  restoreManagedBackup: vi.fn(),
  addManagedReplica: vi.fn(),
  updateManagedMember: vi.fn(),
  removeManagedMember: vi.fn(),
  promoteManagedMember: vi.fn(),
  promoteManagedDisasterRecovery: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrganizationManaged,
    fetchEnvironmentManaged,
    fetchManagedStatus,
    fetchManagedLogs,
    fetchManagedUsers,
    fetchManagedDatabases,
    fetchManagedBackups,
    fetchOrganizationCa,
    createEnvironmentManaged,
    updateEnvironmentManaged,
    applyEnvironmentManaged,
    runManagedLifecycle,
    deleteEnvironmentManaged,
    rotateManagedRootPassword,
    rotateManagedUserPassword,
    createManagedUser,
    deleteManagedUser,
    createManagedDatabase,
    deleteManagedDatabase,
    createManagedBackup,
    deleteManagedBackup,
    restoreManagedBackup,
    addManagedReplica,
    updateManagedMember,
    removeManagedMember,
    promoteManagedMember,
    promoteManagedDisasterRecovery,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const commandResponse = {
  ok: true as const,
  commandId: 'cmd-1',
  status: 'queued' as const,
  serverId: 'srv-1',
}

function statusSnapshot(status: string) {
  return {
    status,
    host: '127.0.0.1',
    port: 15432,
    error: null,
    containers: [],
    members: [],
  }
}

function resolveStatusPollInterval(
  client: ReturnType<typeof createAppQueryClient>,
  orgId: string,
  environmentId: string,
): number | false {
  const query = client.getQueryCache().find({
    queryKey: queryKeys.org(orgId).managed.status(environmentId),
  })
  if (!query) {
    throw new TypeError('expected managed status query in cache')
  }
  const interval = (
    query.options as { refetchInterval?: unknown }
  ).refetchInterval
  if (typeof interval !== 'function') {
    throw new TypeError('expected refetchInterval function')
  }
  return interval(query) as number | false
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('managed query hooks', () => {
  const orgId = 'org-1'
  const environmentId = 'env-1'

  it('useOrganizationManaged loads org-wide managed list', async () => {
    fetchOrganizationManaged.mockResolvedValueOnce({
      managed: [{ environmentId, status: 'running' }],
    })

    const { result } = renderHook(() => useOrganizationManaged(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchOrganizationManaged).toHaveBeenCalledWith(orgId)
  })

  it('useOrganizationManaged stays idle when disabled or orgId is empty', () => {
    const disabled = renderHook(
      () => useOrganizationManaged(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const empty = renderHook(() => useOrganizationManaged(''), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizationManaged).not.toHaveBeenCalled()
  })

  it('useEnvironmentManaged loads managed detail', async () => {
    fetchEnvironmentManaged.mockResolvedValueOnce({
      managed: { id: 'managed-1', status: 'running' },
      connection: null,
      settings: {},
      ssl: { configured: false, effective: 'require', organizationDefault: null },
      release: null,
      server: null,
      rootUsername: 'postgres',
      members: [],
      recovery: null,
    })

    const { result } = renderHook(
      () => useEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEnvironmentManaged).toHaveBeenCalledWith(environmentId)
  })

  it('useEnvironmentManaged stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(
      () => useEnvironmentManaged(orgId, environmentId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const emptyEnv = renderHook(() => useEnvironmentManaged(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(emptyEnv.result.current.fetchStatus).toBe('idle')
    expect(fetchEnvironmentManaged).not.toHaveBeenCalled()
  })

  it('useManagedStatus loads status snapshot', async () => {
    fetchManagedStatus.mockResolvedValueOnce(statusSnapshot('running'))

    const { result } = renderHook(
      () => useManagedStatus(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.status).toBe('running')
  })

  it('useManagedStatus polls while provisioning or applying and idles when ready', async () => {
    fetchManagedStatus.mockResolvedValue(statusSnapshot('provisioning'))
    const client = createAppQueryClient()
    const statusKey = queryKeys.org(orgId).managed.status(environmentId)

    const { result } = renderHook(
      () => useManagedStatus(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(resolveStatusPollInterval(client, orgId, environmentId)).toBe(5000)

    client.setQueryData(statusKey, statusSnapshot('applying'))
    expect(resolveStatusPollInterval(client, orgId, environmentId)).toBe(5000)

    client.setQueryData(statusKey, statusSnapshot('running'))
    expect(resolveStatusPollInterval(client, orgId, environmentId)).toBe(false)
  })

  it('useManagedStatus stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(
      () => useManagedStatus(orgId, environmentId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const emptyOrg = renderHook(() => useManagedStatus('', environmentId), {
      wrapper: createWrapper(),
    })
    expect(emptyOrg.result.current.fetchStatus).toBe('idle')
    expect(fetchManagedStatus).not.toHaveBeenCalled()
  })

  it('useManagedUsers loads users', async () => {
    fetchManagedUsers.mockResolvedValueOnce({
      users: [
        {
          id: 'user-1',
          username: 'app',
          databases: ['app'],
          privileges: [],
          connectionRole: 'read-write',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const { result } = renderHook(
      () => useManagedUsers(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchManagedUsers).toHaveBeenCalledWith(environmentId)
    expect(result.current.data?.users).toHaveLength(1)
  })

  it('useManagedUsers stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(
      () => useManagedUsers(orgId, environmentId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const empty = renderHook(() => useManagedUsers(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchManagedUsers).not.toHaveBeenCalled()
  })

  it('useManagedDatabases loads databases', async () => {
    fetchManagedDatabases.mockResolvedValueOnce({ databases: ['app', 'analytics'] })

    const { result } = renderHook(
      () => useManagedDatabases(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchManagedDatabases).toHaveBeenCalledWith(environmentId)
    expect(result.current.data?.databases).toEqual(['app', 'analytics'])
  })

  it('useManagedDatabases stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(
      () => useManagedDatabases(orgId, environmentId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const empty = renderHook(() => useManagedDatabases('', environmentId), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchManagedDatabases).not.toHaveBeenCalled()
  })

  it('useManagedBackups loads backups', async () => {
    fetchManagedBackups.mockResolvedValueOnce({
      backups: [
        {
          id: 'bak-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          sizeBytes: 1024,
          checksum: 'abc123def456',
          path: '/var/lib/turbopanel/backups/bak-1',
        },
      ],
    })

    const { result } = renderHook(
      () => useManagedBackups(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchManagedBackups).toHaveBeenCalledWith(environmentId)
  })

  it('useManagedBackups stays idle when disabled or ids are empty', () => {
    const disabled = renderHook(
      () => useManagedBackups(orgId, environmentId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const empty = renderHook(() => useManagedBackups(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchManagedBackups).not.toHaveBeenCalled()
  })

  it('useManagedLogs stays disabled unless explicitly enabled', () => {
    const { result } = renderHook(
      () => useManagedLogs(orgId, environmentId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchManagedLogs).not.toHaveBeenCalled()
  })

  it('useManagedLogs fetches when enabled and passes tail', async () => {
    fetchManagedLogs.mockResolvedValueOnce({ logs: 'line\n' })

    const { result } = renderHook(
      () => useManagedLogs(orgId, environmentId, { enabled: true, tail: 50 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchManagedLogs).toHaveBeenCalledWith(environmentId, 50)
  })

  it('useManagedLogs stays idle with empty ids even when enabled', () => {
    const { result } = renderHook(
      () => useManagedLogs('', environmentId, { enabled: true }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchManagedLogs).not.toHaveBeenCalled()
  })

  it('useOrganizationCa loads the org CA', async () => {
    fetchOrganizationCa.mockResolvedValueOnce({
      tls: {
        id: 'ca-1',
        source: 'self_signed',
        metadata: {},
        caGeneration: 1,
      },
      trustBundlePem: '-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n',
      leafHealth: { dueCount: 0, caGeneration: 1, caNotAfter: null },
    })

    const { result } = renderHook(() => useOrganizationCa(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchOrganizationCa).toHaveBeenCalled()
  })

  it('useOrganizationCa stays idle when disabled or orgId is empty', () => {
    const disabled = renderHook(
      () => useOrganizationCa(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')

    const empty = renderHook(() => useOrganizationCa(''), {
      wrapper: createWrapper(),
    })
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizationCa).not.toHaveBeenCalled()
  })

  it('useCreateEnvironmentManaged clears secret from mutation cache after success', async () => {
    createEnvironmentManaged.mockResolvedValueOnce({
      ok: true,
      managed: { id: 'managed-1' },
      rootPassword: 'show-once-secret',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
      value: expect.objectContaining({ rootPassword: 'show-once-secret' }),
    })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.environment(environmentId),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).managed.orgList,
    })
  })

  it('useCreateEnvironmentManaged run maps errors and forbidden', async () => {
    createEnvironmentManaged.mockRejectedValueOnce(new Error('create failed'))
    const { result } = renderHook(
      () => useCreateEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run({ engineSeries: '18' })).resolves.toEqual({
      ok: false,
      error: 'create failed',
    })

    createEnvironmentManaged.mockRejectedValueOnce(new Error('HTTP 403: forbidden'))
    await expect(result.current.run(undefined)).resolves.toEqual({
      ok: false,
      error: null,
    })
  })

  it('useUpdateEnvironmentManaged patches settings and invalidates', async () => {
    updateEnvironmentManaged.mockResolvedValueOnce({
      ok: true,
      managed: { id: 'managed-1' },
      settings: { ssl: { mode: 'require' } },
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({
        settings: { ssl: { mode: 'require' }, exposure: { enabled: true } },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateEnvironmentManaged).toHaveBeenCalledWith(environmentId, {
      settings: { ssl: { mode: 'require' }, exposure: { enabled: true } },
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.environment(environmentId),
      })
    })
  })

  it('useApplyEnvironmentManaged applies and invalidates commands', async () => {
    applyEnvironmentManaged.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useApplyEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(applyEnvironmentManaged).toHaveBeenCalledWith(environmentId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    })
  })

  it('useRunManagedLifecycle runs lifecycle action', async () => {
    runManagedLifecycle.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRunManagedLifecycle(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('restart')).resolves.toMatchObject({ ok: true })
    expect(runManagedLifecycle).toHaveBeenCalledWith(environmentId, 'restart')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.status(environmentId),
      })
    })
  })

  it('useDeleteEnvironmentManaged invalidates managed.all', async () => {
    deleteEnvironmentManaged.mockResolvedValueOnce({
      ok: true,
      deleted: true,
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(deleteEnvironmentManaged).toHaveBeenCalledWith(environmentId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.all,
      })
    })
  })

  it('useDeleteEnvironmentManagedMutation takes environmentId and invalidates commands', async () => {
    deleteEnvironmentManaged.mockResolvedValueOnce({
      ok: true,
      deleted: true,
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteEnvironmentManagedMutation(orgId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run(environmentId)).resolves.toMatchObject({
      ok: true,
    })
    expect(deleteEnvironmentManaged).toHaveBeenCalledWith(environmentId)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    })
  })

  it('useRotateManagedRootPassword clears show-once secret', async () => {
    rotateManagedRootPassword.mockResolvedValueOnce({
      ok: true,
      rootPassword: 'new-root-secret',
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRotateManagedRootPassword(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run()).resolves.toMatchObject({
      ok: true,
      value: expect.objectContaining({ rootPassword: 'new-root-secret' }),
    })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    })
  })

  it('useRotateManagedUserPassword clears show-once secret and invalidates bindings', async () => {
    rotateManagedUserPassword.mockResolvedValueOnce({
      ok: true,
      password: 'user-secret',
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRotateManagedUserPassword(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    const viaMutateAsync = await result.current.mutateAsync('principal-1')
    expect(viaMutateAsync).toMatchObject({ password: 'user-secret' })
    expect(result.current.data).toBeUndefined()
    expect(rotateManagedUserPassword).toHaveBeenCalledWith(
      environmentId,
      'principal-1',
    )
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).bindings.all,
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).managed.users(environmentId),
    })
  })

  it('useCreateManagedUser clears show-once password', async () => {
    createManagedUser.mockResolvedValueOnce({
      ok: true,
      user: {
        id: 'user-1',
        username: 'app',
        databases: ['app'],
        privileges: [],
        connectionRole: 'read-write',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      password: 'user-show-once',
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateManagedUser(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ username: 'app', databases: ['app'] }),
    ).resolves.toMatchObject({
      ok: true,
      value: expect.objectContaining({ password: 'user-show-once' }),
    })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.users(environmentId),
      })
    })
  })

  it('useDeleteManagedUser deletes and invalidates users', async () => {
    deleteManagedUser.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteManagedUser(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('principal-1')).resolves.toMatchObject({
      ok: true,
    })
    expect(deleteManagedUser).toHaveBeenCalledWith(environmentId, 'principal-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.users(environmentId),
      })
    })
  })

  it('useCreateManagedDatabase creates a database', async () => {
    createManagedDatabase.mockResolvedValueOnce({
      ok: true,
      databases: ['app'],
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateManagedDatabase(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run({ name: 'app' })).resolves.toMatchObject({
      ok: true,
    })
    expect(createManagedDatabase).toHaveBeenCalledWith(environmentId, {
      name: 'app',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.databases(environmentId),
      })
    })
  })

  it('useDeleteManagedDatabase deletes a database', async () => {
    deleteManagedDatabase.mockResolvedValueOnce({
      ok: true,
      databases: [],
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteManagedDatabase(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('app')).resolves.toMatchObject({ ok: true })
    expect(deleteManagedDatabase).toHaveBeenCalledWith(environmentId, 'app')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.databases(environmentId),
      })
    })
  })

  it('useCreateManagedBackup creates a backup', async () => {
    createManagedBackup.mockResolvedValueOnce({
      ok: true,
      backupId: 'bak-1',
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateManagedBackup(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ database: 'app' }),
    ).resolves.toMatchObject({ ok: true })
    expect(createManagedBackup).toHaveBeenCalledWith(environmentId, {
      database: 'app',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.backups(environmentId),
      })
    })
  })

  it('useDeleteManagedBackup deletes a backup', async () => {
    deleteManagedBackup.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteManagedBackup(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('bak-1')).resolves.toMatchObject({ ok: true })
    expect(deleteManagedBackup).toHaveBeenCalledWith(environmentId, 'bak-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.backups(environmentId),
      })
    })
  })

  it('useRestoreManagedBackup restores and invalidates environment', async () => {
    restoreManagedBackup.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRestoreManagedBackup(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('bak-1')).resolves.toMatchObject({ ok: true })
    expect(restoreManagedBackup).toHaveBeenCalledWith(environmentId, 'bak-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.environment(environmentId),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).commands.all,
    })
  })

  it('useAddManagedReplica adds a replica and invalidates members', async () => {
    addManagedReplica.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useAddManagedReplica(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({
        serverId: 'srv-2',
        replicaClass: 'failover',
        readEligible: false,
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(addManagedReplica).toHaveBeenCalledWith(environmentId, {
      serverId: 'srv-2',
      replicaClass: 'failover',
      readEligible: false,
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.members(environmentId),
      })
    })
  })

  it('useUpdateManagedMemberReadEligible patches readEligible', async () => {
    updateManagedMember.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateManagedMemberReadEligible(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ memberId: 'mem-1', readEligible: true }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateManagedMember).toHaveBeenCalledWith(environmentId, 'mem-1', {
      readEligible: true,
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.orgList,
      })
    })
  })

  it('useUpdateManagedMemberReplicaClass patches replicaClass', async () => {
    updateManagedMember.mockResolvedValueOnce(commandResponse)

    const { result } = renderHook(
      () => useUpdateManagedMemberReplicaClass(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(
      result.current.run({ memberId: 'mem-1', replicaClass: 'read' }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateManagedMember).toHaveBeenCalledWith(environmentId, 'mem-1', {
      replicaClass: 'read',
    })
  })

  it('useRemoveManagedMember removes a member', async () => {
    removeManagedMember.mockResolvedValueOnce(commandResponse)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRemoveManagedMember(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('mem-1')).resolves.toMatchObject({ ok: true })
    expect(removeManagedMember).toHaveBeenCalledWith(environmentId, 'mem-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.members(environmentId),
      })
    })
  })

  it('usePromoteManagedMember omits force unless set', async () => {
    promoteManagedMember.mockResolvedValue(commandResponse)

    const { result } = renderHook(
      () => usePromoteManagedMember(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(
      result.current.run({ memberId: 'mem-1' }),
    ).resolves.toMatchObject({ ok: true })
    expect(promoteManagedMember).toHaveBeenCalledWith(environmentId, 'mem-1', {})

    await expect(
      result.current.run({ memberId: 'mem-1', force: true }),
    ).resolves.toMatchObject({ ok: true })
    expect(promoteManagedMember).toHaveBeenCalledWith(environmentId, 'mem-1', {
      force: true,
    })
  })

  it('usePromoteManagedDisasterRecovery confirms promote', async () => {
    promoteManagedDisasterRecovery.mockResolvedValueOnce({
      ...commandResponse,
      fencePending: false,
      kind: 'disaster-recovery',
      lagBytes: null,
      source: { memberId: 'mem-1', serverId: 'srv-1', datacenterId: null },
      target: { memberId: 'mem-2', serverId: 'srv-2', datacenterId: null },
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => usePromoteManagedDisasterRecovery(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('mem-2')).resolves.toMatchObject({ ok: true })
    expect(promoteManagedDisasterRecovery).toHaveBeenCalledWith(environmentId, {
      memberId: 'mem-2',
      confirm: true,
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.members(environmentId),
      })
    })
  })
})
