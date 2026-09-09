import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORG_ID_HEADER, setActiveOrganizationId } from '@/lib/org-context'
import {
  BillingRefusalError,
  changeBillingSeats,
  createBillingCheckout,
  createBillingPortalSession,
  downgradeBillingTier,
  fetchBillingCatalog,
  fetchBillingSubscription,
  previewBillingChange,
  upgradeBillingTier,
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

async function refusalOf(promise: Promise<unknown>): Promise<BillingRefusalError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof BillingRefusalError) return err
    throw err
  }
  throw new TypeError('expected the call to be refused')
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
    const summary = {
      payer: null,
      subscription: null,
      tiers: [],
      licenses: { purchased: 0, releasing: 0, held: 0, bound: 0, available: 0 },
      servers: [],
      pendingChanges: [],
    }
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
    expect(req.headers[ORG_ID_HEADER]).toBe('org-1')
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
    await previewBillingChange({ fromTierId: 't1', toTierId: 't2' })
    expect(lastRequest(fetchMock).body).toEqual({ fromTierId: 't1', toTierId: 't2' })
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
      name: 'upgradeBillingTier',
      call: () => upgradeBillingTier({ fromTierId: 't1', toTierId: 't2', prorationDate: 9 }),
      path: '/billing/upgrade',
      body: { fromTierId: 't1', toTierId: 't2', prorationDate: 9 },
    },
    {
      name: 'downgradeBillingTier',
      call: () => downgradeBillingTier({ fromTierId: 't2', toTierId: 't1' }),
      path: '/billing/downgrade',
      body: { fromTierId: 't2', toTierId: 't1' },
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
    await expect(upgradeBillingTier({ fromTierId: 't1', toTierId: 't2' })).rejects.toThrow(
      /HTTP 409: subscription_past_due/
    )
  })

  it('exposes the refusal body so the screen can name the stranded server', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'servers_uncovered', serverId: 'srv-9', requiredTier: 'S5' }, 409)
    )
    const err = await refusalOf(changeBillingSeats({ tierId: 't1', delta: -1 }))
    expect(err.code).toBe('servers_uncovered')
    expect(err.status).toBe(409)
    expect(err.text('serverId')).toBe('srv-9')
    expect(err.text('requiredTier')).toBe('S5')
    expect(err.count('requiredTier')).toBeNull()
    expect(err.message).toContain('/billing/seats failed: HTTP 409: servers_uncovered')
  })

  it('reads numeric refusal fields and tolerates a body without a code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'licenses_in_use', purchasedAfter: 2, licensesHeld: 3 }, 409)
    )
    const err = await refusalOf(downgradeBillingTier({ fromTierId: 't2', toTierId: 't1' }))
    expect(err.count('purchasedAfter')).toBe(2)
    expect(err.count('licensesHeld')).toBe(3)
    expect(err.text('purchasedAfter')).toBeNull()

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'nope' }, 400))
    const bare = await refusalOf(previewBillingChange({ tierId: 't1', delta: 1 }))
    expect(bare.code).toBe('')
    expect(bare.message).toContain('HTTP 400')
  })

  it('falls back to a plain error for a non-JSON failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    const failure = changeBillingSeats({ tierId: 't1', delta: 1 })
    await expect(failure).rejects.toThrow('/api/client/v1/billing/seats failed: HTTP 502')
    await expect(failure).rejects.not.toBeInstanceOf(BillingRefusalError)
  })
})
