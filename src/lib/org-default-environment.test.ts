import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'
import { PLATFORM_DEFAULT_ENVIRONMENT_NAME } from '@/lib/org-default-environment'
import { queryKeys } from '@/lib/query-keys'

const useQueryMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}))

const fetchOrgDefaultEnvironment = vi.fn()
const isForbiddenError = vi.fn()

vi.mock('@/lib/instance-api', () => ({
  fetchOrgDefaultEnvironment: (...args: unknown[]) =>
    fetchOrgDefaultEnvironment(...args),
  isForbiddenError: (...args: unknown[]) => isForbiddenError(...args),
}))

describe('PLATFORM_DEFAULT_ENVIRONMENT_NAME', () => {
  it('is Production', () => {
    expect(PLATFORM_DEFAULT_ENVIRONMENT_NAME).toBe('Production')
  })
})

describe('orgDefaultEnvironmentQueryKey', () => {
  it('matches the org settings query key factory', async () => {
    const { orgDefaultEnvironmentQueryKey } = await import(
      '@/lib/org-default-environment'
    )
    expect(orgDefaultEnvironmentQueryKey('org-1')).toEqual(
      queryKeys.org('org-1').settings.defaultEnvironment,
    )
  })
})

describe('useOrgDefaultEnvironmentName', () => {
  beforeEach(() => {
    useQueryMock.mockReset()
    fetchOrgDefaultEnvironment.mockReset()
    isForbiddenError.mockReset()
  })

  async function loadHook() {
    const mod = await import('@/lib/org-default-environment')
    return mod.useOrgDefaultEnvironmentName
  }

  it('resolves trimmed custom names from query data', async () => {
    useQueryMock.mockReturnValue({
      data: { defaultEnvironmentName: '  Staging  ' },
      isLoading: false,
      isError: false,
    } as UseQueryResult)
    const useOrgDefaultEnvironmentName = await loadHook()
    const result = useOrgDefaultEnvironmentName('org-1')
    expect(result.defaultEnvironmentName).toBe('Staging')
    expect(result.isLoading).toBe(false)
    expect(result.isError).toBe(false)
  })

  it('falls back to Production for null, blank, or missing names', async () => {
    for (const data of [
      undefined,
      { defaultEnvironmentName: null },
      { defaultEnvironmentName: '   ' },
      { defaultEnvironmentName: '' },
    ]) {
      useQueryMock.mockReturnValue({
        data,
        isLoading: false,
        isError: false,
      } as UseQueryResult)
      const useOrgDefaultEnvironmentName = await loadHook()
      expect(useOrgDefaultEnvironmentName('org-1').defaultEnvironmentName).toBe(
        PLATFORM_DEFAULT_ENVIRONMENT_NAME,
      )
    }
  })

  it('enables the query when orgId is set unless overridden', async () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as UseQueryResult)
    const useOrgDefaultEnvironmentName = await loadHook()

    useOrgDefaultEnvironmentName('org-1')
    expect(useQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: true,
      retry: false,
    })

    useOrgDefaultEnvironmentName('')
    expect(useQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: false,
    })

    useOrgDefaultEnvironmentName('org-1', { enabled: false })
    expect(useQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: false,
    })
  })

  it('queryFn returns null name on forbidden errors', async () => {
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 })
    fetchOrgDefaultEnvironment.mockRejectedValue(forbidden)
    isForbiddenError.mockReturnValue(true)

    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as UseQueryResult)
    const useOrgDefaultEnvironmentName = await loadHook()
    useOrgDefaultEnvironmentName('org-1')

    const options = useQueryMock.mock.calls.at(-1)?.[0] as {
      queryFn: () => Promise<{ defaultEnvironmentName: string | null }>
    }
    await expect(options.queryFn()).resolves.toEqual({
      defaultEnvironmentName: null,
    })
    expect(isForbiddenError).toHaveBeenCalledWith(forbidden)
  })

  it('queryFn rethrows non-forbidden errors', async () => {
    const boom = new Error('network')
    fetchOrgDefaultEnvironment.mockRejectedValue(boom)
    isForbiddenError.mockReturnValue(false)

    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as UseQueryResult)
    const useOrgDefaultEnvironmentName = await loadHook()
    useOrgDefaultEnvironmentName('org-1')

    const options = useQueryMock.mock.calls.at(-1)?.[0] as {
      queryFn: () => Promise<unknown>
    }
    await expect(options.queryFn()).rejects.toThrow(boom)
  })

  it('queryFn forwards successful fetch results', async () => {
    fetchOrgDefaultEnvironment.mockResolvedValue({
      defaultEnvironmentName: 'QA',
    })

    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as UseQueryResult)
    const useOrgDefaultEnvironmentName = await loadHook()
    useOrgDefaultEnvironmentName('org-2')

    const options = useQueryMock.mock.calls.at(-1)?.[0] as {
      queryFn: () => Promise<{ defaultEnvironmentName: string | null }>
    }
    await expect(options.queryFn()).resolves.toEqual({
      defaultEnvironmentName: 'QA',
    })
    expect(fetchOrgDefaultEnvironment).toHaveBeenCalledWith('org-2')
  })
})
