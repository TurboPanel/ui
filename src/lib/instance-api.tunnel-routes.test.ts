import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  addTunnelHostname,
  createTunnel,
  deleteTunnel,
  fetchTunnelHostnames,
  fetchTunnels,
  removeTunnelHostname,
  setServerTunnelCarrying,
  updateTunnelPlacement,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api tunnel wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  function lastCall(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    return { url: String(url), init: (init ?? {}) as RequestInit }
  }

  it('lists tunnels', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tunnels: [] }))
    await expect(fetchTunnels('org-1')).resolves.toEqual({ tunnels: [] })
    expect(lastCall().url).toMatch(/\/organizations\/org-1\/tunnels$/)
  })

  it('creates a tunnel with the account, name and where it runs', async () => {
    await createTunnel('org-1', {
      carrierId: 'c1',
      name: 'main',
      placement: 'all',
      datacenterId: 'd1',
      exceptServerIds: ['s2'],
    })
    const { url, init } = lastCall()
    expect(url).toMatch(/\/organizations\/org-1\/tunnels$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      carrierId: 'c1',
      name: 'main',
      placement: 'all',
      datacenterId: 'd1',
      exceptServerIds: ['s2'],
    })
  })

  it('changes where a tunnel runs with a PUT', async () => {
    await updateTunnelPlacement('org-1', 't1', { placement: 'chosen', serverIds: ['s1'] })
    const { url, init } = lastCall()
    expect(url).toMatch(/\/tunnels\/t1\/placement$/)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ placement: 'chosen', serverIds: ['s1'] })
  })

  it('removes a tunnel', async () => {
    await deleteTunnel('org-1', 't1')
    expect(lastCall().url).toMatch(/\/tunnels\/t1$/)
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('keeps the code on a refusal so the screen can word it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'tunnel_in_use', message: 'This Tunnel still carries hostnames.' }, 409)
    )
    await expect(deleteTunnel('org-1', 't1')).rejects.toThrow(/HTTP 409: tunnel_in_use/)
  })

  it('lists, adds and removes hostnames', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hostnames: [] }))
    await expect(fetchTunnelHostnames('org-1', 't1')).resolves.toEqual({ hostnames: [] })
    expect(lastCall().url).toMatch(/\/tunnels\/t1\/hostnames$/)
    await addTunnelHostname('org-1', 't1', { hostname: 'app.example.com', isLocalOnly: true })
    expect(lastCall().init.method).toBe('POST')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      hostname: 'app.example.com',
      isLocalOnly: true,
    })
    await removeTunnelHostname('org-1', 't1', 'h1')
    expect(lastCall().url).toMatch(/\/tunnels\/t1\/hostnames\/h1$/)
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('marks a server as never running tunnels', async () => {
    await setServerTunnelCarrying('org-1', 's1', false)
    const { url, init } = lastCall()
    expect(url).toMatch(/\/organizations\/org-1\/servers\/s1\/tunnel-carrying$/)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ carry: false })
  })
})
