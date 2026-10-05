// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { configViewKey, useEnvironmentConfigView } from '@/components/org/project/environment-overview/use-config-view'

const fetchMock = vi.fn()

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('useEnvironmentConfigView', () => {
  it('keys the query under the environment so a save refreshes it', () => {
    expect(configViewKey('org-1', 'e')).toEqual(['org', 'org-1', 'environment', 'e', 'config-view'])
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loads the view once and does not retry a refusal', async () => {
    const side = { services: [], variables: [], linuxUsers: [] }
    fetchMock.mockResolvedValueOnce(
      respond({ ok: true, environmentId: 'e', projectId: 'p', followsBase: false, base: side, effective: side, changes: [] }),
    )
    const { result } = renderHook(() => useEnvironmentConfigView('org-1', 'e'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.followsBase).toBe(false)
  })

  it('reports an error when the route refuses', async () => {
    fetchMock.mockResolvedValue(respond({ error: 'forbidden' }, 403))
    const { result } = renderHook(() => useEnvironmentConfigView('org-1', 'e'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not fetch without an environment', () => {
    renderHook(() => useEnvironmentConfigView('org-1', ''), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
