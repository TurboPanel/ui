// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateTlsCertificate,
  useDeleteTlsCertificate,
  useTlsLibrary,
} from '@/lib/queries/tls'

const {
  fetchTlsLibrary,
  createTlsCertificate,
  deleteTlsCertificate,
} = vi.hoisted(() => ({
  fetchTlsLibrary: vi.fn(),
  createTlsCertificate: vi.fn(),
  deleteTlsCertificate: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchTlsLibrary,
  createTlsCertificate,
  deleteTlsCertificate,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('tls query hooks', () => {
  const orgId = 'org-1'

  it('useTlsLibrary loads certificate library', async () => {
    fetchTlsLibrary.mockResolvedValueOnce({
      certificates: [{ id: 'tls-1', displayName: 'LAN cert' }],
    })

    const { result } = renderHook(() => useTlsLibrary(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.certificates).toHaveLength(1)
  })

  it('useCreateTlsCertificate creates certificate', async () => {
    createTlsCertificate.mockResolvedValueOnce({ ok: true, id: 'tls-2' })

    const { result } = renderHook(() => useCreateTlsCertificate(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        source: 'self_signed',
        displayName: 'Dev cert',
        certificatePem: 'pem',
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  it('useDeleteTlsCertificate deletes certificate', async () => {
    deleteTlsCertificate.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useDeleteTlsCertificate(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run('tls-1')).resolves.toMatchObject({
      ok: true,
    })
  })
})
