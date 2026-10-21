import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseServerTrafficNetwork, fetchServerTrafficMap } from './instance-api'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api server traffic wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchServerTrafficMap reads the traffic map for a server', async () => {
    const map = { ok: true, serverId: 'srv-1', nics: [], peers: [] }
    fetchMock.mockResolvedValueOnce(jsonResponse(map))
    await expect(fetchServerTrafficMap('srv-1')).resolves.toEqual(map)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/client/v1/servers/srv-1/traffic-map')
  })

  it('chooseServerTrafficNetwork posts the preferred flag', async () => {
    const changes = [{ datacenterId: 'dc-1', before: 20, after: 10 }]
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, changes }))
    await expect(chooseServerTrafficNetwork('dc-1')).resolves.toEqual({ ok: true, changes })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/client/v1/datacenters/dc-1/server-traffic')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ preferred: true })
  })
})
