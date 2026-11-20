// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import { useAdminOrganizations } from './admin'
import { useDeleteOrganization } from './auth'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function setup() {
  const client = createAppQueryClient()
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('organization delete and admin list hooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the admin organization list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ organizations: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = setup()
    const { result } = renderHook(() => useAdminOrganizations(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ organizations: [] }))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/admin/v1/organizations')
  })

  it('does not load the admin list while disabled', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = setup()
    renderHook(() => useAdminOrganizations({ enabled: false }), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes both organization lists after a delete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, id: 'o1' })))
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteOrganization(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'o1', confirmName: 'Acme' })
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.organizations })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.organizations })
  })
})
