// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useAddTunnelBadge,
  useCheckTunnelBadge,
  useConnectTunnelCarrier,
  useDeleteTunnelBadge,
  useDeleteTunnelCarrier,
  useTunnelCarriers,
} from '@/lib/queries/tunnels'

const api = vi.hoisted(() => ({
  fetchTunnelCarriers: vi.fn(),
  connectTunnelCarrier: vi.fn(),
  addTunnelBadge: vi.fn(),
  checkTunnelBadge: vi.fn(),
  deleteTunnelBadge: vi.fn(),
  deleteTunnelCarrier: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const orgId = 'org-1'

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('tunnel carrier queries', () => {
  it('loads the accounts for the org', async () => {
    api.fetchTunnelCarriers.mockResolvedValueOnce({ carriers: [] })
    const { result } = renderHook(() => useTunnelCarriers(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchTunnelCarriers).toHaveBeenCalledWith(orgId)
  })

  it('stays idle when disabled', () => {
    const { result } = renderHook(() => useTunnelCarriers(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.fetchTunnelCarriers).not.toHaveBeenCalled()
  })

  it('reads a refusal as an empty list', async () => {
    api.fetchTunnelCarriers.mockRejectedValueOnce(new Error('/x failed: HTTP 403: forbidden'))
    const { result } = renderHook(() => useTunnelCarriers(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ carriers: [] })
  })

  it('passes other failures through', async () => {
    api.fetchTunnelCarriers.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useTunnelCarriers(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('every write refreshes the list', async () => {
    const client = createAppQueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)
    api.connectTunnelCarrier.mockResolvedValue({ connected: [] })
    api.addTunnelBadge.mockResolvedValue({})
    api.checkTunnelBadge.mockResolvedValue({})
    api.deleteTunnelBadge.mockResolvedValue({ ok: true })
    api.deleteTunnelCarrier.mockResolvedValue({ ok: true })

    const connect = renderHook(() => useConnectTunnelCarrier(orgId), { wrapper })
    const add = renderHook(() => useAddTunnelBadge(orgId, 'c1'), { wrapper })
    const check = renderHook(() => useCheckTunnelBadge(orgId, 'c1'), { wrapper })
    const removeBadge = renderHook(() => useDeleteTunnelBadge(orgId, 'c1'), { wrapper })
    const removeCarrier = renderHook(() => useDeleteTunnelCarrier(orgId), { wrapper })

    await act(async () => {
      await connect.result.current.run({ label: 'L', token: `cfat_${'x'.repeat(8)}` })
      await add.result.current.run({ label: 'L', token: `cfat_${'x'.repeat(8)}` })
      await check.result.current.run('b1')
      await removeBadge.result.current.run('b1')
      await removeCarrier.result.current.run('c1')
    })

    expect(api.connectTunnelCarrier).toHaveBeenCalledWith(orgId, {
      label: 'L',
      token: `cfat_${'x'.repeat(8)}`,
    })
    expect(api.addTunnelBadge).toHaveBeenCalledWith(orgId, 'c1', {
      label: 'L',
      token: `cfat_${'x'.repeat(8)}`,
    })
    expect(api.checkTunnelBadge).toHaveBeenCalledWith(orgId, 'c1', 'b1')
    expect(api.deleteTunnelBadge).toHaveBeenCalledWith(orgId, 'c1', 'b1')
    expect(api.deleteTunnelCarrier).toHaveBeenCalledWith(orgId, 'c1')
    expect(spy).toHaveBeenCalledTimes(5)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).tunnelCarriers })
  })
})
