// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAppQueryClient,
  setForbiddenHandler,
  useApiMutation,
  useCan,
} from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

vi.mock('@/lib/control-plane-accounts', () => ({
  canQueryControlPlane: () => true,
  useControlPlaneStore: () => undefined,
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchInstallStatus: vi.fn(async () => ({
      runtime: 'deno' as const,
      needsInstall: false,
      isSignupEnabled: true,
    })),
    resolveResourceId: vi.fn(async () => ({ resourceId: 'res-1' })),
    checkPermission: vi.fn(async () => ({ allowed: true })),
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

  it('stays false when entity type is null', () => {
    const { result } = renderHook(
      () => useCan(null, 'org-1', 'organization:manage'),
      { wrapper: createWrapper() },
    )
    expect(result.current).toBe(false)
  })
})

describe('queryKeys re-export', () => {
  it('exposes auth status keys used by useAuthStatus', () => {
    expect(queryKeys.auth.status).toEqual(['auth', 'status'])
  })
})
