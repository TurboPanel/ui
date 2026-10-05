// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useHostingCertificate,
  useHostingDnsCheck,
  useUseLetsEncrypt,
} from '@/lib/queries/hosting-certificate'

const { fetchHosting, requestLetsEncryptForHosting, fetchHostingDnsCheck } = vi.hoisted(() => ({
  fetchHosting: vi.fn(),
  requestLetsEncryptForHosting: vi.fn(),
  fetchHostingDnsCheck: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchHosting, requestLetsEncryptForHosting, fetchHostingDnsCheck }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('hosting certificate queries', () => {
  it('loads one hosting, and stays idle without an id', async () => {
    fetchHosting.mockResolvedValue({ hosting: { id: 'h1', certificate: null } })
    const idle = renderHook(() => useHostingCertificate('org-1', null), {
      wrapper: createWrapper(),
    })
    expect(idle.result.current.fetchStatus).toBe('idle')
    const { result } = renderHook(() => useHostingCertificate('org-1', 'h1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchHosting).toHaveBeenCalledWith('h1')
  })

  it('use Let’s Encrypt sends the choice and refreshes the hosting lists', async () => {
    requestLetsEncryptForHosting.mockResolvedValue({ needsDeploy: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUseLetsEncrypt('org-1', 'h1'), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.run({ wwwRedirect: true })
    })
    expect(requestLetsEncryptForHosting).toHaveBeenCalledWith('h1', { wwwRedirect: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org', 'org-1', 'hostings'] })
  })

  it('check DNS is read-only and returns the report', async () => {
    fetchHostingDnsCheck.mockResolvedValue({ dns: { ready: false } })
    const { result } = renderHook(() => useHostingDnsCheck('h1'), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.run()
    })
    await waitFor(() => expect(result.current.data).toEqual({ dns: { ready: false } }))
  })
})
