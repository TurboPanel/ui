// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  isOrgFabricUnavailable,
  useApplyOrgFabric,
  useOrgFabric,
  usePatchOrgFabricRelay,
  useSaveOrgFabric,
} from '@/lib/queries/fabric'

const {
  fetchOrgFabric,
  saveOrgFabric,
  applyOrgFabric,
  patchOrgFabricRelay,
} = vi.hoisted(() => ({
  fetchOrgFabric: vi.fn(),
  saveOrgFabric: vi.fn(),
  applyOrgFabric: vi.fn(),
  patchOrgFabricRelay: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrgFabric,
    saveOrgFabric,
    applyOrgFabric,
    patchOrgFabricRelay,
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

describe('fabric query hooks', () => {
  const orgId = 'org-1'

  it('useOrgFabric loads mesh settings', async () => {
    fetchOrgFabric.mockResolvedValue({
      enabled: false,
      relays: [],
    })

    const { result } = renderHook(() => useOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true)
      },
      { timeout: 3000 },
    )
    expect(fetchOrgFabric).toHaveBeenCalledWith(orgId)
  })

  it('useOrgFabric stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useOrgFabric(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useOrgFabric(''), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchOrgFabric).not.toHaveBeenCalled()
  })

  it('useOrgFabric does not retry 404 unavailable errors', async () => {
    fetchOrgFabric.mockRejectedValue(new Error('HTTP 404: not found'))

    const { result } = renderHook(() => useOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(fetchOrgFabric).toHaveBeenCalledTimes(1)
  })

  it('useOrgFabric does not retry 503 unavailable errors', async () => {
    fetchOrgFabric.mockRejectedValue(new Error('HTTP 503: unavailable'))

    const { result } = renderHook(() => useOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(fetchOrgFabric).toHaveBeenCalledTimes(1)
  })

  it('isOrgFabricUnavailable recognizes 404 and 503', () => {
    expect(isOrgFabricUnavailable(new Error('HTTP 404: missing'))).toBe(true)
    expect(isOrgFabricUnavailable(new Error('HTTP 503: unavailable'))).toBe(true)
    expect(isOrgFabricUnavailable(new Error('HTTP 500: boom'))).toBe(false)
    expect(isOrgFabricUnavailable('not an error')).toBe(false)
  })

  it('useSaveOrgFabric updates cached fabric settings', async () => {
    const fabric = { enabled: true, relays: [] }
    saveOrgFabric.mockResolvedValueOnce(fabric)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSaveOrgFabric(orgId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ enabled: true, allowRelay: false }),
    ).resolves.toMatchObject({ ok: true })

    expect(saveOrgFabric).toHaveBeenCalledWith(orgId, true, {
      allowRelay: false,
    })
    await waitFor(() => {
      expect(client.getQueryData(queryKeys.org(orgId).settings.fabric)).toEqual(
        fabric,
      )
    })
  })

  it('useSaveOrgFabric omits extras when allowRelay is undefined', async () => {
    saveOrgFabric.mockResolvedValueOnce({ enabled: false, relays: [] })

    const { result } = renderHook(() => useSaveOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ enabled: false }),
    ).resolves.toMatchObject({ ok: true })
    expect(saveOrgFabric).toHaveBeenCalledWith(orgId, false)
  })

  it('useSaveOrgFabric surfaces fallback error message', async () => {
    saveOrgFabric.mockRejectedValueOnce('offline')

    const { result } = renderHook(() => useSaveOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run({ enabled: true })).resolves.toEqual({
      ok: false,
      error: 'Failed to update TurboFabric',
    })
  })

  it('usePatchOrgFabricRelay patches relay and invalidates fabric cache', async () => {
    patchOrgFabricRelay.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    client.setQueryData(queryKeys.org(orgId).settings.fabric, {
      enabled: true,
      relays: [],
    })

    const { result } = renderHook(
      () => usePatchOrgFabricRelay(orgId, 'srv-1'),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ role: 'gateway' }),
    ).resolves.toMatchObject({ ok: true })
    expect(patchOrgFabricRelay).toHaveBeenCalledWith(orgId, 'srv-1', {
      role: 'gateway',
    })
  })

  it('useApplyOrgFabric runs apply mutation', async () => {
    applyOrgFabric.mockResolvedValueOnce({
      ok: true,
      fabricId: 'fab-1',
      interfaceName: 'tp0',
      results: [],
    })

    const { result } = renderHook(() => useApplyOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(applyOrgFabric).toHaveBeenCalledWith(orgId)
  })

  it('useApplyOrgFabric surfaces fallback error message', async () => {
    applyOrgFabric.mockRejectedValueOnce('offline')

    const { result } = renderHook(() => useApplyOrgFabric(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toEqual({
      ok: false,
      error: 'Failed to apply TurboFabric',
    })
  })
})
