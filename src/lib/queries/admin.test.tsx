// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useApplyPublicUrls,
  useApplyReencryptSecrets,
  useEmailSettings,
  useGithubAppSettings,
  useGitlabOauthSettings,
  usePublicUrls,
  usePublicUrlsOptional,
  useSaveEmailSettings,
  useSaveGithubAppSettings,
  useSaveGitlabOauthSettings,
  useSavePublicUrls,
  useSaveSignupSettings,
  useSignupSettings,
} from '@/lib/queries/admin'

const {
  fetchPublicUrls,
  fetchSignupSettings,
  saveSignupSettings,
  savePublicUrls,
  applyPublicUrls,
  fetchEmailSettings,
  saveEmailSettings,
  applyReencryptSecrets,
  fetchGithubAppSettings,
  saveGithubAppSettings,
  fetchGitlabOauthSettings,
  saveGitlabOauthSettings,
} = vi.hoisted(() => ({
  fetchPublicUrls: vi.fn(),
  fetchSignupSettings: vi.fn(),
  saveSignupSettings: vi.fn(),
  savePublicUrls: vi.fn(),
  applyPublicUrls: vi.fn(),
  fetchEmailSettings: vi.fn(),
  saveEmailSettings: vi.fn(),
  applyReencryptSecrets: vi.fn(),
  fetchGithubAppSettings: vi.fn(),
  saveGithubAppSettings: vi.fn(),
  fetchGitlabOauthSettings: vi.fn(),
  saveGitlabOauthSettings: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
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
    fetchGithubAppSettings,
    saveGithubAppSettings,
    fetchGitlabOauthSettings,
    saveGitlabOauthSettings,
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

  it('useSignupSettings loads signup toggle', async () => {
    fetchSignupSettings.mockResolvedValueOnce({ enabled: true })

    const { result } = renderHook(() => useSignupSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.enabled).toBe(true)
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
    expect(result.current.data?.urls).toHaveLength(1)
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

  it('useGithubAppSettings loads GitHub App settings', async () => {
    fetchGithubAppSettings.mockResolvedValueOnce({ appId: '123' })

    const { result } = renderHook(() => useGithubAppSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchGithubAppSettings).toHaveBeenCalled()
  })

  it('useSaveGithubAppSettings updates GitHub App cache', async () => {
    const payload = { appId: '456' }
    saveGithubAppSettings.mockResolvedValueOnce(payload)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSaveGithubAppSettings(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ appId: '456' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.admin.gitGithubApp)).toEqual(payload)
    })
  })

  it('useGitlabOauthSettings loads GitLab OAuth settings', async () => {
    fetchGitlabOauthSettings.mockResolvedValueOnce({
      baseUrl: 'https://gitlab.com',
    })

    const { result } = renderHook(() => useGitlabOauthSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchGitlabOauthSettings).toHaveBeenCalled()
  })

  it('useSaveGitlabOauthSettings updates GitLab OAuth cache', async () => {
    const payload = { baseUrl: 'https://gitlab.example.com' }
    saveGitlabOauthSettings.mockResolvedValueOnce(payload)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSaveGitlabOauthSettings(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ baseUrl: 'https://gitlab.example.com' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(client.getQueryData(queryKeys.admin.gitGitlabOauth)).toEqual(
        payload,
      )
    })
  })
})
