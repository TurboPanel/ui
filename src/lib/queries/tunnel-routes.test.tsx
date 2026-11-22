// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useAddTunnelHostname,
  useCreateTunnel,
  useDeleteTunnel,
  useExistingOriginCertificates,
  useOriginCertificates,
  useRemoveTunnelHostname,
  useSetServerTunnelCarrying,
  useSetTunnelHostnameReach,
  useTunnelHostnames,
  useTunnels,
  useUpdateTunnelPlacement,
} from '@/lib/queries/tunnel-routes'

const api = vi.hoisted(() => ({
  fetchTunnels: vi.fn(),
  createTunnel: vi.fn(),
  updateTunnelPlacement: vi.fn(),
  deleteTunnel: vi.fn(),
  fetchTunnelHostnames: vi.fn(),
  addTunnelHostname: vi.fn(),
  removeTunnelHostname: vi.fn(),
  setServerTunnelCarrying: vi.fn(),
  setTunnelHostnameReach: vi.fn(),
  fetchOriginCertificates: vi.fn(),
  fetchExistingOriginCertificates: vi.fn(),
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

describe('tunnel queries', () => {
  it('loads the tunnels for the org', async () => {
    api.fetchTunnels.mockResolvedValueOnce({ tunnels: [] })
    const { result } = renderHook(() => useTunnels(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchTunnels).toHaveBeenCalledWith(orgId)
  })

  it('stays idle when disabled or without an org', () => {
    const off = renderHook(() => useTunnels(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    const none = renderHook(() => useTunnels(''), { wrapper: createWrapper() })
    expect(off.result.current.fetchStatus).toBe('idle')
    expect(none.result.current.fetchStatus).toBe('idle')
    expect(api.fetchTunnels).not.toHaveBeenCalled()
  })

  it('reads a refusal as an empty list and passes other failures through', async () => {
    api.fetchTunnels.mockRejectedValueOnce(new Error('/x failed: HTTP 403: forbidden'))
    const refused = renderHook(() => useTunnels(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(refused.result.current.isSuccess).toBe(true))
    expect(refused.result.current.data).toEqual({ tunnels: [], forbidden: true })

    api.fetchTunnels.mockRejectedValueOnce(new Error('boom'))
    const broken = renderHook(() => useTunnels(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(broken.result.current.isError).toBe(true))
  })

  it('stops refreshing the list after a refusal and keeps the half-minute pace otherwise', async () => {
    const interval = (client: ReturnType<typeof createAppQueryClient>) => {
      const query = client.getQueryCache().find({ queryKey: queryKeys.org(orgId).tunnels })!
      const option = (query.observers[0]?.options as { refetchInterval?: unknown }).refetchInterval
      return typeof option === 'function' ? option(query) : option
    }
    api.fetchTunnels.mockRejectedValueOnce(new Error('/x failed: HTTP 403: forbidden'))
    const refusedClient = createAppQueryClient()
    const refused = renderHook(() => useTunnels(orgId), { wrapper: createWrapper(refusedClient) })
    await waitFor(() => expect(refused.result.current.isSuccess).toBe(true))
    expect(interval(refusedClient)).toBe(false)

    api.fetchTunnels.mockResolvedValueOnce({ tunnels: [] })
    const okClient = createAppQueryClient()
    const ok = renderHook(() => useTunnels(orgId), { wrapper: createWrapper(okClient) })
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true))
    expect(interval(okClient)).toBe(30_000)
  })

  it('loads one tunnel’s hostnames only when asked', async () => {
    api.fetchTunnelHostnames.mockResolvedValueOnce({ hostnames: [] })
    const { result } = renderHook(() => useTunnelHostnames(orgId, 't1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchTunnelHostnames).toHaveBeenCalledWith(orgId, 't1')
    const idle = renderHook(() => useTunnelHostnames(orgId, ''), { wrapper: createWrapper() })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('every write refreshes the tunnels', async () => {
    const client = createAppQueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)
    api.createTunnel.mockResolvedValue({ tunnel: {} })
    api.updateTunnelPlacement.mockResolvedValue({ tunnel: {} })
    api.deleteTunnel.mockResolvedValue({ ok: true })
    api.addTunnelHostname.mockResolvedValue({ hostname: {} })
    api.removeTunnelHostname.mockResolvedValue({ ok: true })

    const create = renderHook(() => useCreateTunnel(orgId), { wrapper })
    const update = renderHook(() => useUpdateTunnelPlacement(orgId, 't1'), { wrapper })
    const remove = renderHook(() => useDeleteTunnel(orgId), { wrapper })
    const add = renderHook(() => useAddTunnelHostname(orgId, 't1'), { wrapper })
    const drop = renderHook(() => useRemoveTunnelHostname(orgId, 't1'), { wrapper })

    await act(async () => {
      await create.result.current.run({
        carrierId: 'c1',
        name: 'main',
        placement: 'one',
        serverIds: ['s1'],
      })
      await update.result.current.run({ placement: 'chosen', serverIds: ['s1', 's2'] })
      await remove.result.current.run('t1')
      await add.result.current.run({ hostname: 'app.example.com' })
      await drop.result.current.run('h1')
    })

    expect(api.createTunnel).toHaveBeenCalledWith(orgId, {
      carrierId: 'c1',
      name: 'main',
      placement: 'one',
      serverIds: ['s1'],
    })
    expect(api.updateTunnelPlacement).toHaveBeenCalledWith(orgId, 't1', {
      placement: 'chosen',
      serverIds: ['s1', 's2'],
    })
    expect(api.deleteTunnel).toHaveBeenCalledWith(orgId, 't1')
    expect(api.addTunnelHostname).toHaveBeenCalledWith(orgId, 't1', {
      hostname: 'app.example.com',
    })
    expect(api.removeTunnelHostname).toHaveBeenCalledWith(orgId, 't1', 'h1')
    // Adding a name also refreshes the sites, whose certificate options follow the tunnels.
    expect(spy).toHaveBeenCalledTimes(6)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).tunnels })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).hostings.all })
  })

  it('changing a server also refreshes the server list', async () => {
    const client = createAppQueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    api.setServerTunnelCarrying.mockResolvedValue({ serverId: 's1', carry: false })
    const { result } = renderHook(() => useSetServerTunnelCarrying(orgId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.run({ serverId: 's1', carry: false })
    })
    expect(api.setServerTunnelCarrying).toHaveBeenCalledWith(orgId, 's1', false)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).servers.list })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).tunnels })
  })

  it('changing how a name is reached refreshes the names and the tunnels', async () => {
    const client = createAppQueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    api.setTunnelHostnameReach.mockResolvedValue({
      hostname: {},
      certificateChangedNames: [],
      needsDeploy: false,
    })
    const { result } = renderHook(() => useSetTunnelHostnameReach(orgId, 't1'), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.run({ doorwayId: 'h1', isLocalOnly: false })
    })
    expect(api.setTunnelHostnameReach).toHaveBeenCalledWith(orgId, 't1', 'h1', false)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).tunnelHostnames('t1') })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).tunnels })
  })

  it('loads the origin certificates of an account, reads a refusal as an empty list, and stays idle without ids', async () => {
    api.fetchOriginCertificates.mockResolvedValueOnce({ originCertificates: [{ id: 'tls1' }] })
    const ok = renderHook(() => useOriginCertificates(orgId, 'c1'), { wrapper: createWrapper() })
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true))
    expect(api.fetchOriginCertificates).toHaveBeenCalledWith(orgId, 'c1')
    expect(ok.result.current.data).toEqual({ originCertificates: [{ id: 'tls1' }] })

    api.fetchOriginCertificates.mockRejectedValueOnce(new Error('/x failed: HTTP 403: forbidden'))
    const refused = renderHook(() => useOriginCertificates(orgId, 'c1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(refused.result.current.isSuccess).toBe(true))
    expect(refused.result.current.data).toEqual({ originCertificates: [] })

    api.fetchOriginCertificates.mockRejectedValueOnce(new Error('boom'))
    const broken = renderHook(() => useOriginCertificates(orgId, 'c1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(broken.result.current.isError).toBe(true))

    const idle = renderHook(() => useOriginCertificates(orgId, ''), { wrapper: createWrapper() })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('looks a zone up only once a zone is given', async () => {
    api.fetchExistingOriginCertificates.mockResolvedValueOnce({
      zone: 'example.com',
      certificates: [],
    })
    const none = renderHook(() => useExistingOriginCertificates(orgId, 'c1', ''), {
      wrapper: createWrapper(),
    })
    expect(none.result.current.fetchStatus).toBe('idle')
    expect(api.fetchExistingOriginCertificates).not.toHaveBeenCalled()
    const found = renderHook(() => useExistingOriginCertificates(orgId, 'c1', 'example.com'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(found.result.current.isSuccess).toBe(true))
    expect(api.fetchExistingOriginCertificates).toHaveBeenCalledWith(orgId, 'c1', 'example.com')
  })
})
