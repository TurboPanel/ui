// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateTlsCertificate,
  useDeleteTlsCertificate,
  useOrganizationCaRotation,
  useRetireOrganizationCa,
  useRotateOrganizationCa,
  useTlsLibrary,
} from '@/lib/queries/tls'

const {
  fetchTlsLibrary,
  createTlsCertificate,
  deleteTlsCertificate,
  fetchOrganizationCaRotation,
  rotateOrganizationCa,
  retireOrganizationCa,
} = vi.hoisted(() => ({
  fetchTlsLibrary: vi.fn(),
  createTlsCertificate: vi.fn(),
  deleteTlsCertificate: vi.fn(),
  fetchOrganizationCaRotation: vi.fn(),
  rotateOrganizationCa: vi.fn(),
  retireOrganizationCa: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchTlsLibrary,
    createTlsCertificate,
    deleteTlsCertificate,
    fetchOrganizationCaRotation,
    rotateOrganizationCa,
    retireOrganizationCa,
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

describe('tls query hooks', () => {
  const orgId = 'org-1'

  it('useTlsLibrary loads certificate library', async () => {
    fetchTlsLibrary.mockResolvedValueOnce({
      tls: [{ id: 'tls-1', name: 'LAN cert' }],
    })

    const { result } = renderHook(() => useTlsLibrary(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.tls).toHaveLength(1)
  })

  it('useTlsLibrary stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useTlsLibrary(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useTlsLibrary(''), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchTlsLibrary).not.toHaveBeenCalled()
  })

  it('useCreateTlsCertificate creates certificate', async () => {
    createTlsCertificate.mockResolvedValueOnce({ ok: true, id: 'tls-2' })

    const { result } = renderHook(() => useCreateTlsCertificate(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        source: 'self_signed',
        name: 'Dev cert',
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

  it('useOrganizationCaRotation loads the rotation journal', async () => {
    fetchOrganizationCaRotation.mockResolvedValueOnce({
      rotationId: 'rot-1',
      state: 'awaiting_retire',
      results: [],
    })

    const { result } = renderHook(() => useOrganizationCaRotation(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.rotationId).toBe('rot-1')
  })

  it('useOrganizationCaRotation stays idle for empty org id', () => {
    const { result } = renderHook(() => useOrganizationCaRotation(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizationCaRotation).not.toHaveBeenCalled()
  })

  it('useRotateOrganizationCa and useRetireOrganizationCa call rotation routes', async () => {
    rotateOrganizationCa.mockResolvedValueOnce({
      ok: true,
      id: 'tls-2',
      rotationId: 'rot-1',
      generation: 2,
      results: [],
      needsRedeploy: [],
    })
    retireOrganizationCa.mockResolvedValueOnce({
      ok: true,
      rotationId: 'rot-1',
    })
    const client = createAppQueryClient()
    client.setQueryData(['org', orgId, 'tls', 'ca'], { id: 'ca-1' })
    client.setQueryData(['org', orgId, 'tls', 'ca', 'rotation'], {
      rotationId: 'rot-0',
    })

    const { result: rotate } = renderHook(() => useRotateOrganizationCa(orgId), {
      wrapper: createWrapper(client),
    })
    await expect(rotate.current.run()).resolves.toMatchObject({ ok: true })
    expect(rotateOrganizationCa).toHaveBeenCalled()

    const { result: retire } = renderHook(() => useRetireOrganizationCa(orgId), {
      wrapper: createWrapper(client),
    })
    await expect(retire.current.run()).resolves.toMatchObject({ ok: true })
    expect(retireOrganizationCa).toHaveBeenCalled()
  })

  it('useRotateOrganizationCa surfaces mutation errors', async () => {
    rotateOrganizationCa.mockRejectedValueOnce(new Error('not ready'))

    const { result } = renderHook(() => useRotateOrganizationCa(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: 'not ready',
    })
  })

  it('useRetireOrganizationCa surfaces mutation errors', async () => {
    retireOrganizationCa.mockRejectedValueOnce(new Error('still converging'))

    const { result } = renderHook(() => useRetireOrganizationCa(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: 'still converging',
    })
  })
})
