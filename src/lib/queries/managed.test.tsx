// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateEnvironmentManaged,
  useEnvironmentManaged,
  useManagedLogs,
  useManagedStatus,
  useOrganizationManaged,
} from '@/lib/queries/managed'

const {
  fetchOrganizationManaged,
  fetchEnvironmentManaged,
  fetchManagedStatus,
  fetchManagedLogs,
  createEnvironmentManaged,
} = vi.hoisted(() => ({
  fetchOrganizationManaged: vi.fn(),
  fetchEnvironmentManaged: vi.fn(),
  fetchManagedStatus: vi.fn(),
  fetchManagedLogs: vi.fn(),
  createEnvironmentManaged: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrganizationManaged,
    fetchEnvironmentManaged,
    fetchManagedStatus,
    fetchManagedLogs,
    createEnvironmentManaged,
    updateEnvironmentManaged: vi.fn(),
    applyEnvironmentManaged: vi.fn(),
    deleteEnvironmentManaged: vi.fn(),
    fetchManagedUsers: vi.fn(),
    fetchManagedDatabases: vi.fn(),
    fetchManagedBackups: vi.fn(),
    fetchOrganizationCa: vi.fn(),
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

  it('useManagedStatus loads status snapshot', async () => {
    fetchManagedStatus.mockResolvedValueOnce({
      status: 'running',
      host: '127.0.0.1',
      port: 15432,
      error: null,
      containers: [],
      members: [],
    })

    const { result } = renderHook(
      () => useManagedStatus(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.status).toBe('running')
  })

  it('useManagedLogs stays disabled unless explicitly enabled', () => {
    const { result } = renderHook(
      () => useManagedLogs(orgId, environmentId),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchManagedLogs).not.toHaveBeenCalled()
  })

  it('useCreateEnvironmentManaged clears secret from mutation cache after success', async () => {
    createEnvironmentManaged.mockResolvedValueOnce({
      ok: true,
      managed: { id: 'managed-1' },
      rootPassword: 'show-once-secret',
    })

    const { result } = renderHook(
      () => useCreateEnvironmentManaged(orgId, environmentId),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
      value: expect.objectContaining({ rootPassword: 'show-once-secret' }),
    })
    expect(result.current.data).toBeUndefined()
  })
})
