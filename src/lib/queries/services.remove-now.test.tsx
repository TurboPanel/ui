// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useRemoveHostingNow } from '@/lib/queries/services'

const { removeHostingNow } = vi.hoisted(() => ({ removeHostingNow: vi.fn() }))

vi.mock('@/lib/instance-api', () => ({
  isForbiddenError: () => false,
  removeHostingNow,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useRemoveHostingNow', () => {
  it('releases the hosting and refreshes that service’s hostings', async () => {
    removeHostingNow.mockResolvedValueOnce({ ok: true, removed: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveHostingNow('org-1'), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ hostingId: 'h1', serviceId: 'svc-1' })
    ).resolves.toMatchObject({ ok: true })

    expect(removeHostingNow).toHaveBeenCalledWith('h1')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['org', 'org-1', 'hostings']),
    })
  })

  it('reports a refusal and refreshes nothing', async () => {
    removeHostingNow.mockRejectedValueOnce(new Error('HTTP 409: environment_deploy_running'))
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveHostingNow('org-1'), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run({ hostingId: 'h1' })).resolves.toMatchObject({
      ok: false,
      error: 'HTTP 409: environment_deploy_running',
    })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refreshes every hosting list when the service is not known', async () => {
    removeHostingNow.mockResolvedValueOnce({ ok: true, removed: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveHostingNow('org-1'), {
      wrapper: createWrapper(client),
    })

    await result.current.run({ hostingId: 'h1' })

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['org', 'org-1', 'hostings']),
    })
  })
})
