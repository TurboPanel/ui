// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateDatacenter,
  useDatacenters,
  useIps,
  useNetworks,
} from '@/lib/queries/topology'

const {
  fetchDatacenters,
  createDatacenter,
  fetchIps,
  fetchNetworks,
} = vi.hoisted(() => ({
  fetchDatacenters: vi.fn(),
  createDatacenter: vi.fn(),
  fetchIps: vi.fn(),
  fetchNetworks: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchDatacenters,
  createDatacenter,
  fetchIps,
  fetchNetworks,
  fetchDatacenter: vi.fn(),
  fetchDatacenterNameSuggestions: vi.fn(),
  fetchIp: vi.fn(),
  addDatacenterMembers: vi.fn(),
  removeDatacenterMember: vi.fn(),
  updateDatacenter: vi.fn(),
  deleteDatacenter: vi.fn(),
  createDatacenterSubnet: vi.fn(),
  updateDatacenterSubnet: vi.fn(),
  deleteDatacenterSubnet: vi.fn(),
  createIp: vi.fn(),
  updateIp: vi.fn(),
  deleteIp: vi.fn(),
  createNetwork: vi.fn(),
  updateNetwork: vi.fn(),
  deleteNetwork: vi.fn(),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('topology query hooks', () => {
  const orgId = 'org-1'

  it('useDatacenters loads datacenter inventory', async () => {
    fetchDatacenters.mockResolvedValueOnce({
      datacenters: [{ id: 'dc-1', name: 'LAN' }],
    })

    const { result } = renderHook(() => useDatacenters(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.datacenters).toHaveLength(1)
  })

  it('useIps strips organizationId before fetch', async () => {
    fetchIps.mockResolvedValueOnce({ ips: [] })

    const { result } = renderHook(
      () =>
        useIps(orgId, {
          organizationId: orgId,
          scope: 'public',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchIps).toHaveBeenCalledWith({ scope: 'public' })
  })

  it('useNetworks loads docker networks', async () => {
    fetchNetworks.mockResolvedValueOnce({ networks: [] })

    const { result } = renderHook(
      () =>
        useNetworks(orgId, {
          organizationId: orgId,
          kind: 'docker',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchNetworks).toHaveBeenCalledWith({ kind: 'docker' })
  })

  it('useCreateDatacenter runs create mutation', async () => {
    createDatacenter.mockResolvedValueOnce({
      ok: true,
      datacenter: { id: 'dc-2' },
    })

    const { result } = renderHook(() => useCreateDatacenter(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        members: [{ serverId: 'srv-1', address: '10.0.0.1' }],
      }),
    ).resolves.toMatchObject({ ok: true })
  })
})
