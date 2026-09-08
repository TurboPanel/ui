// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  BILLING_CATALOG_STALE_MS,
  CHECKOUT_CONFIRM_POLL_MS,
  useBillingCatalog,
  useBillingSubscription,
  useChangeBillingSeats,
  useCreateBillingCheckout,
  useCreateBillingPortalSession,
  useDowngradeBillingLicense,
  usePreviewBillingChange,
  useUpgradeBillingLicense,
} from '@/lib/queries/billing'

const {
  fetchBillingCatalog,
  fetchBillingSubscription,
  createBillingCheckout,
  createBillingPortalSession,
  previewBillingChange,
  changeBillingSeats,
  upgradeBillingLicense,
  downgradeBillingLicense,
} = vi.hoisted(() => ({
  fetchBillingCatalog: vi.fn(),
  fetchBillingSubscription: vi.fn(),
  createBillingCheckout: vi.fn(),
  createBillingPortalSession: vi.fn(),
  previewBillingChange: vi.fn(),
  changeBillingSeats: vi.fn(),
  upgradeBillingLicense: vi.fn(),
  downgradeBillingLicense: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchBillingCatalog,
    fetchBillingSubscription,
    createBillingCheckout,
    createBillingPortalSession,
    previewBillingChange,
    changeBillingSeats,
    upgradeBillingLicense,
    downgradeBillingLicense,
  }
})

const orgId = 'org-1'

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('billing queries', () => {
  it('useBillingCatalog reads the catalogue with a long stale time', async () => {
    fetchBillingCatalog.mockResolvedValueOnce({ tiers: [] })
    const client = createAppQueryClient()
    const { result } = renderHook(() => useBillingCatalog(orgId), { wrapper: createWrapper(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchBillingCatalog).toHaveBeenCalledTimes(1)
    const query = client.getQueryCache().find({ queryKey: queryKeys.org(orgId).billing.catalog })
    expect((query?.options as { staleTime?: number } | undefined)?.staleTime).toBe(BILLING_CATALOG_STALE_MS)
  })

  it('useBillingSubscription polls only when the caller asks (checkout confirmation)', async () => {
    fetchBillingSubscription.mockResolvedValueOnce({
      payer: null,
      subscription: null,
      tiers: [],
      pendingChanges: [],
    })
    const client = createAppQueryClient()
    const { result } = renderHook(
      () => useBillingSubscription(orgId, { refetchInterval: CHECKOUT_CONFIRM_POLL_MS }),
      { wrapper: createWrapper(client) }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const query = client.getQueryCache().find({
      queryKey: queryKeys.org(orgId).billing.subscription,
    })
    expect((query?.options as { refetchInterval?: unknown } | undefined)?.refetchInterval).toBe(
      CHECKOUT_CONFIRM_POLL_MS
    )
  })

  it('useBillingSubscription never polls by default', async () => {
    fetchBillingSubscription.mockResolvedValueOnce({
      payer: null,
      subscription: null,
      tiers: [],
      pendingChanges: [],
    })
    const client = createAppQueryClient()
    const { result } = renderHook(() => useBillingSubscription(orgId), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const query = client.getQueryCache().find({
      queryKey: queryKeys.org(orgId).billing.subscription,
    })
    expect((query?.options as { refetchInterval?: unknown } | undefined)?.refetchInterval).toBe(false)
  })

  it('stays disabled without an org id or when the caller opts out', () => {
    const { result } = renderHook(() => useBillingSubscription('', { enabled: true }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    const { result: catalog } = renderHook(() => useBillingCatalog(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(catalog.current.fetchStatus).toBe('idle')
    expect(fetchBillingSubscription).not.toHaveBeenCalled()
    expect(fetchBillingCatalog).not.toHaveBeenCalled()
  })

  it('useCreateBillingCheckout returns the hosted URL and refreshes the projection', async () => {
    createBillingCheckout.mockResolvedValueOnce({ url: 'https://checkout.example/s', sessionId: 'cs_1' })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateBillingCheckout(orgId), {
      wrapper: createWrapper(client),
    })
    const outcome = await result.current.run({ tierId: 'tier-1', quantity: 2 })
    expect(outcome).toEqual({ ok: true, value: { url: 'https://checkout.example/s', sessionId: 'cs_1' } })
    expect(createBillingCheckout).toHaveBeenCalledWith({ tierId: 'tier-1', quantity: 2 })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).billing.subscription,
    })
  })

  it('useCreateBillingPortalSession surfaces the error shape on failure', async () => {
    createBillingPortalSession.mockRejectedValueOnce(new Error('HTTP 404 — Not found'))
    const { result } = renderHook(() => useCreateBillingPortalSession(), { wrapper: createWrapper() })
    const outcome = await result.current.run()
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('404')
  })

  it('usePreviewBillingChange forwards either request shape without invalidating', async () => {
    previewBillingChange.mockResolvedValue({
      prorationDate: 1,
      currency: 'usd',
      subtotal: 100,
      tax: 0,
      total: 100,
      amountDue: 100,
      lines: [],
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => usePreviewBillingChange(), { wrapper: createWrapper(client) })
    await result.current.run({ licenseId: 'lic-1', targetTierId: 'tier-2' })
    await result.current.run({ tierId: 'tier-1', delta: 1 })
    expect(previewBillingChange).toHaveBeenNthCalledWith(1, { licenseId: 'lic-1', targetTierId: 'tier-2' })
    expect(previewBillingChange).toHaveBeenNthCalledWith(2, { tierId: 'tier-1', delta: 1 })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  type MutationCase = {
    name: string
    /** `never` accepts every hook's own variables type; each `body` below matches its hook. */
    useHook: () => { run: (variables: never) => Promise<unknown> }
    mock: ReturnType<typeof vi.fn>
    body: Record<string, unknown>
  }

  const mutationCases: MutationCase[] = [
    {
      name: 'useChangeBillingSeats',
      useHook: () => useChangeBillingSeats(orgId),
      mock: changeBillingSeats,
      body: { tierId: 'tier-1', delta: 1, prorationDate: 5 },
    },
    {
      name: 'useUpgradeBillingLicense',
      useHook: () => useUpgradeBillingLicense(orgId),
      mock: upgradeBillingLicense,
      body: { licenseId: 'lic-1', targetTierId: 'tier-2', prorationDate: 5 },
    },
    {
      name: 'useDowngradeBillingLicense',
      useHook: () => useDowngradeBillingLicense(orgId),
      mock: downgradeBillingLicense,
      body: { licenseId: 'lic-1', targetTierId: 'tier-1' },
    },
  ]

  it.each(mutationCases)('$name invalidates the subscription and the servers list', async ({ useHook, mock, body }) => {
    mock.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(useHook, { wrapper: createWrapper(client) })
    const outcome = await result.current.run(body as never)
    expect(outcome).toEqual({ ok: true, value: { ok: true } })
    expect(mock).toHaveBeenCalledWith(body)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).billing.subscription,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).servers.list })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.licenses,
    })
  })
})
