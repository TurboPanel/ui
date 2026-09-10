// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useDeployEnvironment,
  useEnvironments,
} from '@/lib/queries/environments'

const { fetchVisibleEnvironments, deployEnvironment } = vi.hoisted(() => ({
  fetchVisibleEnvironments: vi.fn(),
  deployEnvironment: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchVisibleEnvironments,
    deployEnvironment,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('environments remaining branches', () => {
  const orgId = 'org-1'
  const environmentId = 'env-1'

  it('useEnvironments stays idle when org id is empty', () => {
    const { result } = renderHook(() => useEnvironments(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchVisibleEnvironments).not.toHaveBeenCalled()
  })

  it('useDeployEnvironment forwards an omitted body as undefined', async () => {
    deployEnvironment.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-1',
      serverId: 'srv-1',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeployEnvironment(orgId, environmentId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
    })
    expect(deployEnvironment).toHaveBeenCalledWith(environmentId, undefined)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    })
  })
})
