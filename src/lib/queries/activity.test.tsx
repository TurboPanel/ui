// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_PAGE_SIZE, useOrganizationActivity } from '@/lib/queries/activity'
import { createAppQueryClient } from '@/lib/query-client'

const { fetchOrganizationActivity } = vi.hoisted(() => ({ fetchOrganizationActivity: vi.fn() }))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchOrganizationActivity }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useOrganizationActivity', () => {
  it('asks for one page with the filter and offset, and stays idle when disabled', async () => {
    fetchOrganizationActivity.mockResolvedValueOnce({ ok: true, items: [], total: 0, hasMore: false })
    const { result } = renderHook(
      () => useOrganizationActivity('org-1', { filter: 'failed', offset: 25 }),
      { wrapper: createWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchOrganizationActivity).toHaveBeenCalledWith('org-1', {
      filter: 'failed',
      limit: ACTIVITY_PAGE_SIZE,
      offset: 25,
    })

    const idle = renderHook(
      () => useOrganizationActivity('org-1', { filter: 'all', offset: 0 }, { enabled: false }),
      { wrapper: createWrapper() }
    )
    expect(idle.result.current.fetchStatus).toBe('idle')
  })
})
