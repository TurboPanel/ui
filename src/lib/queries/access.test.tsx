// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useAccessGrants,
  useCreateAccessGrant,
  useOrganizations,
  usePermissions,
  useResolveResourceId,
  useRevokeAccessGrant,
  useTeams,
} from '@/lib/queries/access'

const {
  fetchPermissions,
  fetchAccessGrants,
  resolveResourceId,
  createAccessGrant,
  fetchOrganizations,
  fetchVisibleTeams,
  revokeAccessGrant,
} = vi.hoisted(() => ({
  fetchPermissions: vi.fn(),
  fetchAccessGrants: vi.fn(),
  resolveResourceId: vi.fn(),
  createAccessGrant: vi.fn(),
  fetchOrganizations: vi.fn(),
  fetchVisibleTeams: vi.fn(),
  revokeAccessGrant: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchPermissions,
    fetchAccessGrants,
    resolveResourceId,
    createAccessGrant,
    fetchOrganizations,
    fetchVisibleTeams,
    revokeAccessGrant,
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

describe('access query hooks', () => {
  const resourceId = 'res-1'

  it('usePermissions loads permission catalog', async () => {
    fetchPermissions.mockResolvedValueOnce({
      permissions: ['organization:manage'],
    })

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.permissions).toContain('organization:manage')
  })

  it('usePermissions stays idle when enabled is false', () => {
    const { result } = renderHook(() => usePermissions({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchPermissions).not.toHaveBeenCalled()
  })

  it('useAccessGrants loads grants for a resource', async () => {
    fetchAccessGrants.mockResolvedValueOnce({
      access: [{ id: 'grant-1', resourceId }],
    })

    const { result } = renderHook(() => useAccessGrants(resourceId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchAccessGrants).toHaveBeenCalledWith(resourceId)
  })

  it('useAccessGrants stays idle for empty resource id or enabled false', () => {
    const empty = renderHook(() => useAccessGrants(''), {
      wrapper: createWrapper(),
    })
    const disabled = renderHook(
      () => useAccessGrants(resourceId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(fetchAccessGrants).not.toHaveBeenCalled()
  })

  it('useOrganizations loads organization list', async () => {
    fetchOrganizations.mockResolvedValueOnce({
      organizations: [{ id: 'org-1', name: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useOrganizations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.organizations).toHaveLength(1)
  })

  it('useOrganizations stays idle when enabled is false', () => {
    const { result } = renderHook(() => useOrganizations({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizations).not.toHaveBeenCalled()
  })

  it('useTeams loads visible teams', async () => {
    fetchVisibleTeams.mockResolvedValueOnce({
      teams: [{ id: 'team-1', name: 'Ops' }],
    })

    const { result } = renderHook(() => useTeams(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.teams).toHaveLength(1)
  })

  it('useTeams stays idle when enabled is false', () => {
    const { result } = renderHook(() => useTeams({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchVisibleTeams).not.toHaveBeenCalled()
  })

  it('useResolveResourceId resolves organization resource id', async () => {
    resolveResourceId.mockResolvedValueOnce({ resourceId: 'org-res' })

    const { result } = renderHook(
      () => useResolveResourceId('organization', 'org-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(resolveResourceId).toHaveBeenCalledWith('organization', 'org-1')
  })

  it('useResolveResourceId stays idle for null kind, empty id, or enabled false', () => {
    const nullKind = renderHook(() => useResolveResourceId(null, 'org-1'), {
      wrapper: createWrapper(),
    })
    const emptyId = renderHook(
      () => useResolveResourceId('organization', ''),
      { wrapper: createWrapper() },
    )
    const disabled = renderHook(
      () => useResolveResourceId('organization', 'org-1', { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(nullKind.result.current.fetchStatus).toBe('idle')
    expect(emptyId.result.current.fetchStatus).toBe('idle')
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(resolveResourceId).not.toHaveBeenCalled()
  })

  it('useCreateAccessGrant creates grant with resource id', async () => {
    createAccessGrant.mockResolvedValueOnce({ ok: true, id: 'grant-2' })

    const { result } = renderHook(() => useCreateAccessGrant(resourceId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        subjectKind: 'team',
        subjectId: 'team-1',
        effect: 'allow',
        permissionKey: 'organization:manage',
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(createAccessGrant).toHaveBeenCalledWith({
      resourceId,
      subjectKind: 'team',
      subjectId: 'team-1',
      effect: 'allow',
      permissionKey: 'organization:manage',
    })
  })

  it('useRevokeAccessGrant revokes and invalidates grants cache', async () => {
    revokeAccessGrant.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'access', resourceId], {
      access: [{ id: 'grant-1', resourceId }],
    })

    const { result } = renderHook(() => useRevokeAccessGrant(resourceId), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run('grant-1')).resolves.toMatchObject({
      ok: true,
    })
    expect(revokeAccessGrant).toHaveBeenCalledWith(
      'grant-1',
      expect.anything(),
    )
  })
})
