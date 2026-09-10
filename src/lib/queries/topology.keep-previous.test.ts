// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { useIps, useNetworks } from '@/lib/queries/topology'

const { fetchIps, fetchNetworks } = vi.hoisted(() => ({
  fetchIps: vi.fn(),
  fetchNetworks: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchIps,
    fetchNetworks,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

function hasPlaceholderData(
  client: ReturnType<typeof createAppQueryClient>,
  queryKey: readonly unknown[],
): boolean {
  const query = client.getQueryCache().find({ queryKey })
  if (!query) throw new TypeError('expected query in cache')
  return (
    (query.options as { placeholderData?: unknown }).placeholderData !==
    undefined
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('topology keepPreviousData branches', () => {
  const orgId = 'org-1'

  it('useIps keeps previous data when filters are present', async () => {
    fetchIps.mockResolvedValue({ ips: [] })
    const client = createAppQueryClient()
    const filters = { scope: 'public' as const }

    renderHook(() => useIps(orgId, filters), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      expect(
        hasPlaceholderData(
          client,
          queryKeys.org(orgId).topology.ips(filters),
        ),
      ).toBe(true)
    })
    expect(fetchIps).toHaveBeenCalledWith({ scope: 'public' })
  })

  it('useIps skips keepPreviousData for an empty filter object', async () => {
    fetchIps.mockResolvedValue({ ips: [] })
    const client = createAppQueryClient()
    const empty = {}

    renderHook(() => useIps(orgId, empty), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => {
      expect(
        hasPlaceholderData(client, queryKeys.org(orgId).topology.ips(empty)),
      ).toBe(false)
    })
    expect(fetchIps).toHaveBeenCalledWith({})
  })

  it('useIps can force keepPreviousData on an unfiltered list', async () => {
    fetchIps.mockResolvedValue({ ips: [] })
    const client = createAppQueryClient()

    renderHook(() => useIps(orgId, undefined, { keepPreviousData: true }), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => {
      expect(
        hasPlaceholderData(client, queryKeys.org(orgId).topology.ips()),
      ).toBe(true)
    })
    expect(fetchIps).toHaveBeenCalledWith(undefined)
  })

  it('useNetworks can force keepPreviousData off for a filtered list', async () => {
    fetchNetworks.mockResolvedValue({ networks: [] })
    const client = createAppQueryClient()
    const filters = { kind: 'docker' as const }

    renderHook(
      () => useNetworks(orgId, filters, { keepPreviousData: false }),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(
        hasPlaceholderData(
          client,
          queryKeys.org(orgId).topology.networks(filters),
        ),
      ).toBe(false)
    })
    expect(fetchNetworks).toHaveBeenCalledWith({ kind: 'docker' })
  })
})
