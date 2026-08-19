// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useAccessGrants,
  useCreateAccessGrant,
  usePermissions,
  useResolveResourceId,
} from '@/lib/queries/access'

const {
  fetchPermissions,
  fetchAccessGrants,
  resolveResourceId,
  createAccessGrant,
} = vi.hoisted(() => ({
  fetchPermissions: vi.fn(),
  fetchAccessGrants: vi.fn(),
  resolveResourceId: vi.fn(),
  createAccessGrant: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchPermissions,
  fetchAccessGrants,
  resolveResourceId,
  createAccessGrant,
  fetchOrganizations: vi.fn(),
  fetchVisibleTeams: vi.fn(),
  revokeAccessGrant: vi.fn(),
}))

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
})
