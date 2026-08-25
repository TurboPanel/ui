import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  DATACENTER_HAS_MEMBERS_ERROR,
  DATACENTER_HAS_NETWORKS_ERROR,
  acceptInvitation,
  addDatacenterMembers,
  applyPublicUrls,
  applyReencryptSecrets,
  createAccessGrant,
  createDatacenter,
  createDatacenterSubnet,
  createIp,
  createNetwork,
  deleteDatacenter,
  deleteDatacenterSubnet,
  deleteNetwork,
  fetchIp,
  fetchIps,
  fetchNetworks,
  fetchPublicUrls,
  fetchServerCell,
  fetchServerStatus,
  fetchServersStatus,
  removeDatacenterMember,
  revokeAccessGrant,
  savePublicUrls,
  updateDatacenter,
  updateDatacenterSubnet,
  updateIp,
  updateNetwork,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function requestUrl(call: unknown): string {
  if (!Array.isArray(call) || typeof call[0] !== 'string') {
    throw new TypeError('expected fetch call with string URL')
  }
  return call[0]
}

function requestInit(call: unknown): RequestInit {
  if (!Array.isArray(call) || call[1] === undefined) {
    throw new TypeError('expected fetch call with RequestInit')
  }
  return call[1] as RequestInit
}

function requestBody(call: unknown): unknown {
  const init = requestInit(call)
  if (init.body === undefined || init.body === null) {
    return undefined
  }
  return JSON.parse(String(init.body))
}

