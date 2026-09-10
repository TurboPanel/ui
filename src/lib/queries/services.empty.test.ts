// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useHostingsByServices,
  useServices,
  useServicesByEnvironments,
} from '@/lib/queries/services'

const { fetchVisibleHostings, fetchVisibleServices } = vi.hoisted(() => ({
  fetchVisibleHostings: vi.fn(),
  fetchVisibleServices: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchVisibleHostings,
    fetchVisibleServices,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('services empty-list and idle branches', () => {
  const orgId = 'org-1'

  it('useServices stays idle when org id is empty', () => {
    const { result } = renderHook(() => useServices(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchVisibleServices).not.toHaveBeenCalled()
  })

  it('useHostingsByServices returns an empty map for no service ids', () => {
    const { result } = renderHook(() => useHostingsByServices(orgId, []), {
      wrapper: createWrapper(),
    })
    expect(result.current.hostingsByService).toEqual({})
    expect(result.current.isLoading).toBe(false)
    expect(fetchVisibleHostings).not.toHaveBeenCalled()
  })

  it('useHostingsByServices stays idle when org id is empty', () => {
    const { result } = renderHook(
      () => useHostingsByServices('', ['svc-1']),
      { wrapper: createWrapper() },
    )
    expect(result.current.isLoading).toBe(false)
    expect(fetchVisibleHostings).not.toHaveBeenCalled()
  })

  it('useServicesByEnvironments returns an empty map for no environment ids', () => {
    const { result } = renderHook(
      () => useServicesByEnvironments(orgId, []),
      { wrapper: createWrapper() },
    )
    expect(result.current.servicesByEnv).toEqual({})
    expect(result.current.isLoading).toBe(false)
    expect(fetchVisibleServices).not.toHaveBeenCalled()
  })

  it('useServicesByEnvironments maps missing query data to an empty list', async () => {
    fetchVisibleServices.mockResolvedValueOnce({ services: undefined })

    const { result } = renderHook(
      () => useServicesByEnvironments(orgId, ['env-1']),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.servicesByEnv['env-1']).toEqual([])
  })
})
