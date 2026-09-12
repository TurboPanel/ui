import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  CIDR_OVERLAPS_FABRIC_ERROR,
  CidrCollisionError,
  createDatacenterSubnet,
  createNetwork,
  fetchOrganizationDockerNetworking,
  isHttpStatusError,
  updateNetwork,
  updateOrganizationDockerNetworking,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function requestInit(call: unknown): RequestInit {
  if (!Array.isArray(call) || call[1] === undefined) {
    throw new TypeError('expected fetch call with RequestInit')
  }
  return call[1] as RequestInit
}

describe('CIDR write helpers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId('org-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  it('createNetwork turns a collision 409 into CidrCollisionError with the conflicting range', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: CIDR_OVERLAPS_FABRIC_ERROR,
          cidr: '10.192.0.0/16',
          conflictingCidr: '10.192.0.0/12',
        },
        409,
      ),
    )
    const promise = createNetwork({
      organizationId: 'org-1',
      kind: 'reserved',
      cidr: '10.192.0.0/16',
    })
    await expect(promise).rejects.toBeInstanceOf(CidrCollisionError)
    const err = (await promise.catch((e: unknown) => e)) as CidrCollisionError
    expect(err.code).toBe(CIDR_OVERLAPS_FABRIC_ERROR)
    expect(err.status).toBe(409)
    expect(err.cidr).toBe('10.192.0.0/16')
    expect(err.conflictingCidr).toBe('10.192.0.0/12')
    expect(err.networkId).toBeNull()
    // The `HTTP 409: <code>` shape survives so `.includes(code)` callers keep working.
    expect(err.message).toContain(`HTTP 409: ${CIDR_OVERLAPS_FABRIC_ERROR}`)
    expect(isHttpStatusError(err, 409)).toBe(true)
    const init = requestInit(fetchMock.mock.calls[0])
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Turbopanel-Organization-Id']).toBe('org-1')
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId: 'org-1',
      kind: 'reserved',
      cidr: '10.192.0.0/16',
    })
  })

  it('updateNetwork keeps plain-Error semantics for a 400 code and for non-JSON bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'network_cidr_required' }, 400))
    await expect(updateNetwork('net-1', { cidr: null })).rejects.toThrow(
      /HTTP 400: network_cidr_required/,
    )
    fetchMock.mockResolvedValueOnce(new Response('gateway timeout', { status: 504 }))
    await expect(updateNetwork('net-1', { name: 'x' })).rejects.toThrow(/HTTP 504$/)
    const first = await updateNetwork('net-1', { cidr: null }).catch((e: unknown) => e)
    expect(first).not.toBeInstanceOf(CidrCollisionError)
  })

  it('createDatacenterSubnet resolves on success and types a subnet_overlaps collision', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'net-9' }))
    await expect(
      createDatacenterSubnet('dc-1', { cidr: '10.9.0.0/24' }),
    ).resolves.toEqual({ ok: true, id: 'net-9' })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'subnet_overlaps',
          cidr: '10.9.0.0/24',
          conflictingCidr: '10.9.0.0/16',
          datacenterId: 'dc-2',
        },
        409,
      ),
    )
    const err: unknown = await createDatacenterSubnet('dc-1', { cidr: '10.9.0.0/24' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(CidrCollisionError)
    expect((err as CidrCollisionError).datacenterId).toBe('dc-2')
  })

  it('docker-networking GET and PUT hit the organization route', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ addressPools: [], defaultBridgeCidr: null }),
    )
    await expect(fetchOrganizationDockerNetworking('org-1')).resolves.toEqual({
      addressPools: [],
      defaultBridgeCidr: null,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/client/v1/organizations/org-1/docker-networking',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        addressPools: [{ base: '10.200.0.0/16', size: 24 }],
        defaultBridgeCidr: '172.17.0.1/16',
      }),
    )
    await expect(
      updateOrganizationDockerNetworking('org-1', {
        addressPools: [{ base: '10.200.0.0/16', size: 24 }],
        defaultBridgeCidr: '172.17.0.1/16',
      }),
    ).resolves.toMatchObject({ ok: true })
    const put = requestInit(fetchMock.mock.calls[1])
    expect(put.method).toBe('PUT')
    expect(JSON.parse(String(put.body))).toEqual({
      addressPools: [{ base: '10.200.0.0/16', size: 24 }],
      defaultBridgeCidr: '172.17.0.1/16',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'cidr_overlaps_reserved',
          cidr: '10.8.0.0/16',
          conflictingCidr: '10.8.0.0/12',
          networkId: 'net-r',
        },
        409,
      ),
    )
    const err: unknown = await updateOrganizationDockerNetworking('org-1', {
      addressPools: [{ base: '10.8.0.0/16', size: 24 }],
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CidrCollisionError)
    expect((err as CidrCollisionError).networkId).toBe('net-r')
  })
})
