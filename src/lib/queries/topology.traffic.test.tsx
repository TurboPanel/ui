// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { useChooseServerTrafficNetwork, useIps, useServerTrafficMap } from '@/lib/queries/topology'

const { fetchServerTrafficMap, chooseServerTrafficNetwork, fetchIps } = vi.hoisted(() => ({
  fetchServerTrafficMap: vi.fn(),
  chooseServerTrafficNetwork: vi.fn(),
  fetchIps: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchServerTrafficMap, chooseServerTrafficNetwork, fetchIps }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('server traffic hooks', () => {
  it('useServerTrafficMap loads the map for a server', async () => {
    fetchServerTrafficMap.mockResolvedValue({ ok: true, peers: [] })
    const { result } = renderHook(() => useServerTrafficMap('org-1', 'srv-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchServerTrafficMap).toHaveBeenCalledWith('srv-1')
  })

  it('useServerTrafficMap stays idle when disabled or ids are empty', () => {
    renderHook(() => useServerTrafficMap('org-1', 'srv-1', { enabled: false }), {
      wrapper: createWrapper(),
    })
    renderHook(() => useServerTrafficMap('', 'srv-1'), {
      wrapper: createWrapper(),
    })
    renderHook(() => useServerTrafficMap('org-1', ''), {
      wrapper: createWrapper(),
    })
    expect(fetchServerTrafficMap).not.toHaveBeenCalled()
  })

  it('useChooseServerTrafficNetwork refreshes networks and servers after settling', async () => {
    chooseServerTrafficNetwork.mockResolvedValue({ ok: true, changes: [] })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useChooseServerTrafficNetwork('org-1'), {
      wrapper: createWrapper(client),
    })
    result.current.mutate('dc-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(chooseServerTrafficNetwork.mock.calls[0][0]).toBe('dc-1')
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.org('org-1').topology.datacenters,
      })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['org', 'org-1', 'server'],
    })
  })

  it('useIps loads without filters', async () => {
    fetchIps.mockResolvedValue({ ips: [] })
    const { result } = renderHook(() => useIps('org-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchIps).toHaveBeenCalledWith(undefined)
  })
})
