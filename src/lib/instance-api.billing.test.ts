import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORG_ID_HEADER, setActiveOrganizationId } from '@/lib/org-context'
import {
  changeBillingSeats,
  createBillingCheckout,
  createBillingPortalSession,
  downgradeBillingLicense,
  fetchBillingCatalog,
  fetchBillingSubscription,
  previewBillingChange,
  upgradeBillingLicense,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  const headers = (init?.headers ?? {}) as Record<string, string>
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
  return { url, method: init?.method ?? 'GET', headers, body }
}

describe('instance-api billing wrappers', () => {
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

  it('fetchBillingCatalog reads the catalogue under the org header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tiers: [{ id: 't1', label: 'S1' }] }))
    await expect(fetchBillingCatalog()).resolves.toEqual({ tiers: [{ id: 't1', label: 'S1' }] })
    const req = lastRequest(fetchMock)
    expect(req.url).toContain('/api/client/v1/billing/catalog')
    expect(req.method).toBe('GET')
    expect(req.headers[ORG_ID_HEADER]).toBe('org-1')
  })

  it('fetchBillingSubscription returns the projection verbatim', async () => {
    const summary = { payer: null, subscription: null, tiers: [], pendingChanges: [] }
    fetchMock.mockResolvedValueOnce(jsonResponse(summary))
    await expect(fetchBillingSubscription()).resolves.toEqual(summary)
    expect(lastRequest(fetchMock).url).toContain('/api/client/v1/billing/subscription')
  })

  it('surfaces billing_not_configured from a 503 in the error message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'billing_not_configured' }, 503))
    await expect(fetchBillingSubscription()).rejects.toThrow(/billing_not_configured/)
  })

  it('createBillingCheckout posts the tier and quantity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: 'https://pay.example/s', sessionId: 'cs_1' }))
    await expect(createBillingCheckout({ tierId: 't1', quantity: 2 })).resolves.toEqual({
      url: 'https://pay.example/s',
      sessionId: 'cs_1',
    })
    const req = lastRequest(fetchMock)
    expect(req.url).toContain('/api/client/v1/billing/checkout')
    expect(req.method).toBe('POST')
    expect(req.body).toEqual({ tierId: 't1', quantity: 2 })
  })

  it('createBillingPortalSession posts an empty object body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: 'https://portal.example/p' }))
    await expect(createBillingPortalSession()).resolves.toEqual({ url: 'https://portal.example/p' })
    const req = lastRequest(fetchMock)
    expect(req.url).toContain('/api/client/v1/billing/portal')
    expect(req.method).toBe('POST')
    expect(req.body).toEqual({})
  })

  it('previewBillingChange forwards both request shapes untouched', async () => {
    // A fresh Response per call — a body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ prorationDate: 7, currency: 'usd', subtotal: 1, tax: 0, total: 1, amountDue: 1, lines: [] })
      )
    )
    await previewBillingChange({ licenseId: 'lic-1', targetTierId: 't2' })
    expect(lastRequest(fetchMock).body).toEqual({ licenseId: 'lic-1', targetTierId: 't2' })
    await previewBillingChange({ tierId: 't1', delta: -1 })
    expect(lastRequest(fetchMock).body).toEqual({ tierId: 't1', delta: -1 })
    expect(lastRequest(fetchMock).url).toContain('/api/client/v1/billing/preview')
  })

  it.each([
    {
      name: 'changeBillingSeats',
      call: () => changeBillingSeats({ tierId: 't1', delta: 1, prorationDate: 9 }),
      path: '/billing/seats',
      body: { tierId: 't1', delta: 1, prorationDate: 9 },
    },
    {
      name: 'upgradeBillingLicense',
      call: () => upgradeBillingLicense({ licenseId: 'lic-1', targetTierId: 't2', prorationDate: 9 }),
      path: '/billing/upgrade',
      body: { licenseId: 'lic-1', targetTierId: 't2', prorationDate: 9 },
    },
    {
      name: 'downgradeBillingLicense',
      call: () => downgradeBillingLicense({ licenseId: 'lic-1', targetTierId: 't1' }),
      path: '/billing/downgrade',
      body: { licenseId: 'lic-1', targetTierId: 't1' },
    },
  ])('$name posts to $path and returns the mutation outcome', async ({ call, path, body }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, pending: true, intentId: 'i-1' }))
    await expect(call()).resolves.toEqual({ ok: true, pending: true, intentId: 'i-1' })
    const req = lastRequest(fetchMock)
    expect(req.url).toContain(`/api/client/v1${path}`)
    expect(req.method).toBe('POST')
    expect(req.body).toEqual(body)
    expect(req.headers[ORG_ID_HEADER]).toBe('org-1')
  })

  it('keeps the conflict code in the thrown message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'subscription_past_due', graceExpiresAt: null }, 409))
    await expect(upgradeBillingLicense({ licenseId: 'lic-1', targetTierId: 't2' })).rejects.toThrow(
      /subscription_past_due/
    )
  })
})
