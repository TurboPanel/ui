// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  failedRetireServerIds,
  isServerPrincipalQuery,
  useDeleteOrgPrincipal,
  useOrgPrincipals,
} from '@/lib/queries/org-principals'

const { fetchOrgPrincipals, deleteOrgPrincipal } = vi.hoisted(() => ({
  fetchOrgPrincipals: vi.fn(),
  deleteOrgPrincipal: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchOrgPrincipals,
  deleteOrgPrincipal,
  isForbiddenError: () => false,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('organization principal hooks', () => {
  it('useOrgPrincipals loads the organization list', async () => {
    fetchOrgPrincipals.mockResolvedValueOnce({ principals: [{ id: 'p1' }] })
    const { result } = renderHook(() => useOrgPrincipals('org-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchOrgPrincipals).toHaveBeenCalledWith('org-1')
    expect(result.current.data?.principals).toHaveLength(1)
  })

  it('useOrgPrincipals stays idle when disabled', () => {
    renderHook(() => useOrgPrincipals('org-1', { enabled: false }), { wrapper: createWrapper() })
    expect(fetchOrgPrincipals).not.toHaveBeenCalled()
  })

  it('useDeleteOrgPrincipal deletes and reloads the principal lists', async () => {
    deleteOrgPrincipal.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteOrgPrincipal('org-1'), {
      wrapper: createWrapper(client),
    })
    await result.current.mutateAsync('p1')
    expect(deleteOrgPrincipal).toHaveBeenCalledWith('org-1', 'p1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org('org-1').principals })
      expect(invalidate).toHaveBeenCalledWith({ predicate: expect.any(Function) })
    })
  })

  it('useDeleteOrgPrincipal reloads the lists when the delete is refused', async () => {
    deleteOrgPrincipal.mockRejectedValueOnce(new Error('In use'))
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteOrgPrincipal('org-1'), {
      wrapper: createWrapper(client),
    })
    await expect(result.current.mutateAsync('p1')).rejects.toThrow('In use')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org('org-1').principals })
    })
  })

  it('only server principal queries match the narrowed reload', () => {
    expect(isServerPrincipalQuery('org-1', ['org', 'org-1', 'server', 's1', 'principals'])).toBe(
      true
    )
    expect(
      isServerPrincipalQuery('org-1', ['org', 'org-1', 'server', 's1', 'principal-removal-plan'])
    ).toBe(true)
    expect(isServerPrincipalQuery('org-1', ['org', 'org-1', 'server', 's1', 'labels'])).toBe(false)
    expect(isServerPrincipalQuery('org-2', ['org', 'org-1', 'server', 's1', 'principals'])).toBe(
      false
    )
  })

  it('failedRetireServerIds lists the servers a retire was not queued for', () => {
    expect(failedRetireServerIds(undefined)).toEqual([])
    expect(failedRetireServerIds({ reconciled: { failedServerIds: ['s1'] } })).toEqual(['s1'])
  })
})
