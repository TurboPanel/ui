// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { useApplyPublicUrls, useForges } from '@/lib/queries/admin'

const { applyPublicUrls, fetchPublicUrls, fetchForges } = vi.hoisted(() => ({
  applyPublicUrls: vi.fn(),
  fetchPublicUrls: vi.fn(),
  fetchForges: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    applyPublicUrls,
    fetchPublicUrls,
    fetchForges,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
  setActiveOrganizationId(null)
})

describe('admin apply and forge key branches', () => {
  it('useApplyPublicUrls applies with no variables object', async () => {
    applyPublicUrls.mockResolvedValueOnce({ ok: true, applied: true })

    const { result } = renderHook(() => useApplyPublicUrls(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run({})).resolves.toMatchObject({
      ok: true,
      value: { kind: 'applied' },
    })
    expect(applyPublicUrls).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
    )
  })

  it('useApplyPublicUrls treats a restart without requested urls as reconnected', async () => {
    applyPublicUrls.mockRejectedValueOnce(
      new Error('/api/admin/v1/instance/public-urls/apply failed: HTTP 502'),
    )
    fetchPublicUrls.mockResolvedValueOnce({
      ok: true,
      urls: ['https://panel.example.com'],
    })

    const { result } = renderHook(() => useApplyPublicUrls(), {
      wrapper: createWrapper(),
    })

    vi.useFakeTimers()
    try {
      const pending = result.current.run({})
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(pending).resolves.toMatchObject({
        ok: true,
        value: {
          kind: 'reconnected',
          urls: ['https://panel.example.com'],
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('useForges keys the org collection as none when no organization is active', async () => {
    fetchForges.mockResolvedValueOnce([])
    const client = createAppQueryClient()

    renderHook(() => useForges('org'), { wrapper: createWrapper(client) })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.org('none').forges)).toEqual([])
    })
    expect(fetchForges).toHaveBeenCalledWith('org')
  })
})
