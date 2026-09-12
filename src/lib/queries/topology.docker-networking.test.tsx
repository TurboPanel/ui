// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useOrgDockerNetworking,
  useSaveOrgDockerNetworking,
} from '@/lib/queries/topology'

const { fetchOrganizationDockerNetworking, updateOrganizationDockerNetworking } =
  vi.hoisted(() => ({
    fetchOrganizationDockerNetworking: vi.fn(),
    updateOrganizationDockerNetworking: vi.fn(),
  }))

vi.mock('@/lib/instance-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/instance-api')>(
    '@/lib/instance-api',
  )
  return {
    ...actual,
    fetchOrganizationDockerNetworking,
    updateOrganizationDockerNetworking,
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

describe('useOrgDockerNetworking', () => {
  const orgId = 'org-1'

  it('loads the stored pools and bridge', async () => {
    fetchOrganizationDockerNetworking.mockResolvedValueOnce({
      addressPools: [{ base: '10.200.0.0/16', size: 24 }],
      defaultBridgeCidr: '172.17.0.1/16',
    })
    const { result } = renderHook(() => useOrgDockerNetworking(orgId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.addressPools).toHaveLength(1)
    expect(fetchOrganizationDockerNetworking).toHaveBeenCalledWith(orgId)
  })

  it('resolves a 403 to Docker defaults instead of throwing', async () => {
    fetchOrganizationDockerNetworking.mockRejectedValueOnce(
      new Error('/x failed: HTTP 403: forbidden'),
    )
    const { result } = renderHook(() => useOrgDockerNetworking(orgId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ addressPools: [], defaultBridgeCidr: null })
  })

  it('surfaces other failures without retrying', async () => {
    fetchOrganizationDockerNetworking.mockRejectedValueOnce(
      new Error('/x failed: HTTP 500'),
    )
    const { result } = renderHook(() => useOrgDockerNetworking(orgId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchOrganizationDockerNetworking).toHaveBeenCalledTimes(1)
  })

  it('stays idle without an org id', () => {
    const { result } = renderHook(() => useOrgDockerNetworking(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizationDockerNetworking).not.toHaveBeenCalled()
  })
})

describe('useSaveOrgDockerNetworking', () => {
  const orgId = 'org-1'

  it('writes the setting into the cache and invalidates the networks subtree', async () => {
    const client = createAppQueryClient()
    client.setQueryData(queryKeys.org(orgId).topology.networksAll, { networks: [] })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    updateOrganizationDockerNetworking.mockResolvedValueOnce({
      ok: true,
      addressPools: [{ base: '10.200.0.0/16', size: 24 }],
      defaultBridgeCidr: null,
    })
    const { result } = renderHook(() => useSaveOrgDockerNetworking(orgId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.mutateAsync({
        addressPools: [{ base: '10.200.0.0/16', size: 24 }],
        defaultBridgeCidr: null,
      })
    })
    expect(updateOrganizationDockerNetworking).toHaveBeenCalledWith(orgId, {
      addressPools: [{ base: '10.200.0.0/16', size: 24 }],
      defaultBridgeCidr: null,
    })
    expect(client.getQueryData(queryKeys.org(orgId).settings.dockerNetworking)).toEqual({
      addressPools: [{ base: '10.200.0.0/16', size: 24 }],
      defaultBridgeCidr: null,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.networksAll,
    })
  })

  it('exposes a collision as actionError', async () => {
    updateOrganizationDockerNetworking.mockRejectedValueOnce(
      new Error('/x failed: HTTP 409: cidr_overlaps_reserved'),
    )
    const { result } = renderHook(() => useSaveOrgDockerNetworking(orgId), {
      wrapper: createWrapper(),
    })
    await act(async () => {
      const outcome = await result.current.run({ addressPools: [] })
      expect(outcome.ok).toBe(false)
    })
    await waitFor(() => expect(result.current.actionError).toContain('cidr_overlaps_reserved'))
  })
})
