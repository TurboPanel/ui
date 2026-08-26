// @vitest-environment happy-dom
import { QueryClientProvider, useMutation } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppQueryClient,
  setForbiddenHandler,
  useApiMutation,
  useAuthStatus,
  useCan,
} from '@/lib/query-client'

const { fetchInstallStatus, resolveResourceId, checkPermission } = vi.hoisted(
  () => ({
    fetchInstallStatus: vi.fn(),
    resolveResourceId: vi.fn(),
    checkPermission: vi.fn(),
  }),
)

const { canQueryControlPlane } = vi.hoisted(() => ({
  canQueryControlPlane: vi.fn(() => true),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchInstallStatus,
    resolveResourceId,
    checkPermission,
  }
})

vi.mock('@/lib/control-plane-accounts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/control-plane-accounts')>()
  return {
    ...actual,
    canQueryControlPlane,
    useControlPlaneStore: () => ({}),
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  setForbiddenHandler(null)
})

afterEach(() => {
  vi.clearAllMocks()
  setForbiddenHandler(null)
})

describe('createAppQueryClient', () => {
  it('sets query and mutation defaults', () => {
    const client = createAppQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.retry).toBe(2)
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000)
    expect(defaults.mutations?.retry).toBe(false)
  })

  it('routes query 403 errors through the forbidden handler', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })

    await expect(
      client.fetchQuery({
        queryKey: ['probe', 'query-403'],
        queryFn: () => {
          throw new Error('GET /x failed: HTTP 403')
        },
      }),
    ).rejects.toThrow('HTTP 403')

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
    if (!(handler.mock.calls[0]?.[0] instanceof Error)) {
      throw new TypeError('expected Error')
    }
    expect(handler.mock.calls[0]?.[0].message).toContain('HTTP 403')
  })

  it('routes mutation 403 errors through the forbidden handler', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: () => {
            throw new Error('POST /x failed: HTTP 403')
          },
        }),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.mutateAsync()).rejects.toThrow('HTTP 403')

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores non-403 query errors', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })

    await expect(
      client.fetchQuery({
        queryKey: ['probe', 'query-500'],
        queryFn: () => {
          throw new Error('GET /x failed: HTTP 500')
        },
      }),
    ).rejects.toThrow('HTTP 500')

    expect(handler).not.toHaveBeenCalled()
  })

  it('coalesces overlapping forbidden recoveries', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const handler = vi.fn(async () => {
      await gate
    })
    setForbiddenHandler(handler)
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })

    const forbidden = () => {
      throw new Error('HTTP 403')
    }
    const first = client
      .fetchQuery({
        queryKey: ['probe', 'coalesce-a'],
        queryFn: forbidden,
      })
      .catch(() => undefined)
    const second = client
      .fetchQuery({
        queryKey: ['probe', 'coalesce-b'],
        queryFn: forbidden,
      })
      .catch(() => undefined)

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })

    release()
    await Promise.all([first, second])
  })

  it('swallows handler failures without rethrowing', async () => {
    const handler = vi.fn(async () => {
      throw new Error('recovery failed')
    })
    setForbiddenHandler(handler)
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })

    await expect(
      client.fetchQuery({
        queryKey: ['probe', 'handler-throws'],
        queryFn: () => {
          throw new Error('HTTP 403')
        },
      }),
    ).rejects.toThrow('HTTP 403')
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores 403 when no forbidden handler is registered', async () => {
    setForbiddenHandler(null)
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })

    await expect(
      client.fetchQuery({
        queryKey: ['probe', 'no-handler-403'],
        queryFn: () => {
          throw new Error('HTTP 403')
        },
      }),
    ).rejects.toThrow('HTTP 403')
  })
})

describe('useApiMutation', () => {
  it('returns ok/value from run on success', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async (value: string) => value.toUpperCase(),
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run('hello')).resolves.toEqual({
      ok: true,
      value: 'HELLO',
    })
    expect(result.current.actionError).toBeNull()
  })

  it('surfaces a readable actionError for non-forbidden failures', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw new Error('save failed')
          },
          fallbackError: 'fallback',
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: 'save failed',
    })
    await waitFor(() => {
      expect(result.current.actionError).toBe('save failed')
    })
  })

  it('uses the fallback message when the rejection is not an Error', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw 'offline'
          },
          fallbackError: 'fallback',
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: 'fallback',
    })
  })

  it('treats forbidden failures as silent auth recovery', async () => {
    const handler = vi.fn()
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw new Error('HTTP 403')
          },
          fallbackError: 'fallback',
        }),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: null,
    })
    expect(result.current.actionError).toBeNull()
    await waitFor(() => {
      expect(handler).toHaveBeenCalled()
    })
  })
})

describe('useAuthStatus', () => {
  it('loads install status when the control plane is queryable', async () => {
    canQueryControlPlane.mockReturnValue(true)
    fetchInstallStatus.mockResolvedValueOnce({
      needsInstall: false,
      isSignupEnabled: true,
    })

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchInstallStatus).toHaveBeenCalledTimes(1)
    expect(result.current.data?.needsInstall).toBe(false)
  })

  it('stays idle when the control plane cannot be queried', () => {
    canQueryControlPlane.mockReturnValue(false)

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchInstallStatus).not.toHaveBeenCalled()
  })
})

describe('useCan', () => {
  it('is false while resource resolution is loading', async () => {
    resolveResourceId.mockImplementation(
      () =>
        new Promise(() => {
          /* never settles */
        }),
    )

    const { result } = renderHook(
      () => useCan('organization', 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(resolveResourceId).toHaveBeenCalledWith('organization', 'org-1')
    })
    expect(result.current).toBe(false)
    expect(checkPermission).not.toHaveBeenCalled()
  })

  it('returns the permission check once the resource id resolves', async () => {
    resolveResourceId.mockResolvedValueOnce({ resourceId: 'res-1' })
    checkPermission.mockResolvedValueOnce({ allowed: true })

    const { result } = renderHook(
      () => useCan('organization', 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
    expect(checkPermission).toHaveBeenCalledWith(
      'res-1',
      'organization:manage',
    )
  })

  it('is false when entityType is null', () => {
    const { result } = renderHook(
      () => useCan(null, 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )
    expect(result.current).toBe(false)
    expect(resolveResourceId).not.toHaveBeenCalled()
  })

  it('is false when entityId is empty (disabled path)', () => {
    const { result } = renderHook(
      () => useCan('organization', '', 'organization:manage'),
      { wrapper: createWrapper() },
    )
    expect(result.current).toBe(false)
    expect(resolveResourceId).not.toHaveBeenCalled()
    expect(checkPermission).not.toHaveBeenCalled()
  })

  it('is false when permission is denied', async () => {
    resolveResourceId.mockResolvedValueOnce({ resourceId: 'res-2' })
    checkPermission.mockResolvedValueOnce({ allowed: false })

    const { result } = renderHook(
      () => useCan('team', 'team-1', 'team:manage'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(checkPermission).toHaveBeenCalled()
    })
    expect(result.current).toBe(false)
  })
})
