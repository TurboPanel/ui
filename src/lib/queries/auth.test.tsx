// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ControlPlaneAccount } from '@/lib/control-plane-accounts'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useBootstrapInstall,
  useCompleteInstall,
  useCreateOrganization,
  useInstallStatusQuery,
  useOrganizationsQuery,
  useSessionQuery,
  useSignIn,
  useSignOut,
  useSignUp,
  useUpdateOrganization,
  useVerifyEmail,
} from '@/lib/queries/auth'

const {
  fetchSession,
  fetchInstallStatus,
  fetchOrganizations,
  signIn,
  signOut,
  signUp,
  createOrganization,
  updateOrganization,
  completeInstall,
  bootstrapInstall,
  verifyEmail,
} = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  fetchInstallStatus: vi.fn(),
  fetchOrganizations: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  completeInstall: vi.fn(),
  bootstrapInstall: vi.fn(),
  verifyEmail: vi.fn(),
}))

const {
  getActiveControlPlaneAccount,
  rememberSignedInAccount,
  removeActiveControlPlaneAccount,
} = vi.hoisted(() => ({
  getActiveControlPlaneAccount: vi.fn((): ControlPlaneAccount | null => null),
  rememberSignedInAccount: vi.fn(),
  removeActiveControlPlaneAccount: vi.fn(),
}))

const { isRemoteCookieClient } = vi.hoisted(() => ({
  isRemoteCookieClient: vi.fn(() => false),
}))

const { setActiveOrganizationId } = vi.hoisted(() => ({
  setActiveOrganizationId: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchSession,
    fetchInstallStatus,
    fetchOrganizations,
    signIn,
    signOut,
    signUp,
    createOrganization,
    updateOrganization,
    completeInstall,
    bootstrapInstall,
    verifyEmail,
  }
})

vi.mock('@/lib/control-plane-accounts', () => ({
  getActiveControlPlaneAccount,
  rememberSignedInAccount,
  removeActiveControlPlaneAccount,
}))

vi.mock('@/lib/control-plane', () => ({
  isRemoteCookieClient,
}))

