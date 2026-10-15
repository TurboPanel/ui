// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useSaveServerAddresses, useServerAddresses } from '@/lib/queries/servers'

const { fetchServerAddresses, saveServerAddresses } = vi.hoisted(() => ({
  fetchServerAddresses: vi.fn(),
  saveServerAddresses: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchServerAddresses, saveServerAddresses }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const orgId = 'org-1'
const view = { externalAccess: false, linuxHostname: 'omega', addressNeeded: false, addresses: [] }

afterEach(() => {
  vi.clearAllMocks()
})

describe('useServerAddresses', () => {
  it('reads the addresses under the server key', async () => {
    fetchServerAddresses.mockResolvedValue(view)
    const client = createAppQueryClient()
    const { result } = renderHook(() => useServerAddresses(orgId, 'srv-1'), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(result.current.data).toEqual(view))
    expect(fetchServerAddresses).toHaveBeenCalledWith('srv-1')
    expect(client.getQueryData(queryKeys.org(orgId).servers.addresses('srv-1'))).toEqual(view)
  })

  it('hides the card (null) on an older control plane and without manage', async () => {
    fetchServerAddresses.mockRejectedValueOnce(new Error('/x failed: HTTP 404: Not found'))
    const missing = renderHook(() => useServerAddresses(orgId, 'srv-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(missing.result.current.isSuccess).toBe(true))
    expect(missing.result.current.data).toBeNull()

    fetchServerAddresses.mockRejectedValueOnce(new Error('/x failed: HTTP 403: forbidden'))
    const denied = renderHook(() => useServerAddresses(orgId, 'srv-2'), { wrapper: createWrapper() })
    await waitFor(() => expect(denied.result.current.isSuccess).toBe(true))
    expect(denied.result.current.data).toBeNull()
  })

  it('surfaces other failures and stays idle when disabled', async () => {
    fetchServerAddresses.mockRejectedValue(new Error('/x failed: HTTP 500'))
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const failing = renderHook(() => useServerAddresses(orgId, 'srv-1'), { wrapper: createWrapper(client) })
    await waitFor(() => expect(failing.result.current.isError).toBe(true))

    fetchServerAddresses.mockClear()
    renderHook(() => useServerAddresses(orgId, 'srv-1', { enabled: false }), { wrapper: createWrapper() })
    renderHook(() => useServerAddresses(orgId, ''), { wrapper: createWrapper() })
    expect(fetchServerAddresses).not.toHaveBeenCalled()
  })
})

describe('useSaveServerAddresses', () => {
  it('saves and refreshes the addresses and every managed view, even when refused', async () => {
    saveServerAddresses.mockResolvedValueOnce({ ...view, certificateUpdatePending: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveServerAddresses(orgId, 'srv-1'), {
      wrapper: createWrapper(client),
    })
    const input = [{ scope: 'public' as const, hostname: 'omega.example.com' }]
    await expect(result.current.run(input)).resolves.toMatchObject({
      ok: true,
      value: { certificateUpdatePending: true },
    })
    expect(saveServerAddresses).toHaveBeenCalledWith('srv-1', input)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).servers.addresses('srv-1'),
      })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).managed.all })
    })

    invalidate.mockClear()
    saveServerAddresses.mockRejectedValueOnce(new Error('/x failed: HTTP 400: address_v4_invalid'))
    await expect(result.current.run([])).resolves.toMatchObject({ ok: false })
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2))
  })
})
