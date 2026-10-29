// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCheckDnsCertificate,
  useDnsCertificates,
  useOrderDnsCertificate,
  useRetryDnsCertificate,
} from '@/lib/queries/dns-certificates'
import { createAppQueryClient } from '@/lib/query-client'

const api = vi.hoisted(() => ({
  fetchDnsCertificates: vi.fn(),
  orderDnsCertificate: vi.fn(),
  checkDnsCertificate: vi.fn(),
  retryDnsCertificate: vi.fn(),
  isForbiddenError: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const orgId = 'org-1'

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('certificate order queries', () => {
  it('loads the orders and polls quickly while one is pending', async () => {
    api.fetchDnsCertificates.mockResolvedValue({ certificates: [{ id: 'c1', status: 'pending' }] })
    const { result } = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchDnsCertificates).toHaveBeenCalledWith(orgId)
  })

  it('waits when idle and when disabled', async () => {
    api.fetchDnsCertificates.mockResolvedValue({ certificates: [] })
    const { result } = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    api.fetchDnsCertificates.mockClear()
    renderHook(() => useDnsCertificates(orgId, { enabled: false }), { wrapper: createWrapper() })
    expect(api.fetchDnsCertificates).not.toHaveBeenCalled()
  })

  it('reads a refusal as an empty list and passes other failures through', async () => {
    api.isForbiddenError.mockReturnValueOnce(true)
    api.fetchDnsCertificates.mockRejectedValueOnce(new Error('no'))
    const refused = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(refused.result.current.data).toEqual({ certificates: [] }))

    api.isForbiddenError.mockReturnValue(false)
    api.fetchDnsCertificates.mockRejectedValue(new Error('boom'))
    const failed = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(failed.result.current.isError).toBe(true))
  })

  it('orders, checks and retries, then refreshes the lists', async () => {
    api.orderDnsCertificate.mockResolvedValue({ certificate: { id: 'c1' }, reused: false })
    api.checkDnsCertificate.mockResolvedValue({ certificate: { id: 'c1' }, outcome: 'waiting' })
    api.retryDnsCertificate.mockResolvedValue({ certificate: { id: 'c1' } })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)

    const order = renderHook(() => useOrderDnsCertificate(orgId), { wrapper })
    await act(async () => {
      await order.result.current.mutateAsync({ carrierId: 'k1', names: ['example.com'] })
    })
    expect(api.orderDnsCertificate).toHaveBeenCalledWith(orgId, {
      carrierId: 'k1',
      names: ['example.com'],
    })
    expect(invalidate).toHaveBeenCalledTimes(2)

    const check = renderHook(() => useCheckDnsCertificate(orgId), { wrapper })
    await act(async () => {
      await check.result.current.mutateAsync('c1')
    })
    expect(api.checkDnsCertificate).toHaveBeenCalledWith(orgId, 'c1')

    const retry = renderHook(() => useRetryDnsCertificate(orgId), { wrapper })
    await act(async () => {
      await retry.result.current.mutateAsync('c1')
    })
    expect(api.retryDnsCertificate).toHaveBeenCalledWith(orgId, 'c1')
  })
})
