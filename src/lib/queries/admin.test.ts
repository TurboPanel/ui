// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useEmailSettings,
  useGitApps,
  usePublicUrls,
  usePublicUrlsOptional,
  useSignupSettings,
  useStartGithubAppManifest,
  useSyncGitApp,
  useUpdateGitApp,
} from '@/lib/queries/admin'

const {
  fetchPublicUrls,
  fetchSignupSettings,
  fetchEmailSettings,
  fetchGitApps,
  updateGitApp,
  startGithubAppManifest,
  syncGitApp,
} = vi.hoisted(() => ({
  fetchPublicUrls: vi.fn(),
  fetchSignupSettings: vi.fn(),
  fetchEmailSettings: vi.fn(),
  fetchGitApps: vi.fn(),
  updateGitApp: vi.fn(),
  startGithubAppManifest: vi.fn(),
  syncGitApp: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchPublicUrls,
    fetchSignupSettings,
    fetchEmailSettings,
    fetchGitApps,
    updateGitApp,
    startGithubAppManifest,
    syncGitApp,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
  setActiveOrganizationId(null)
})

describe('admin query hooks — uncovered branches', () => {
  it('usePublicUrlsOptional rethrows non-403 errors', async () => {
    const boom = new Error('HTTP 500: boom')
    fetchPublicUrls.mockRejectedValueOnce(boom)

    const { result } = renderHook(() => usePublicUrlsOptional(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(fetchPublicUrls).toHaveBeenCalledTimes(1)
    if (!(result.current.error instanceof Error)) {
      throw new TypeError('expected query error to be an Error')
    }
    expect(result.current.error.message).toBe('HTTP 500: boom')
  })

  it('usePublicUrls stays idle when enabled is false', () => {
    const { result } = renderHook(() => usePublicUrls({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchPublicUrls).not.toHaveBeenCalled()
  })

  it('usePublicUrls fetches when enabled is true', async () => {
    fetchPublicUrls.mockResolvedValueOnce({ urls: ['https://panel.example.com'] })

    const { result } = renderHook(() => usePublicUrls({ enabled: true }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchPublicUrls).toHaveBeenCalled()
  })

  it('usePublicUrlsOptional stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => usePublicUrlsOptional({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchPublicUrls).not.toHaveBeenCalled()
  })

  it('usePublicUrlsOptional fetches when enabled is true', async () => {
    fetchPublicUrls.mockResolvedValueOnce({ urls: ['https://panel.example.com'] })

    const { result } = renderHook(
      () => usePublicUrlsOptional({ enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({ urls: ['https://panel.example.com'] })
  })

  it('useSignupSettings stays idle when enabled is false', () => {
    const { result } = renderHook(() => useSignupSettings({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSignupSettings).not.toHaveBeenCalled()
  })

  it('useSignupSettings fetches when enabled is true', async () => {
    fetchSignupSettings.mockResolvedValueOnce({ enabled: true })

    const { result } = renderHook(() => useSignupSettings({ enabled: true }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchSignupSettings).toHaveBeenCalled()
  })

  it('useEmailSettings stays idle when enabled is false', () => {
    const { result } = renderHook(() => useEmailSettings({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchEmailSettings).not.toHaveBeenCalled()
  })

  it('useEmailSettings fetches when enabled is true', async () => {
    fetchEmailSettings.mockResolvedValueOnce({ provider: 'smtp' })

    const { result } = renderHook(() => useEmailSettings({ enabled: true }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEmailSettings).toHaveBeenCalled()
  })

  it('useGitApps stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => useGitApps('admin', { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchGitApps).not.toHaveBeenCalled()
  })

  it('useGitApps fetches when enabled is true', async () => {
    fetchGitApps.mockResolvedValueOnce([])

    const { result } = renderHook(
      () => useGitApps('admin', { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchGitApps).toHaveBeenCalledWith('admin')
  })

  it('useUpdateGitApp patches and invalidates the admin collection', async () => {
    const updated = { id: 'app-1', name: 'Renamed' }
    updateGitApp.mockResolvedValueOnce(updated)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateGitApp('admin'), {
      wrapper: createWrapper(client),
    })

    const outcome = await result.current.run({
      id: 'app-1',
      updates: { name: 'Renamed' },
    })
    if (!outcome.ok) {
      throw new TypeError('expected update mutation to succeed')
    }
    expect(outcome.value).toEqual(updated)
    expect(updateGitApp).toHaveBeenCalledWith('admin', 'app-1', {
      name: 'Renamed',
    })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.gitApps,
      })
    })
  })

  it('useStartGithubAppManifest posts the wizard input', async () => {
    const manifest = {
      manifest: { name: 'TurboPanel GitHub' },
      createUrl: 'https://github.com/settings/apps/new',
      state: 'state-1',
    }
    startGithubAppManifest.mockResolvedValueOnce(manifest)

    const { result } = renderHook(() => useStartGithubAppManifest('org'), {
      wrapper: createWrapper(),
    })

    const input = {
      name: 'TurboPanel GitHub',
      organizationLogin: 'acme',
      pullRequestAccess: 'write' as const,
    }
    const outcome = await result.current.run(input)
    if (!outcome.ok) {
      throw new TypeError('expected manifest mutation to succeed')
    }
    expect(outcome.value).toEqual(manifest)
    expect(startGithubAppManifest).toHaveBeenCalledWith('org', input)
  })

  it('useSyncGitApp reconciles and invalidates the org collection', async () => {
    setActiveOrganizationId('org-1')
    const snapshot = {
      app: { id: 'app-1', name: 'Synced' },
      provider: { permissions: { contents: 'read' }, events: ['push'] },
    }
    syncGitApp.mockResolvedValueOnce(snapshot)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSyncGitApp('org'), {
      wrapper: createWrapper(client),
    })

    const outcome = await result.current.run('app-1')
    if (!outcome.ok) {
      throw new TypeError('expected sync mutation to succeed')
    }
    expect(outcome.value).toEqual(snapshot)
    expect(syncGitApp).toHaveBeenCalledWith('org', 'app-1')

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org('org-1').gitApps,
      })
    })
  })
})
