// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  usePublicUrlsOptional,
  useSaveSignupSettings,
  useSignupSettings,
} from '@/lib/queries/admin'

const {
  fetchPublicUrls,
  fetchSignupSettings,
  saveSignupSettings,
} = vi.hoisted(() => ({
  fetchPublicUrls: vi.fn(),
  fetchSignupSettings: vi.fn(),
  saveSignupSettings: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchPublicUrls,
    fetchSignupSettings,
    saveSignupSettings,
    applyPublicUrls: vi.fn(),
    savePublicUrls: vi.fn(),
    fetchEmailSettings: vi.fn(),
    saveEmailSettings: vi.fn(),
    applyReencryptSecrets: vi.fn(),
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('admin query hooks', () => {
  it('usePublicUrlsOptional swallows manage-gated 403', async () => {
    fetchPublicUrls.mockRejectedValueOnce(new Error('HTTP 403: forbidden'))

    const { result } = renderHook(() => usePublicUrlsOptional(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({ urls: [] })
  })

  it('useSignupSettings loads signup toggle', async () => {
    fetchSignupSettings.mockResolvedValueOnce({ enabled: true })

    const { result } = renderHook(() => useSignupSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.enabled).toBe(true)
  })

  it('useSaveSignupSettings updates signup cache', async () => {
    const payload = { enabled: false }
    saveSignupSettings.mockResolvedValueOnce(payload)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSaveSignupSettings(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run(false)).resolves.toMatchObject({
      ok: true,
    })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.admin.signup)).toEqual(payload)
    })
  })
})
