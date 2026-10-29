import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  checkDnsCertificate,
  fetchDnsCertificates,
  orderDnsCertificate,
  retryDnsCertificate,
} from './instance-api'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api certificate order wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the orders of an organization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ certificates: [] }))
    await expect(fetchDnsCertificates('org-1')).resolves.toEqual({ certificates: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/dns-certificates'
    )
  })

  it('orders, checks and retries by posting to the order paths', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ certificate: { id: 'c1' }, reused: false }))
    await orderDnsCertificate('org-1', { carrierId: 'k1', names: ['*.example.com'] })
    const orderInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(orderInit.method).toBe('POST')
    expect(JSON.parse(String(orderInit.body))).toEqual({
      carrierId: 'k1',
      names: ['*.example.com'],
    })

    await checkDnsCertificate('org-1', 'c1')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/dns-certificates/c1/check'
    )
    await retryDnsCertificate('org-1', 'c1')
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/dns-certificates/c1/retry'
    )
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('POST')
  })
})
