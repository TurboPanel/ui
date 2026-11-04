// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDnsCertificates } from '@/lib/queries/dns-certificates'
import { createAppQueryClient } from '@/lib/query-client'

const api = vi.hoisted(() => ({
  fetchDnsCertificates: vi.fn(),
  checkDnsCertificate: vi.fn(),
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
  it('loads the list, looks again once a minute, and never asks an open order to move on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.fetchDnsCertificates.mockResolvedValue({
        certificates: [{ id: 'c1', status: 'pending' }],
      })
      const { result } = renderHook(() => useDnsCertificates(orgId), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.fetchDnsCertificates).toHaveBeenCalledWith(orgId)
      const loads = api.fetchDnsCertificates.mock.calls.length
      // Past the old 5 s refresh and 15 s check: nothing yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })
      expect(api.fetchDnsCertificates.mock.calls).toHaveLength(loads)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000)
      })
      expect(api.fetchDnsCertificates.mock.calls.length).toBeGreaterThan(loads)
      expect(api.checkDnsCertificate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not load while disabled', async () => {
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
})
