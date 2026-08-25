// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAppQueryClient,
  setForbiddenHandler,
  useApiMutation,
  useAuthStatus,
  useCan,
} from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

const {
  fetchInstallStatus,
  resolveResourceId,
  checkPermission,
  canQueryControlPlane,
} = vi.hoisted(() => ({
  fetchInstallStatus: vi.fn(async () => ({
    runtime: 'deno' as const,
    needsInstall: false,
    isSignupEnabled: true,
  })),
  resolveResourceId: vi.fn(async () => ({ resourceId: 'res-1' })),
  checkPermission: vi.fn(async () => ({ allowed: true })),
  canQueryControlPlane: vi.fn(() => true),
}))

vi.mock('@/lib/control-plane-accounts', () => ({
  canQueryControlPlane,
  useControlPlaneStore: () => undefined,
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

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  setForbiddenHandler(null)
  vi.clearAllMocks()
  canQueryControlPlane.mockReturnValue(true)
  resolveResourceId.mockResolvedValue({ resourceId: 'res-1' })
  checkPermission.mockResolvedValue({ allowed: true })
  fetchInstallStatus.mockResolvedValue({
    runtime: 'deno',
    needsInstall: false,
    isSignupEnabled: true,
  })
})

describe('createAppQueryClient', () => {
  it('sets default query and mutation options', () => {
    const client = createAppQueryClient()
    expect(client.getDefaultOptions().queries?.retry).toBe(2)
    expect(client.getDefaultOptions().queries?.staleTime).toBe(5 * 60 * 1000)
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('routes forbidden query errors through the registered handler', async () => {
    const handler = vi.fn(async () => {})
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['forbidden-test'],
        queryFn: async () => {
          throw new Error('HTTP 403: forbidden')
        },
        retry: false,
      }),
    ).rejects.toThrow('HTTP 403')

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('routes forbidden mutation errors through the registered handler', async () => {
    const handler = vi.fn(async () => {})
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    await expect(
      client
        .getMutationCache()
        .build(client, {
          mutationFn: async () => {
            throw new Error('HTTP 403: forbidden')
          },
        })
        .execute(undefined),
    ).rejects.toThrow('HTTP 403')

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('coalesces overlapping forbidden recoveries', async () => {
    let resolveFirst: (() => void) | undefined
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        }),
    )
    setForbiddenHandler(handler)
    const client = createAppQueryClient()
    const forbidden = () => {
      throw new Error('HTTP 403: forbidden')
    }

    const first = client.fetchQuery({
      queryKey: ['forbidden-a'],
      queryFn: forbidden,
      retry: false,
    })
    const second = client.fetchQuery({
      queryKey: ['forbidden-b'],
      queryFn: forbidden,
      retry: false,
    })

    await Promise.allSettled([first, second])
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
    resolveFirst?.()
  })

  it('swallows recovery handler failures', async () => {
    const handler = vi.fn(async () => {
      throw new Error('recovery failed')
    })
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['forbidden-recovery'],
        queryFn: async () => {
          throw new Error('HTTP 403: forbidden')
        },
        retry: false,
      }),
    ).rejects.toThrow('HTTP 403')

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores non-forbidden errors when a handler is registered', async () => {
    const handler = vi.fn(async () => {})
    setForbiddenHandler(handler)
    const client = createAppQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['server-error'],
        queryFn: async () => {
          throw new Error('HTTP 500: boom')
        },
        retry: false,
      }),
    ).rejects.toThrow('HTTP 500')

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('useApiMutation', () => {
  it('returns ok/value from mutateAsync and maps non-forbidden errors', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async (value: string) => `done:${value}`,
          fallbackError: 'mutation failed',
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run('x')).resolves.toEqual({
      ok: true,
      value: 'done:x',
    })

    const { result: failing } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw new Error('boom')
          },
        }),
      { wrapper: createWrapper() },
    )
    await expect(failing.current.run(undefined)).resolves.toEqual({
      ok: false,
      error: 'boom',
    })
  })

  it('uses fallbackError when the rejection is not an Error', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw 'offline'
          },
          fallbackError: 'mutation failed',
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run(undefined)).resolves.toEqual({
      ok: false,
      error: 'mutation failed',
    })
    await waitFor(() => {
      expect(result.current.actionError).toBe('mutation failed')
    })
  })

  it('suppresses actionError for forbidden failures', async () => {
    const { result } = renderHook(
      () =>
        useApiMutation({
          mutationFn: async () => {
            throw new Error('HTTP 403: forbidden')
          },
        }),
      { wrapper: createWrapper() },
    )

    await expect(result.current.run(undefined)).resolves.toEqual({
      ok: false,
      error: null,
    })
    expect(result.current.actionError).toBeNull()
  })
})

describe('useAuthStatus', () => {
  it('loads install status when the control plane is queryable', async () => {
    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchInstallStatus).toHaveBeenCalled()
    expect(result.current.data?.runtime).toBe('deno')
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
  it('returns false while loading and true when permission is allowed', async () => {
    const { result } = renderHook(
      () => useCan('organization', 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )

    expect(result.current).toBe(false)

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('returns false when permission is denied', async () => {
    checkPermission.mockResolvedValue({ allowed: false })

    const { result } = renderHook(
      () => useCan('organization', 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(checkPermission).toHaveBeenCalled()
    })
    expect(result.current).toBe(false)
  })

  it('stays false when entity type is null', () => {
    const { result } = renderHook(
      () => useCan(null, 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )
    expect(result.current).toBe(false)
    expect(resolveResourceId).not.toHaveBeenCalled()
  })

  it('stays false when entity id is empty', () => {
    const { result } = renderHook(
      () => useCan('organization', '', 'organization:manage'),
      { wrapper: createWrapper() },
    )
    expect(result.current).toBe(false)
    expect(resolveResourceId).not.toHaveBeenCalled()
  })
})

describe('queryKeys re-export', () => {
  it('exposes auth status keys used by useAuthStatus', () => {
    expect(queryKeys.auth.status).toEqual(['auth', 'status'])
  })
})
