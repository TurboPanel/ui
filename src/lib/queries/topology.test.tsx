// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useAddDatacenterMembers,
  useCreateDatacenter,
  useCreateDatacenterSubnet,
  useCreateIp,
  useCreateNetwork,
  useDatacenter,
  useDatacenterNameSuggestions,
  useDatacenters,
  useDeleteDatacenter,
  useDeleteDatacenterSubnet,
  useDeleteIp,
  useDeleteNetwork,
  useIp,
  useIps,
  useNetworks,
  useRemoveDatacenterMember,
  useUpdateDatacenter,
  useUpdateDatacenterSubnet,
  useUpdateIp,
  useUpdateNetwork,
} from '@/lib/queries/topology'

const {
  fetchDatacenters,
  fetchDatacenter,
  createDatacenter,
  fetchIps,
  fetchNetworks,
  fetchDatacenterNameSuggestions,
  fetchIp,
  updateDatacenter,
  deleteDatacenter,
  addDatacenterMembers,
  removeDatacenterMember,
  createDatacenterSubnet,
  updateDatacenterSubnet,
  deleteDatacenterSubnet,
  createIp,
  updateIp,
  deleteIp,
  createNetwork,
  updateNetwork,
  deleteNetwork,
} = vi.hoisted(() => ({
  fetchDatacenters: vi.fn(),
  fetchDatacenter: vi.fn(),
  createDatacenter: vi.fn(),
  fetchIps: vi.fn(),
  fetchNetworks: vi.fn(),
  fetchDatacenterNameSuggestions: vi.fn(),
  fetchIp: vi.fn(),
  updateDatacenter: vi.fn(),
  deleteDatacenter: vi.fn(),
  addDatacenterMembers: vi.fn(),
  removeDatacenterMember: vi.fn(),
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

vi.mock('@/lib/instance-api', () => ({
  fetchDatacenters,
  createDatacenter,
  fetchIps,
  fetchNetworks,
  fetchDatacenter,
  fetchDatacenterNameSuggestions,
  fetchIp,
  addDatacenterMembers,
  removeDatacenterMember,
  updateDatacenter,
  deleteDatacenter,
  createDatacenterSubnet,
  updateDatacenterSubnet,
  deleteDatacenterSubnet,
  createIp,
  updateIp,
  deleteIp,
  createNetwork,
  updateNetwork,
  deleteNetwork,
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
  const datacenterId = 'dc-1'
  const ipId = 'ip-1'
  const networkId = 'net-1'

  it('useDatacenters loads datacenter inventory', async () => {
    fetchDatacenters.mockResolvedValueOnce({
      datacenters: [{ id: datacenterId, name: 'LAN' }],
    })

    const { result } = renderHook(() => useDatacenters(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.datacenters).toHaveLength(1)
  })

  it('useDatacenters stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useDatacenters(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchDatacenters).not.toHaveBeenCalled()
  })

  it('useDatacenter loads one datacenter', async () => {
    fetchDatacenter.mockResolvedValueOnce({
      datacenter: { id: datacenterId, name: 'LAN' },
      members: [],
    })

    const { result } = renderHook(() => useDatacenter(orgId, datacenterId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchDatacenter).toHaveBeenCalledWith(datacenterId)
  })

  it('useDatacenter stays idle when datacenterId is empty', () => {
    const { result } = renderHook(() => useDatacenter(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchDatacenter).not.toHaveBeenCalled()
  })

  it('useDatacenterNameSuggestions loads suggestions', async () => {
    fetchDatacenterNameSuggestions.mockResolvedValueOnce({
      suggestions: [{ name: 'Chicago DC', serverCount: 2 }],
    })

    const { result } = renderHook(
      () => useDatacenterNameSuggestions(orgId, { limit: 5 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchDatacenterNameSuggestions).toHaveBeenCalledWith({ limit: 5 })
  })

  it('useDatacenterNameSuggestions respects enabled:false', () => {
    const { result } = renderHook(
      () => useDatacenterNameSuggestions(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchDatacenterNameSuggestions).not.toHaveBeenCalled()
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

  it('useIps loads without filters', async () => {
    fetchIps.mockResolvedValueOnce({ ips: [] })

    const { result } = renderHook(() => useIps(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchIps).toHaveBeenCalledWith(undefined)
  })

  it('useIps stays idle when disabled', () => {
    const { result } = renderHook(
      () => useIps(orgId, { scope: 'public' }, { enabled: false }),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchIps).not.toHaveBeenCalled()
  })

  it('useIp loads a single address record', async () => {
    fetchIp.mockResolvedValueOnce({
      id: ipId,
      address: '203.0.113.10',
      scope: 'public',
      version: 4,
    })

    const { result } = renderHook(() => useIp(orgId, ipId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchIp).toHaveBeenCalledWith(ipId)
    if (!result.current.data || !('address' in result.current.data)) {
      throw new TypeError('expected ip record')
    }
    expect(result.current.data.address).toBe('203.0.113.10')
  })

  it('useIp stays idle when ipId is empty', () => {
    const { result } = renderHook(() => useIp(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchIp).not.toHaveBeenCalled()
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

  it('useNetworks loads without filters', async () => {
    fetchNetworks.mockResolvedValueOnce({ networks: [] })

    const { result } = renderHook(() => useNetworks(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchNetworks).toHaveBeenCalledWith(undefined)
  })

  it('useNetworks stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useNetworks(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchNetworks).not.toHaveBeenCalled()
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
        members: [{ serverId: 'srv-1', address: '203.0.113.10' }],
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  it('useUpdateDatacenter patches datacenter metadata', async () => {
    updateDatacenter.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateDatacenter(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run({ name: 'Renamed DC' })
    expect(updateDatacenter).toHaveBeenCalledWith(datacenterId, {
      name: 'Renamed DC',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
    })
  })

  it('useDeleteDatacenter invalidates topology subtree', async () => {
    deleteDatacenter.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteDatacenter(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run(datacenterId)
    expect(deleteDatacenter.mock.calls[0]?.[0]).toBe(datacenterId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useAddDatacenterMembers adds pins', async () => {
    addDatacenterMembers.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useAddDatacenterMembers(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run([
      { serverId: 'srv-1', address: '203.0.113.20' },
    ])
    expect(addDatacenterMembers).toHaveBeenCalledWith(datacenterId, [
      { serverId: 'srv-1', address: '203.0.113.20' },
    ])
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useRemoveDatacenterMember removes a pin', async () => {
    removeDatacenterMember.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useRemoveDatacenterMember(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run('srv-1')
    expect(removeDatacenterMember).toHaveBeenCalledWith(
      datacenterId,
      'srv-1',
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.list,
    })
  })

  it('useCreateDatacenterSubnet creates a subnet', async () => {
    createDatacenterSubnet.mockResolvedValueOnce({ ok: true, networkId })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateDatacenterSubnet(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run({ cidr: '203.0.113.0/24' })
    expect(createDatacenterSubnet).toHaveBeenCalledWith(datacenterId, {
      cidr: '203.0.113.0/24',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.networksAll,
    })
  })

  it('useUpdateDatacenterSubnet patches subnet metadata', async () => {
    updateDatacenterSubnet.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateDatacenterSubnet(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run({
      networkId,
      body: { description: 'Primary subnet' },
    })
    expect(updateDatacenterSubnet).toHaveBeenCalledWith(
      datacenterId,
      networkId,
      { description: 'Primary subnet' },
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.datacenters,
    })
  })

  it('useDeleteDatacenterSubnet removes a subnet', async () => {
    deleteDatacenterSubnet.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteDatacenterSubnet(orgId, datacenterId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run(networkId)
    expect(deleteDatacenterSubnet).toHaveBeenCalledWith(
      datacenterId,
      networkId,
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
    })
  })

  it('useCreateIp creates an address', async () => {
    createIp.mockResolvedValueOnce({ ok: true, id: ipId })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateIp(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      address: '203.0.113.50',
      allocation: 'dedicated',
      scope: 'public',
    })
    expect(createIp.mock.calls[0]?.[0]).toEqual({
      address: '203.0.113.50',
      allocation: 'dedicated',
      scope: 'public',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useUpdateIp patches an address', async () => {
    updateIp.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateIp(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      ipId,
      body: { description: 'Edge public IP' },
    })
    expect(updateIp).toHaveBeenCalledWith(ipId, {
      description: 'Edge public IP',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useDeleteIp removes an address', async () => {
    deleteIp.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteIp(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run(ipId)
    expect(deleteIp.mock.calls[0]?.[0]).toBe(ipId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useCreateNetwork registers a docker network', async () => {
    createNetwork.mockResolvedValueOnce({ ok: true, id: networkId })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateNetwork(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      organizationId: orgId,
      name: 'tp-bridge',
      kind: 'docker',
      cidr: '203.0.113.0/28',
    })
    expect(createNetwork.mock.calls[0]?.[0]).toEqual({
      organizationId: orgId,
      name: 'tp-bridge',
      kind: 'docker',
      cidr: '203.0.113.0/28',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useUpdateNetwork patches network metadata', async () => {
    updateNetwork.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateNetwork(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      networkId,
      body: { name: 'Compose external' },
    })
    expect(updateNetwork).toHaveBeenCalledWith(networkId, {
      name: 'Compose external',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useDeleteNetwork removes a network', async () => {
    deleteNetwork.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteNetwork(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run(networkId)
    expect(deleteNetwork.mock.calls[0]?.[0]).toBe(networkId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })
})