vi.mock('@/lib/org-context', () => ({
  setActiveOrganizationId,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
  isRemoteCookieClient.mockReturnValue(false)
  getActiveControlPlaneAccount.mockReturnValue(null)
})

describe('auth query hooks', () => {
  it('useSessionQuery loads session data', async () => {
    fetchSession.mockResolvedValueOnce({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })

    const { result } = renderHook(() => useSessionQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.email).toBe('ops@example.com')
  })

  it('useSessionQuery stays idle when enabled is false', () => {
    const { result } = renderHook(() => useSessionQuery({ enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSession).not.toHaveBeenCalled()
  })

  it('useInstallStatusQuery loads install status', async () => {
    fetchInstallStatus.mockResolvedValueOnce({
      runtime: 'deno',
      needsInstall: false,
      isSignupEnabled: true,
    })

    const { result } = renderHook(() => useInstallStatusQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.runtime).toBe('deno')
  })

  it('useOrganizationsQuery loads organizations', async () => {
    fetchOrganizations.mockResolvedValueOnce({
      organizations: [{ id: 'org-1', name: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useOrganizationsQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.organizations).toHaveLength(1)
  })

  it('useSignIn mutation runs through useApiMutation', async () => {
    signIn.mockResolvedValueOnce({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })

    const { result } = renderHook(() => useSignIn(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ email: 'ops@example.com', password: 'secret' }),
    ).resolves.toMatchObject({
      ok: true,
      value: { email: 'ops@example.com' },
    })
  })

  it('useSignIn remembers remote account when remote cookie client', async () => {
    isRemoteCookieClient.mockReturnValue(true)
    signIn.mockResolvedValueOnce({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'status'], {
      runtime: 'workers',
      needsInstall: false,
      isSignupEnabled: true,
    })

    const { result } = renderHook(() => useSignIn(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ email: 'ops@example.com', password: 'secret' }),
    ).resolves.toMatchObject({ ok: true })

    expect(rememberSignedInAccount).toHaveBeenCalledWith({
      email: 'ops@example.com',
      runtime: 'workers',
    })
  })

  it('useSignIn remembers null runtime when status cache is empty', async () => {
    isRemoteCookieClient.mockReturnValue(true)
    signIn.mockResolvedValueOnce({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })

    const { result } = renderHook(() => useSignIn(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ email: 'ops@example.com', password: 'secret' }),
    ).resolves.toMatchObject({ ok: true })

    expect(rememberSignedInAccount).toHaveBeenCalledWith({
      email: 'ops@example.com',
      runtime: null,
    })
  })

  it('useSignUp proxies sign-up mutation', async () => {
    signUp.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useSignUp(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ email: 'new@example.com', password: 'secret' }),
    ).resolves.toMatchObject({ ok: true })
    expect(signUp).toHaveBeenCalledWith('new@example.com', 'secret')
  })

  it('useBootstrapInstall proxies bootstrap mutation', async () => {
    bootstrapInstall.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useBootstrapInstall(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ username: 'root', password: 'secret' }),
    ).resolves.toMatchObject({ ok: true })
    expect(bootstrapInstall).toHaveBeenCalledWith('root', 'secret')
  })

  it('useVerifyEmail proxies verify mutation', async () => {
    verifyEmail.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useVerifyEmail(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run('tok-1')).resolves.toMatchObject({
      ok: true,
    })
    expect(verifyEmail).toHaveBeenCalledWith('tok-1', expect.anything())
  })

  it('useCreateOrganization invalidates organizations on success', async () => {
    createOrganization.mockResolvedValueOnce({ ok: true, id: 'org-2' })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'organizations'], {
      organizations: [{ id: 'org-1', name: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useCreateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ name: 'Beta' }),
    ).resolves.toMatchObject({ ok: true, value: { id: 'org-2' } })
  })

  it('useUpdateOrganization patches organizations cache', async () => {
    updateOrganization.mockResolvedValueOnce({
      ok: true,
      organization: { id: 'org-1', name: 'Renamed', createdAt: 't' },
    })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'organizations'], {
      organizations: [{ id: 'org-1', name: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ organizationId: 'org-1', name: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const cached = client.getQueryData<{ organizations: { name: string }[] }>(
        ['auth', 'organizations'],
      )
      expect(cached?.organizations[0]?.name).toBe('Renamed')
    })
  })

  it('useUpdateOrganization leaves cache alone when organizations are unset', async () => {
    updateOrganization.mockResolvedValueOnce({
      ok: true,
      organization: { id: 'org-1', name: 'Renamed', createdAt: 't' },
    })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ organizationId: 'org-1', name: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })
    expect(client.getQueryData(['auth', 'organizations'])).toBeUndefined()
  })

  it('useSignOut clears the query client on success', async () => {
    signOut.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'session'], {
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })

    const { result } = renderHook(() => useSignOut(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(client.getQueryData(['auth', 'session'])).toBeUndefined()
    expect(setActiveOrganizationId).toHaveBeenCalledWith(null)
  })

  it('useSignOut removes remote account and restores last org', async () => {
    isRemoteCookieClient.mockReturnValue(true)
    getActiveControlPlaneAccount.mockReturnValue({
      origin: 'https://203.0.113.10',
      kind: 'self-hosted',
      email: 'ops@example.com',
      runtime: 'deno',
      lastOrgId: 'org-next',
    })
    signOut.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useSignOut(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(removeActiveControlPlaneAccount).toHaveBeenCalled()
    expect(setActiveOrganizationId).toHaveBeenCalledWith('org-next')
  })

  it('useCompleteInstall clears install mode in status cache', async () => {
    completeInstall.mockResolvedValueOnce({
      userId: 'u1',
      email: 'admin@example.com',
      role: 'superadmin',
      organizationId: 'org-install',
    })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'status'], {
      needsInstall: true,
      isInstallMode: true,
      isSignupEnabled: false,
      runtime: 'deno',
    })

    const { result } = renderHook(() => useCompleteInstall(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run({
      username: 'root',
      password: 'secret',
      superadminEmail: 'admin@example.com',
      superadminPassword: 'secret',
    })).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const status = client.getQueryData<{
        needsInstall: boolean
        isInstallMode: boolean
      }>(['auth', 'status'])
      expect(status?.needsInstall).toBe(false)
      expect(status?.isInstallMode).toBe(false)
    })
  })

  it('useCompleteInstall seeds status when cache was empty', async () => {
    completeInstall.mockResolvedValueOnce({
      userId: 'u1',
      email: 'admin@example.com',
      role: 'superadmin',
      organizationId: 'org-install',
    })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useCompleteInstall(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run({
      username: 'root',
      password: 'secret',
      superadminEmail: 'admin@example.com',
      superadminPassword: 'secret',
    })).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const status = client.getQueryData<{
        needsInstall: boolean
        isInstallMode: boolean
        isSignupEnabled: boolean
      }>(['auth', 'status'])
      expect(status).toEqual({
        needsInstall: false,
        isInstallMode: false,
        isSignupEnabled: false,
      })
    })
  })
})
