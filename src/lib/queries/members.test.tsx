// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useOrganizationMembers, useRemoveOrganizationMember } from '@/lib/queries/members'

const { fetchOrganizationMembers, removeOrganizationMember } = vi.hoisted(() => ({
  fetchOrganizationMembers: vi.fn(),
  removeOrganizationMember: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchOrganizationMembers, removeOrganizationMember }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('organization member hooks', () => {
  it('loads the members, and stays idle when disabled', async () => {
    fetchOrganizationMembers.mockResolvedValueOnce({ members: [{ id: 'u1' }] })
    const { result } = renderHook(() => useOrganizationMembers('org-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchOrganizationMembers).toHaveBeenCalledWith('org-1')

    const idle = renderHook(() => useOrganizationMembers('org-1', { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('removing a person refreshes the list', async () => {
    fetchOrganizationMembers.mockResolvedValue({ members: [] })
    removeOrganizationMember.mockResolvedValueOnce({ ok: true })
    const wrapper = createWrapper()
    const list = renderHook(() => useOrganizationMembers('org-1'), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    const remove = renderHook(() => useRemoveOrganizationMember('org-1'), { wrapper })
    await act(async () => {
      await remove.result.current.run('u2')
    })
    expect(removeOrganizationMember).toHaveBeenCalledWith('org-1', 'u2')
    await waitFor(() => expect(fetchOrganizationMembers).toHaveBeenCalledTimes(2))
  })

  it('shows the API text when removal is refused', async () => {
    removeOrganizationMember.mockRejectedValueOnce(
      new Error('Cannot remove the last owner of an organization')
    )
    const remove = renderHook(() => useRemoveOrganizationMember('org-1'), {
      wrapper: createWrapper(),
    })
    await act(async () => {
      await remove.result.current.run('u2')
    })
    await waitFor(() =>
      expect(remove.result.current.actionError).toBe(
        'Cannot remove the last owner of an organization'
      )
    )
  })
})
