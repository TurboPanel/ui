// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import {
  useAdminTierProducts,
  useAdminTiers,
  useCreateAdminTier,
  useDeactivateAdminTier,
  usePatchAdminTier,
  useVerifyAdminTier,
  useVerifyAllAdminTiers,
} from './admin'

const {
  fetchAdminTiers,
  fetchAdminTierProducts,
  createAdminTier,
  patchAdminTier,
  deactivateAdminTier,
  verifyAdminTier,
  verifyAllAdminTiers,
} = vi.hoisted(() => ({
  fetchAdminTiers: vi.fn(),
  fetchAdminTierProducts: vi.fn(),
  createAdminTier: vi.fn(),
  patchAdminTier: vi.fn(),
  deactivateAdminTier: vi.fn(),
  verifyAdminTier: vi.fn(),
  verifyAllAdminTiers: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return {
    ...actual,
    fetchAdminTiers,
    fetchAdminTierProducts,
    createAdminTier,
    patchAdminTier,
    deactivateAdminTier,
    verifyAdminTier,
    verifyAllAdminTiers,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const TIERS = { tiers: [{ id: 't3', label: 'S3' }], ladder: [{ label: 'S3', tierId: 't3' }] }
const PRODUCTS = { provider: 'stripe', products: [{ id: 'prod_s3', tierId: null }] }

/** The two caches a binding or a verify must invalidate. */
function seedCatalogue(client: ReturnType<typeof createAppQueryClient>) {
  client.setQueryData(queryKeys.admin.tiers, TIERS)
  client.setQueryData(queryKeys.admin.tierProducts, PRODUCTS)
}

function staleOf(client: ReturnType<typeof createAppQueryClient>, key: readonly unknown[]) {
  return client.getQueryCache().find({ queryKey: key })?.state.isInvalidated ?? false
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('admin tier query hooks', () => {
  it('useAdminTiers loads the rows and the ladder', async () => {
    fetchAdminTiers.mockResolvedValueOnce(TIERS)
    const { result } = renderHook(() => useAdminTiers(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(TIERS)
  })

  it('useAdminTiers stays idle when the screen is not ready for it', () => {
    const { result } = renderHook(() => useAdminTiers({ enabled: false }), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchAdminTiers).not.toHaveBeenCalled()
  })

  it('useAdminTierProducts keeps the provider round trip out of every focus', async () => {
    fetchAdminTierProducts.mockResolvedValueOnce(PRODUCTS)
    const client = createAppQueryClient()
    const { result } = renderHook(() => useAdminTierProducts(), { wrapper: createWrapper(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const query = client.getQueryCache().find({ queryKey: queryKeys.admin.tierProducts })
    expect((query?.options as { staleTime?: number } | undefined)?.staleTime).toBe(60_000)
  })

  it('useAdminTierProducts does not retry a refused provider listing', async () => {
    fetchAdminTierProducts.mockRejectedValue(new Error('HTTP 502: product_lookup_failed'))
    const { result } = renderHook(() => useAdminTierProducts(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchAdminTierProducts).toHaveBeenCalledTimes(1)
  })

  it('useCreateAdminTier binds a label and invalidates both catalogue reads', async () => {
    createAdminTier.mockResolvedValueOnce({ tier: { id: 't3' }, verification: { ok: true, failures: [] } })
    const client = createAppQueryClient()
    seedCatalogue(client)
    const { result } = renderHook(() => useCreateAdminTier(), { wrapper: createWrapper(client) })
    await result.current.run({ label: 'S3', providerProductId: 'prod_s3' })
    expect(createAdminTier).toHaveBeenCalledWith({ label: 'S3', providerProductId: 'prod_s3' })
    expect(staleOf(client, queryKeys.admin.tiers)).toBe(true)
    // A binding moves `products[].tierId`, so the dropdown is stale too.
    expect(staleOf(client, queryKeys.admin.tierProducts)).toBe(true)
  })

  it('useCreateAdminTier reports a refused verification without throwing', async () => {
    createAdminTier.mockRejectedValueOnce(new Error('HTTP 400: product_verification_failed'))
    const { result } = renderHook(() => useCreateAdminTier(), { wrapper: createWrapper() })
    const outcome = await result.current.run({ label: 'S3', providerProductId: 'prod_s3' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toMatch(/product_verification_failed/)
  })

  it('usePatchAdminTier sends the id beside the patch and invalidates both reads', async () => {
    patchAdminTier.mockResolvedValueOnce({ tier: { id: 't3' }, verification: null })
    const client = createAppQueryClient()
    seedCatalogue(client)
    const { result } = renderHook(() => usePatchAdminTier(), { wrapper: createWrapper(client) })
    await result.current.run({ id: 't3', body: { providerProductId: 'prod_new' } })
    expect(patchAdminTier).toHaveBeenCalledWith('t3', { providerProductId: 'prod_new' })
    expect(staleOf(client, queryKeys.admin.tiers)).toBe(true)
    expect(staleOf(client, queryKeys.admin.tierProducts)).toBe(true)
  })

  it('useDeactivateAdminTier retires a row and re-reads only the rows', async () => {
    deactivateAdminTier.mockResolvedValueOnce({ tier: { id: 't3', isActive: false } })
    const client = createAppQueryClient()
    seedCatalogue(client)
    const { result } = renderHook(() => useDeactivateAdminTier(), { wrapper: createWrapper(client) })
    await result.current.run({ id: 't3' })
    expect(deactivateAdminTier).toHaveBeenCalledWith('t3')
    expect(staleOf(client, queryKeys.admin.tiers)).toBe(true)
    // Retiring changes no binding, so the product list still stands.
    expect(staleOf(client, queryKeys.admin.tierProducts)).toBe(false)
  })

  it('useVerifyAdminTier re-reads the rows, because verifying writes the cached price back', async () => {
    verifyAdminTier.mockResolvedValueOnce({ verification: { ok: true, failures: [] }, tier: { id: 't3' } })
    const client = createAppQueryClient()
    seedCatalogue(client)
    const { result } = renderHook(() => useVerifyAdminTier(), { wrapper: createWrapper(client) })
    await result.current.run('t3')
    expect(verifyAdminTier).toHaveBeenCalledWith('t3')
    expect(staleOf(client, queryKeys.admin.tiers)).toBe(true)
  })

  it('useVerifyAllAdminTiers checks every priced row and re-reads them', async () => {
    verifyAllAdminTiers.mockResolvedValueOnce({ results: [] })
    const client = createAppQueryClient()
    seedCatalogue(client)
    const { result } = renderHook(() => useVerifyAllAdminTiers(), { wrapper: createWrapper(client) })
    await result.current.run(undefined)
    expect(verifyAllAdminTiers).toHaveBeenCalledTimes(1)
    expect(staleOf(client, queryKeys.admin.tiers)).toBe(true)
  })
})
