// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURBOPANEL_WORKSPACE_KIND } from '@/lib/system-inventory'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateWorkspace,
  useSystemWorkspace,
  useWorkspaces,
} from '@/lib/queries/workspaces'

const {
  fetchVisibleWorkspaces,
  createWorkspace,
} = vi.hoisted(() => ({
  fetchVisibleWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVisibleWorkspaces,
  createWorkspace,
  fetchWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
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
})