describe('instance-api topology fetch wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  it('createDatacenter posts members and returns the new id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'dc-1' }))
    const body = {
      name: 'Lab',
      members: [{ serverId: 'srv-1', address: '203.0.113.10' }],
    }
    await expect(createDatacenter(body)).resolves.toEqual({ ok: true, id: 'dc-1' })
    const call = fetchMock.mock.calls[0]
    expect(requestUrl(call)).toContain('/api/client/v1/datacenters')
    expect(requestInit(call).method).toBe('POST')
    expect(requestBody(call)).toEqual(body)
  })

  it('addDatacenterMembers and removeDatacenterMember hit member routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      addDatacenterMembers('dc-1', [
        { serverId: 'srv-2', address: '203.0.113.20' },
      ]),
    ).resolves.toEqual({ ok: true })
    const addCall = fetchMock.mock.calls[0]
    expect(requestUrl(addCall)).toContain('/api/client/v1/datacenters/dc-1/members')
    expect(requestInit(addCall).method).toBe('POST')
    expect(requestBody(addCall)).toEqual({
      members: [{ serverId: 'srv-2', address: '203.0.113.20' }],
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(removeDatacenterMember('dc-1', 'srv-2')).resolves.toEqual({
      ok: true,
    })
    const removeCall = fetchMock.mock.calls[1]
    expect(requestUrl(removeCall)).toContain(
      '/api/client/v1/datacenters/dc-1/members/srv-2',
    )
    expect(requestInit(removeCall).method).toBe('DELETE')
  })

  it('datacenter subnet helpers create, update, and delete', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'net-1' }))
    await expect(
      createDatacenterSubnet('dc-1', {
        cidr: '203.0.113.0/24',
        name: 'lab-v4',
      }),
    ).resolves.toEqual({ ok: true, id: 'net-1' })
    const createCall = fetchMock.mock.calls[0]
    expect(requestUrl(createCall)).toContain(
      '/api/client/v1/datacenters/dc-1/subnets',
    )
    expect(requestInit(createCall).method).toBe('POST')
    expect(requestBody(createCall)).toEqual({
      cidr: '203.0.113.0/24',
      name: 'lab-v4',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateDatacenterSubnet('dc-1', 'net-1', { description: 'TEST-NET-3' }),
    ).resolves.toEqual({ ok: true })
    const updateCall = fetchMock.mock.calls[1]
    expect(requestUrl(updateCall)).toContain(
      '/api/client/v1/datacenters/dc-1/subnets/net-1',
    )
    expect(requestInit(updateCall).method).toBe('PATCH')
    expect(requestBody(updateCall)).toEqual({ description: 'TEST-NET-3' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteDatacenterSubnet('dc-1', 'net-1')).resolves.toEqual({
      ok: true,
    })
    const deleteCall = fetchMock.mock.calls[2]
    expect(requestUrl(deleteCall)).toContain(
      '/api/client/v1/datacenters/dc-1/subnets/net-1',
    )
    expect(requestInit(deleteCall).method).toBe('DELETE')
  })

  it('updateDatacenter patches options and deleteDatacenter surfaces 409 codes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateDatacenter('dc-1', {
        name: 'Lab DC',
        options: { addressPreference: 'ipv4' },
      }),
    ).resolves.toEqual({ ok: true })
    const updateCall = fetchMock.mock.calls[0]
    expect(requestUrl(updateCall)).toContain('/api/client/v1/datacenters/dc-1')
    expect(requestInit(updateCall).method).toBe('PATCH')
    expect(requestBody(updateCall)).toEqual({
      name: 'Lab DC',
      options: { addressPreference: 'ipv4' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteDatacenter('dc-1')).resolves.toEqual({ ok: true })
    expect(requestInit(fetchMock.mock.calls[1]).method).toBe('DELETE')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: DATACENTER_HAS_MEMBERS_ERROR }, 409),
    )
    await expect(deleteDatacenter('dc-2')).rejects.toThrow(
      DATACENTER_HAS_MEMBERS_ERROR,
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: DATACENTER_HAS_NETWORKS_ERROR }, 409),
    )
    await expect(deleteDatacenter('dc-3')).rejects.toThrow(
      DATACENTER_HAS_NETWORKS_ERROR,
    )
  })

  it('fetchIps builds filter query strings and fetchIp loads one row', async () => {
    const ips = [
      {
        id: 'ip-1',
        organizationId: 'org-1',
        datacenterId: 'dc-1',
        networkId: 'net-1',
        serverId: 'srv-1',
        address: '203.0.113.10',
        version: 4,
        allocation: 'dedicated',
        scope: 'datacenter',
        description: null,
        metadata: null,
        options: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    fetchMock.mockResolvedValueOnce(jsonResponse({ ips }))
    await expect(fetchIps()).resolves.toEqual({ ips })
    expect(requestUrl(fetchMock.mock.calls[0])).toMatch(/\/api\/client\/v1\/ips$/)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ips }))
    await expect(
      fetchIps({
        datacenterId: 'dc-1',
        serverId: 'srv-1',
        networkId: 'net-1',
        scope: 'datacenter',
        allocation: 'dedicated',
      }),
    ).resolves.toEqual({ ips })
    const filteredUrl = requestUrl(fetchMock.mock.calls[1])
    expect(filteredUrl).toContain('/api/client/v1/ips?')
    expect(filteredUrl).toContain('datacenterId=dc-1')
    expect(filteredUrl).toContain('serverId=srv-1')
    expect(filteredUrl).toContain('networkId=net-1')
    expect(filteredUrl).toContain('scope=datacenter')
    expect(filteredUrl).toContain('allocation=dedicated')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ip: ips[0] }))
    await expect(fetchIp('ip-1')).resolves.toEqual({ ip: ips[0] })
    expect(requestUrl(fetchMock.mock.calls[2])).toContain('/api/client/v1/ips/ip-1')
  })

  it('createIp and updateIp send address bodies without a client version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'ip-2' }))
    const createBody = {
      address: '203.0.113.30',
      allocation: 'shared' as const,
      scope: 'public' as const,
      description: 'edge',
      datacenterId: null,
      networkId: null,
      serverId: null,
    }
    await expect(createIp(createBody)).resolves.toEqual({ ok: true, id: 'ip-2' })
    const createCall = fetchMock.mock.calls[0]
    expect(requestUrl(createCall)).toContain('/api/client/v1/ips')
    expect(requestInit(createCall).method).toBe('POST')
    expect(requestBody(createCall)).toEqual(createBody)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateIp('ip-2', {
        description: 'edge vip',
        serverId: 'srv-1',
      }),
    ).resolves.toEqual({ ok: true })
    const updateCall = fetchMock.mock.calls[1]
    expect(requestUrl(updateCall)).toContain('/api/client/v1/ips/ip-2')
    expect(requestInit(updateCall).method).toBe('PATCH')
    expect(requestBody(updateCall)).toEqual({
      description: 'edge vip',
      serverId: 'srv-1',
    })
  })

  it('fetchNetworks filters and network CRUD hits /networks', async () => {
    const networks = [
      {
        id: 'net-docker-1',
        organizationId: 'org-1',
        datacenterId: null,
        serverId: 'srv-1',
        kind: 'docker',
        cidr: null,
        name: 'external',
        metadata: null,
        options: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    fetchMock.mockResolvedValueOnce(jsonResponse({ networks }))
    await expect(
      fetchNetworks({
        organizationId: 'org-1',
        datacenterId: 'dc-1',
        serverId: 'srv-1',
        kind: 'docker',
      }),
    ).resolves.toEqual({ networks })
    const listUrl = requestUrl(fetchMock.mock.calls[0])
    expect(listUrl).toContain('/api/client/v1/networks?')
    expect(listUrl).toContain('organizationId=org-1')
    expect(listUrl).toContain('datacenterId=dc-1')
    expect(listUrl).toContain('serverId=srv-1')
    expect(listUrl).toContain('kind=docker')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'net-2' }))
    const createBody = {
      organizationId: 'org-1',
      kind: 'datacenter' as const,
      datacenterId: 'dc-1',
      cidr: '203.0.113.0/24',
      name: 'lab',
    }
    await expect(createNetwork(createBody)).resolves.toEqual({
      ok: true,
      id: 'net-2',
    })
    const createCall = fetchMock.mock.calls[1]
    expect(requestUrl(createCall)).toContain('/api/client/v1/networks')
    expect(requestInit(createCall).method).toBe('POST')
    expect(requestBody(createCall)).toEqual(createBody)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateNetwork('net-2', { name: 'lab-renamed', cidr: null }),
    ).resolves.toEqual({ ok: true })
    const updateCall = fetchMock.mock.calls[2]
    expect(requestUrl(updateCall)).toContain('/api/client/v1/networks/net-2')
    expect(requestInit(updateCall).method).toBe('PATCH')
    expect(requestBody(updateCall)).toEqual({
      name: 'lab-renamed',
      cidr: null,
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteNetwork('net-2')).resolves.toEqual({ ok: true })
    const deleteCall = fetchMock.mock.calls[3]
    expect(requestUrl(deleteCall)).toContain('/api/client/v1/networks/net-2')
    expect(requestInit(deleteCall).method).toBe('DELETE')
  })

  it('access grant helpers create, revoke, and accept invitations', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, id: 'grant-1', created: true }),
    )
    const grantBody = {
      resourceId: 'res-1',
      subjectKind: 'team' as const,
      subjectId: 'team-1',
      effect: 'allow' as const,
      permissionKey: 'organization:manage' as const,
    }
    await expect(createAccessGrant(grantBody)).resolves.toEqual({
      ok: true,
      id: 'grant-1',
      created: true,
    })
    const createCall = fetchMock.mock.calls[0]
    expect(requestUrl(createCall)).toContain('/api/client/v1/access')
    expect(requestInit(createCall).method).toBe('POST')
    expect(requestBody(createCall)).toEqual(grantBody)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(revokeAccessGrant('grant-1')).resolves.toEqual({ ok: true })
    const revokeCall = fetchMock.mock.calls[1]
    expect(requestUrl(revokeCall)).toContain('/api/client/v1/access/grant-1')
    expect(requestInit(revokeCall).method).toBe('DELETE')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, organizationId: 'org-1' }),
    )
    await expect(acceptInvitation('inv-1')).resolves.toEqual({
      ok: true,
      organizationId: 'org-1',
    })
    const acceptCall = fetchMock.mock.calls[2]
    expect(requestUrl(acceptCall)).toContain(
      '/api/client/v1/invitations/inv-1/accept',
    )
    expect(requestInit(acceptCall).method).toBe('POST')
  })

  it('public URL admin helpers fetch, save, and apply with optional urls', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, urls: ['https://panel.example'] }),
    )
    await expect(fetchPublicUrls()).resolves.toEqual({
      ok: true,
      urls: ['https://panel.example'],
    })
    expect(requestUrl(fetchMock.mock.calls[0])).toContain(
      '/api/admin/v1/instance/public-urls',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        urls: ['https://panel.example', 'https://huey.lan:8443'],
        applied: false,
      }),
    )
    await expect(
      savePublicUrls(['https://panel.example', 'https://huey.lan:8443']),
    ).resolves.toEqual({
      ok: true,
      urls: ['https://panel.example', 'https://huey.lan:8443'],
      applied: false,
    })
    const saveCall = fetchMock.mock.calls[1]
    expect(requestInit(saveCall).method).toBe('PUT')
    expect(requestBody(saveCall)).toEqual({
      urls: ['https://panel.example', 'https://huey.lan:8443'],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, applied: true }),
    )
    await expect(applyPublicUrls()).resolves.toEqual({ ok: true, applied: true })
    const applyNoBody = fetchMock.mock.calls[2]
    expect(requestUrl(applyNoBody)).toContain(
      '/api/admin/v1/instance/public-urls/apply',
    )
    expect(requestInit(applyNoBody).method).toBe('POST')
    expect(requestInit(applyNoBody).body).toBeUndefined()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, applied: true }),
    )
    await expect(
      applyPublicUrls(['https://panel.example']),
    ).resolves.toEqual({ ok: true, applied: true })
    expect(requestBody(fetchMock.mock.calls[3])).toEqual({
      urls: ['https://panel.example'],
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'cert apply is not applicable on this runtime' },
        422,
      ),
    )
    await expect(applyPublicUrls(['https://panel.example'])).rejects.toThrow(
      'cert apply is not applicable on this runtime',
    )
  })

  it('applyReencryptSecrets posts cursor batches until completed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        scanned: 50,
        reencrypted: 10,
        skipped: 40,
        failed: 0,
        completed: false,
        cursor: { stage: 'tls', afterId: 'tls-10' },
      }),
    )
    await expect(
      applyReencryptSecrets({
        cursor: { stage: 'variables', afterId: 'var-9' },
        limit: 50,
      }),
    ).resolves.toEqual({
      ok: true,
      scanned: 50,
      reencrypted: 10,
      skipped: 40,
      failed: 0,
      completed: false,
      cursor: { stage: 'tls', afterId: 'tls-10' },
    })
    const firstCall = fetchMock.mock.calls[0]
    expect(requestUrl(firstCall)).toContain('/api/admin/v1/secrets/reencrypt')
    expect(requestInit(firstCall).method).toBe('POST')
    expect(requestBody(firstCall)).toEqual({
      cursor: { stage: 'variables', afterId: 'var-9' },
      limit: 50,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        scanned: 5,
        reencrypted: 5,
        skipped: 0,
        failed: 0,
        completed: true,
        cursor: null,
      }),
    )
    await expect(applyReencryptSecrets()).resolves.toEqual({
      ok: true,
      scanned: 5,
      reencrypted: 5,
      skipped: 0,
      failed: 0,
      completed: true,
      cursor: null,
    })
    expect(requestBody(fetchMock.mock.calls[1])).toEqual({})
  })

  it('server status helpers and fetchServerCell hit status and cell routes', async () => {
    const status = {
      serverId: 'srv-1',
      connected: true,
      daemonStatus: 'online' as const,
      connectedAt: '2026-01-01T00:00:00.000Z',
      statusChangedAt: '2026-01-01T00:00:00.000Z',
      hostname: 'huey',
      remoteAddress: '203.0.113.50',
      geo: null,
      colocatedWithInstance: false,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ servers: [status] }))
    await expect(fetchServersStatus()).resolves.toEqual({ servers: [status] })
    expect(requestUrl(fetchMock.mock.calls[0])).toContain(
      '/api/client/v1/servers/status',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse(status))
    await expect(fetchServerStatus('srv-1')).resolves.toEqual(status)
    expect(requestUrl(fetchMock.mock.calls[1])).toContain(
      '/api/client/v1/servers/srv-1/status',
    )

    const cell = {
      ok: true,
      snapshot: {
        serverId: 'srv-1',
        version: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
        connected: true,
        remoteAddress: '203.0.113.50',
        ips: [
          {
            address: '203.0.113.50',
            version: 4,
            scope: 'private',
          },
        ],
      },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(cell))
    await expect(fetchServerCell('srv-1')).resolves.toEqual(cell)
    expect(requestUrl(fetchMock.mock.calls[2])).toContain(
      '/api/client/v1/servers/srv-1/cell',
    )
  })
})
