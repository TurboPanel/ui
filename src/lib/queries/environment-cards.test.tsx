// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useEnvironmentConfigViews, useLatestDeployments } from '@/lib/queries/environment-cards'

const { fetchEnvironmentConfigView, fetchEnvironmentDeployments } = vi.hoisted(() => ({
  fetchEnvironmentConfigView: vi.fn(),
  fetchEnvironmentDeployments: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  fetchEnvironmentConfigView,
  fetchEnvironmentDeployments,
}))

function wrapperFor(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function row(id: string, generation: number, status: string) {
  return {
    id,
    commandId: id,
    generation,
    status,
    actorEntityType: 'user',
    startedAt: '2026-10-05T11:00:00Z',
    finishedAt: null,
    durationMs: null,
    trigger: null,
    strategy: null,
    strategyOutcome: null,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useEnvironmentConfigViews', () => {
  it('reads one config-view per environment and keys the answers by environment', async () => {
    fetchEnvironmentConfigView.mockImplementation(async (id: string) => ({ ok: true, environmentId: id }))
    const { result } = renderHook(() => useEnvironmentConfigViews('o', ['e1', 'e2']), {
      wrapper: wrapperFor(),
    })
    await waitFor(() => expect(result.current.views.e1).toBeDefined())
    await waitFor(() => expect(result.current.views.e2).toBeDefined())
    expect(fetchEnvironmentConfigView).toHaveBeenCalledWith('e1')
    expect(fetchEnvironmentConfigView).toHaveBeenCalledWith('e2')
    expect(result.current.isLoading).toBe(false)
  })

  it('leaves an environment out when its read fails, without retrying', async () => {
    fetchEnvironmentConfigView.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new Error('compose_invalid')
      return { ok: true, environmentId: id }
    })
    const { result } = renderHook(() => useEnvironmentConfigViews('o', ['good', 'bad']), {
      wrapper: wrapperFor(),
    })
    await waitFor(() => expect(result.current.views.good).toBeDefined())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.views.bad).toBeUndefined()
    expect(fetchEnvironmentConfigView.mock.calls.filter(([id]) => id === 'bad')).toHaveLength(1)
  })

  it('reads nothing when disabled, or without an organization', () => {
    renderHook(() => useEnvironmentConfigViews('o', ['e1'], { enabled: false }), { wrapper: wrapperFor() })
    renderHook(() => useEnvironmentConfigViews('', ['e1']), { wrapper: wrapperFor() })
    expect(fetchEnvironmentConfigView).not.toHaveBeenCalled()
  })

  it('files each read under the environment, so an environment change refreshes it', () => {
    expect(queryKeys.org('o').environments.configView('e1')).toEqual(['org', 'o', 'environment', 'e1', 'config-view'])
    expect(queryKeys.org('o').environments.latestDeployments('e1').slice(0, 5)).toEqual(
      queryKeys.org('o').environments.deployments('e1'),
    )
  })
})

describe('useLatestDeployments', () => {
  it('groups the rows of the newest deploy and returns that group', async () => {
    fetchEnvironmentDeployments.mockResolvedValue({
      ok: true,
      nextCursor: null,
      deployments: [row('a', 7, 'succeeded'), row('b', 7, 'running'), row('c', 6, 'failed')],
    })
    const { result } = renderHook(() => useLatestDeployments('o', ['e1']), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.latest.e1).toBeTruthy())
    expect(fetchEnvironmentDeployments).toHaveBeenCalledWith('e1', { limit: 8 })
    expect(result.current.latest.e1).toMatchObject({ generation: 7, status: 'running' })
  })

  it('is null for an environment that never deployed', async () => {
    fetchEnvironmentDeployments.mockResolvedValue({ ok: true, nextCursor: null, deployments: [] })
    const { result } = renderHook(() => useLatestDeployments('o', ['e1']), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.latest.e1).toBeNull())
  })

  it('stays undefined when the read fails', async () => {
    fetchEnvironmentDeployments.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useLatestDeployments('o', ['e1']), { wrapper: wrapperFor() })
    await waitFor(() => expect(fetchEnvironmentDeployments).toHaveBeenCalled())
    expect(result.current.latest.e1).toBeUndefined()
  })

  it('reads again while the newest deploy is still going, and stops when it is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchEnvironmentDeployments
        .mockResolvedValueOnce({ ok: true, nextCursor: null, deployments: [row('a', 1, 'running')] })
        .mockResolvedValue({ ok: true, nextCursor: null, deployments: [row('a', 1, 'succeeded')] })
      const { result } = renderHook(() => useLatestDeployments('o', ['e1']), { wrapper: wrapperFor() })
      await waitFor(() => expect(result.current.latest.e1?.status).toBe('running'))
      await vi.advanceTimersByTimeAsync(2500)
      await waitFor(() => expect(result.current.latest.e1?.status).toBe('succeeded'))
      const calls = fetchEnvironmentDeployments.mock.calls.length
      await vi.advanceTimersByTimeAsync(5000)
      expect(fetchEnvironmentDeployments.mock.calls).toHaveLength(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads nothing when disabled', () => {
    renderHook(() => useLatestDeployments('o', ['e1'], { enabled: false }), { wrapper: wrapperFor() })
    expect(fetchEnvironmentDeployments).not.toHaveBeenCalled()
  })
})
