import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminTier,
  deactivateAdminTier,
  fetchAdminTierProducts,
  fetchAdminTiers,
  patchAdminTier,
  verifyAdminTier,
  verifyAllAdminTiers,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
  return { url, method: init?.method ?? 'GET', body }
}

describe('instance-api admin tier wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchAdminTiers reads the rows and the ladder beside them', async () => {
    const payload = {
      tiers: [{ id: 't3', label: 'S3', rank: 3 }],
      ladder: [{ label: 'S3', rank: 3, tierId: 't3' }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(fetchAdminTiers()).resolves.toEqual(payload)
    const req = lastRequest(fetchMock)
    expect(req.url).toContain('/api/admin/v1/tiers')
    expect(req.method).toBe('GET')
  })

  it('fetchAdminTierProducts reads the provider catalogue the dropdown renders', async () => {
    const payload = {
      provider: 'stripe',
      products: [
        {
          id: 'prod_s3',
          name: 'S3',
          active: true,
          livemode: false,
          suggestedLabel: 'S3',
          defaultPrice: { id: 'price_s3', unitAmount: 1000, currency: 'usd' },
          verification: { ok: true, failures: [] },
          tierId: null,
        },
      ],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    await expect(fetchAdminTierProducts()).resolves.toEqual(payload)
    expect(lastRequest(fetchMock).url).toContain('/api/admin/v1/tiers/products')
  })

  it('surfaces product_lookup_failed when the provider cannot be listed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'product_lookup_failed' }, 502))
    await expect(fetchAdminTierProducts()).rejects.toThrow(/product_lookup_failed/)
  })

  it('createAdminTier posts the label and the product it binds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tier: { id: 't3', label: 'S3' }, verification: { ok: true, failures: [] } }, 201)
    )
    await createAdminTier({ label: 'S3', providerProductId: 'prod_s3' })
    const req = lastRequest(fetchMock)
    expect(req.method).toBe('POST')
    expect(req.body).toEqual({ label: 'S3', providerProductId: 'prod_s3' })
  })

  it('surfaces a refused product verification with its code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'product_verification_failed',
          message: 'tax_behavior is unspecified; set it to inclusive or exclusive on the price',
        },
        400
      )
    )
    await expect(createAdminTier({ label: 'S3', providerProductId: 'prod_s3' })).rejects.toThrow(
      /product_verification_failed/
    )
  })

  it('patchAdminTier sends only the fields that moved, under the encoded id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tier: { id: 't 3' }, verification: null }))
    await patchAdminTier('t 3', { isActive: false })
    const req = lastRequest(fetchMock)
    expect(req.method).toBe('PATCH')
    expect(req.url).toContain('/api/admin/v1/tiers/t%203')
    expect(req.body).toEqual({ isActive: false })
  })

  it('deactivateAdminTier retires a row and never deletes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tier: { id: 't3', isActive: false } }))
    await expect(deactivateAdminTier('t3')).resolves.toEqual({ tier: { id: 't3', isActive: false } })
    const req = lastRequest(fetchMock)
    expect(req.method).toBe('POST')
    expect(req.url).toContain('/api/admin/v1/tiers/t3/deactivate')
  })

  it('verifyAdminTier re-checks one row and returns the refreshed row beside the result', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ verification: { ok: true, failures: [] }, tier: { id: 't3', priceCents: 1000 } })
    )
    await expect(verifyAdminTier('t3')).resolves.toEqual({
      verification: { ok: true, failures: [] },
      tier: { id: 't3', priceCents: 1000 },
    })
    const req = lastRequest(fetchMock)
    expect(req.method).toBe('POST')
    expect(req.url).toContain('/api/admin/v1/tiers/t3/verify')
  })

  it('verifyAdminTier surfaces tier_has_no_product for the negotiated row', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'tier_has_no_product' }, 400))
    await expect(verifyAdminTier('tx')).rejects.toThrow(/tier_has_no_product/)
  })

  it('verifyAllAdminTiers checks every priced row in one call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 't3', label: 'S3', ok: true, failures: [] }] }))
    await expect(verifyAllAdminTiers()).resolves.toEqual({
      results: [{ id: 't3', label: 'S3', ok: true, failures: [] }],
    })
    const req = lastRequest(fetchMock)
    expect(req.method).toBe('POST')
    expect(req.url).toMatch(/\/api\/admin\/v1\/tiers\/verify$/)
  })
})
