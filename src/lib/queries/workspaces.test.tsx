// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURBOPANEL_WORKSPACE_KIND } from '@/lib/system-inventory'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useSystemWorkspace,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaces,
} from '@/lib/queries/workspaces'

const {
  fetchVisibleWorkspaces,
  createWorkspace,
  fetchWorkspace,
  updateWorkspace,
  deleteWorkspace,
} = vi.hoisted(() => ({
  fetchVisibleWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  fetchWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVisibleWorkspaces,
  createWorkspace,
  fetchWorkspace,
  updateWorkspace,
  deleteWorkspace,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('workspaces query hooks', () => {
  const orgId = 'org-1'

  it('useWorkspaces loads workspace list', async () => {
    fetchVisibleWorkspaces.mockResolvedValueOnce({
      workspaces: [{ id: 'ws-1', name: 'Default', kind: 'user' }],
    })

    const { result } = renderHook(() => useWorkspaces(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.workspaces).toHaveLength(1)
  })

  it('useSystemWorkspace selects the platform workspace', async () => {
    fetchVisibleWorkspaces.mockResolvedValueOnce({
      workspaces: [
        { id: 'ws-user', name: 'Team', kind: 'user' },
        { id: 'ws-platform', name: 'TurboPanel', kind: TURBOPANEL_WORKSPACE_KIND },
      ],
    })

    const { result } = renderHook(() => useSystemWorkspace(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.systemWorkspace?.id).toBe('ws-platform')
  })

  it('useCreateWorkspace runs create mutation', async () => {
    createWorkspace.mockResolvedValueOnce({ ok: true, id: 'ws-2' })

    const { result } = renderHook(() => useCreateWorkspace(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ name: 'New workspace' }),
    ).resolves.toMatchObject({ ok: true, value: { ok: true, id: 'ws-2' } })
  })

  it('useWorkspace loads one workspace', async () => {
    fetchWorkspace.mockResolvedValueOnce({
      workspace: { id: 'ws-1', name: 'Default', kind: 'user' },
    })

    const { result } = renderHook(() => useWorkspace(orgId, 'ws-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('useWorkspace stays idle without workspace id', () => {
    const { result } = renderHook(() => useWorkspace(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchWorkspace).not.toHaveBeenCalled()
  })

  it('useUpdateWorkspace invalidates detail and list caches', async () => {
    updateWorkspace.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const workspaceId = 'ws-1'

    const { result } = renderHook(
      () => useUpdateWorkspace(orgId, workspaceId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ name: 'Renamed workspace' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).workspaces.detail(workspaceId),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).workspaces.list,
    })
  })

  it('useDeleteWorkspace invalidates workspace caches', async () => {
    deleteWorkspace.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteWorkspace(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run('ws-1')).resolves.toMatchObject({
      ok: true,
    })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).workspaces.all,
      })
    })
  })
})
