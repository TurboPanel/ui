// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '../org-context'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import {
  useApplyPublicUrls,
  useApplyReencryptSecrets,
  useEmailSettings,
  useCreateForge,
  useDeleteForge,
  useForges,
  usePublicUrls,
  usePublicUrlsOptional,
  useSaveEmailSettings,
  useSavePublicUrls,
  useSaveSignupSettings,
  useSignupSettings,
  useStartGithubAppManifest,
  useSyncForge,
  useUpdateForge,
} from './admin'

const {
  fetchPublicUrls,
  fetchSignupSettings,
  saveSignupSettings,
  savePublicUrls,
  applyPublicUrls,
  fetchEmailSettings,
  saveEmailSettings,
  applyReencryptSecrets,
  fetchForges,
  createForge,
  deleteForge,
  updateForge,
  startGithubAppManifest,
  syncForge,
} = vi.hoisted(() => ({
  fetchPublicUrls: vi.fn(),
  fetchSignupSettings: vi.fn(),
  saveSignupSettings: vi.fn(),
  savePublicUrls: vi.fn(),
  applyPublicUrls: vi.fn(),
  fetchEmailSettings: vi.fn(),
  saveEmailSettings: vi.fn(),
  applyReencryptSecrets: vi.fn(),
  fetchForges: vi.fn(),
  createForge: vi.fn(),
  deleteForge: vi.fn(),
  updateForge: vi.fn(),
  startGithubAppManifest: vi.fn(),
  syncForge: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return {
    ...actual,
    fetchPublicUrls,
    fetchSignupSettings,
    saveSignupSettings,
    savePublicUrls,
    applyPublicUrls,
    fetchEmailSettings,
    saveEmailSettings,
    applyReencryptSecrets,
    fetchForges,
    createForge,
    deleteForge,
    updateForge,
    startGithubAppManifest,
    syncForge,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
  setActiveOrganizationId(null)
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

  it('useSignupSettings loads signup toggle', async () => {
    fetchSignupSettings.mockResolvedValueOnce({ enabled: true })

    const { result } = renderHook(() => useSignupSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({ enabled: true })
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

  it('usePublicUrls loads control-plane URLs', async () => {
    fetchPublicUrls.mockResolvedValueOnce({ urls: ['https://panel.example.com'] })

    const { result } = renderHook(() => usePublicUrls(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({
      urls: ['https://panel.example.com'],
    })
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

  it('useSavePublicUrls invalidates public URL cache', async () => {
    savePublicUrls.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSavePublicUrls(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run(['https://panel.example.com']),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.publicUrls,
      })
    })
  })

  it('useApplyPublicUrls invalidates public URL cache', async () => {
    applyPublicUrls.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useApplyPublicUrls(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run(['https://panel.example.com']),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.publicUrls,
      })
    })
  })

  it('useEmailSettings loads email provider settings', async () => {
    fetchEmailSettings.mockResolvedValueOnce({ provider: 'smtp' })

    const { result } = renderHook(() => useEmailSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEmailSettings).toHaveBeenCalled()
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

  it('useSaveEmailSettings updates email cache', async () => {
    const payload = { provider: 'mailgun' }
    saveEmailSettings.mockResolvedValueOnce(payload)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSaveEmailSettings(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ provider: 'mailgun' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.admin.email)).toEqual(payload)
    })
  })

  it('useApplyReencryptSecrets runs bounded sweep', async () => {
    applyReencryptSecrets.mockResolvedValueOnce({
      ok: true,
      completed: true,
      scanned: 1,
      reencrypted: 1,
      skipped: 0,
      failed: 0,
    })

    const { result } = renderHook(() => useApplyReencryptSecrets(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    expect(applyReencryptSecrets).toHaveBeenCalled()
  })

  it('useForges loads the collection for its scope', async () => {
    fetchForges.mockResolvedValueOnce([{ id: 'app-1' }])

    const { result } = renderHook(() => useForges('admin'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchForges).toHaveBeenCalledWith('admin')
  })

  it('useForges stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => useForges('admin', { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchForges).not.toHaveBeenCalled()
  })

  it('useForges fetches when enabled is true', async () => {
    fetchForges.mockResolvedValueOnce([])

    const { result } = renderHook(
      () => useForges('admin', { enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchForges).toHaveBeenCalledWith('admin')
  })

  it('useForges keys admin and org separately, and org by organization', async () => {
    // The org list contains instance-wide apps too, and its readOnly flags and
    // webhook URLs differ per org — so it must not share a cache entry with
    // the admin list, nor with another organization's list.
    fetchForges.mockResolvedValue([])
    const client = createAppQueryClient()

    renderHook(() => useForges('admin'), { wrapper: createWrapper(client) })
    renderHook(() => useForges('org'), { wrapper: createWrapper(client) })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.admin.forges)).toBeDefined()
    })
    expect(queryKeys.admin.forges).not.toEqual(queryKeys.org('org-1').forges)
    expect(queryKeys.org('org-1').forges).not.toEqual(
      queryKeys.org('org-2').forges,
    )
  })

  it('useCreateForge invalidates its scope', async () => {
    createForge.mockResolvedValueOnce({ id: 'app-1' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateForge('org'), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        provider: 'github',
        name: 'TurboPanel',
        externalAppId: '123',
      }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled()
    })
  })

  it('useDeleteForge invalidates its scope', async () => {
    deleteForge.mockResolvedValueOnce(undefined)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteForge('admin'), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run('app-1')).resolves.toMatchObject({ ok: true })
    expect(deleteForge).toHaveBeenCalledWith('admin', 'app-1')

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.forges,
      })
    })
  })

  it('useUpdateForge patches and invalidates the admin collection', async () => {
    const updated = { id: 'app-1', name: 'Renamed' }
    updateForge.mockResolvedValueOnce(updated)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateForge('admin'), {
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
    expect(updateForge).toHaveBeenCalledWith('admin', 'app-1', {
      name: 'Renamed',
    })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.forges,
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

  it('useSyncForge reconciles and invalidates the org collection', async () => {
    setActiveOrganizationId('org-1')
    const snapshot = {
      app: { id: 'app-1', name: 'Synced' },
      provider: { permissions: { contents: 'read' }, events: ['push'] },
    }
    syncForge.mockResolvedValueOnce(snapshot)
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSyncForge('org'), {
      wrapper: createWrapper(client),
    })

    const outcome = await result.current.run('app-1')
    if (!outcome.ok) {
      throw new TypeError('expected sync mutation to succeed')
    }
    expect(outcome.value).toEqual(snapshot)
    expect(syncForge).toHaveBeenCalledWith('org', 'app-1')

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org('org-1').forges,
      })
    })
  })
})
