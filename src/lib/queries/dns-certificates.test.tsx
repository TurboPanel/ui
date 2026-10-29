// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORDER_NUDGE_CONCURRENCY,
  ORDER_NUDGE_MAX_FAILURES,
  ORDER_NUDGE_MS,
  useAdvanceRunningOrders,
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
    api.fetchDnsCertificates.mockRejectedValueOnce(new Error('HTTP 404: Not found'))
    const missing = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(missing.result.current.data).toEqual({ certificates: [] }))

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

describe('automatic stepping of running orders', () => {
  afterEach(() => vi.useRealTimers())

  it('checks each running order on the interval and stops when none is running', async () => {
    vi.useFakeTimers()
    api.checkDnsCertificate.mockResolvedValue({ certificate: {}, outcome: 'waiting' })
    const { rerender } = renderHook(({ ids }) => useAdvanceRunningOrders(orgId, ids), {
      wrapper: createWrapper(),
      initialProps: { ids: ['c1', 'c2'] as readonly string[] },
    })
    expect(api.checkDnsCertificate).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_NUDGE_MS)
    })
    expect(api.checkDnsCertificate.mock.calls).toEqual([
      [orgId, 'c1'],
      [orgId, 'c2'],
    ])
    rerender({ ids: [] })
    api.checkDnsCertificate.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_NUDGE_MS * 3)
    })
    expect(api.checkDnsCertificate).not.toHaveBeenCalled()
  })

  it('keeps going after a failed check and never overlaps rounds', async () => {
    vi.useFakeTimers()
    let release: () => void = () => undefined
    api.checkDnsCertificate
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    renderHook(() => useAdvanceRunningOrders(orgId, ['c1', 'c2']), { wrapper: createWrapper() })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_NUDGE_MS * 3)
    })
    expect(api.checkDnsCertificate).toHaveBeenCalledTimes(2)
    release()
  })

  it('never has more than three checks in flight', async () => {
    vi.useFakeTimers()
    let active = 0
    let peak = 0
    api.checkDnsCertificate.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1_000))
      active -= 1
      return { certificate: {}, outcome: 'waiting' }
    })
    const ids = Array.from({ length: 7 }, (_, n) => `c${n}`)
    renderHook(() => useAdvanceRunningOrders(orgId, ids), { wrapper: createWrapper() })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_NUDGE_MS + 10_000)
    })
    expect(api.checkDnsCertificate).toHaveBeenCalledTimes(7)
    expect(peak).toBe(ORDER_NUDGE_CONCURRENCY)
  })

  it('drops an order after three failures in a row and clears the count on success', async () => {
    vi.useFakeTimers()
    api.checkDnsCertificate.mockImplementation(async (_o: string, id: string) => {
      if (id === 'bad') throw new Error('404')
      return { certificate: {}, outcome: 'waiting' }
    })
    renderHook(() => useAdvanceRunningOrders(orgId, ['bad', 'good']), {
      wrapper: createWrapper(),
    })
    for (let round = 0; round < ORDER_NUDGE_MAX_FAILURES + 2; round += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ORDER_NUDGE_MS)
      })
    }
    const calls = api.checkDnsCertificate.mock.calls.map((c) => c[1])
    expect(calls.filter((id) => id === 'bad')).toHaveLength(ORDER_NUDGE_MAX_FAILURES)
    expect(calls.filter((id) => id === 'good')).toHaveLength(ORDER_NUDGE_MAX_FAILURES + 2)
  })
})
