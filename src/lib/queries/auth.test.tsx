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
  useDeletePasskey,
  useDisableTwoFactor,
  useEnrollTotp,
  useInstallStatusQuery,
  useOrganizationsQuery,
  usePasskeyRegisterOptions,
  usePasskeyRegisterVerify,
  useRegenerateBackupCodes,
  useSessionQuery,
  useSignIn,
  useSignInTwoFactor,
  useSignInWithPasskey,
  useSignOut,
  useSignUp,
  useTwoFactorStatusQuery,
  useUnlinkProvider,
  useUpdateOrganization,
  useVerifyEmail,
  useVerifyTotp,
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
  fetchTwoFactorStatus,
  signInTwoFactor,
  enrollTotp,
  verifyTotp,
  regenerateBackupCodes,
  disableTwoFactor,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  deletePasskey,
  unlinkProvider,
  passkeyLoginOptions,
  passkeyLoginVerify,
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
  fetchTwoFactorStatus: vi.fn(),
  signInTwoFactor: vi.fn(),
  enrollTotp: vi.fn(),
  verifyTotp: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  disableTwoFactor: vi.fn(),
  passkeyRegisterOptions: vi.fn(),
  passkeyRegisterVerify: vi.fn(),
  deletePasskey: vi.fn(),
  unlinkProvider: vi.fn(),
  passkeyLoginOptions: vi.fn(),
  passkeyLoginVerify: vi.fn(),
}))

const { loginWithPasskey } = vi.hoisted(() => ({
  loginWithPasskey: vi.fn(),
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
    fetchTwoFactorStatus,
    signInTwoFactor,
    enrollTotp,
    verifyTotp,
    regenerateBackupCodes,
    disableTwoFactor,
    passkeyRegisterOptions,
    passkeyRegisterVerify,
    deletePasskey,
    unlinkProvider,
    passkeyLoginOptions,
    passkeyLoginVerify,
  }
})

vi.mock('@/lib/passkey-client', () => ({
  isPasskeySupported: () => false,
  loginWithPasskey,
  registerPasskey: vi.fn(),
}))

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

  it('useInstallStatusQuery stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => useInstallStatusQuery({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchInstallStatus).not.toHaveBeenCalled()
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

  it('useOrganizationsQuery stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => useOrganizationsQuery({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrganizations).not.toHaveBeenCalled()
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

  it('useSignUp forwards invitationId when present', async () => {
    signUp.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useSignUp(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        email: 'new@example.com',
        password: 'secret',
        invitationId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(signUp).toHaveBeenCalledWith(
      'new@example.com',
      'secret',
      '11111111-1111-4111-8111-111111111111',
    )
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
      organizations: [
        { id: 'org-1', name: 'Acme', createdAt: 't' },
        { id: 'org-2', name: 'Other', createdAt: 't' },
      ],
    })

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ organizationId: 'org-1', name: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const cached = client.getQueryData<{
        organizations: { id: string; name: string }[]
      }>(['auth', 'organizations'])
      expect(cached?.organizations[0]?.name).toBe('Renamed')
      expect(cached?.organizations[1]).toEqual({
        id: 'org-2',
        name: 'Other',
        createdAt: 't',
      })
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

const SESSION = {
  userId: 'u1',
  email: 'ops@example.com',
  role: 'admin',
} as const

describe('two-factor sign-in', () => {
  it('useSignIn leaves the session cache alone on a pending challenge', async () => {
    isRemoteCookieClient.mockReturnValue(true)
    signIn.mockResolvedValueOnce({ requires2fa: true, challenge: 'chal-1' })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSignIn(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ email: 'ops@example.com', password: 'secret' }),
    ).resolves.toMatchObject({ ok: true, value: { requires2fa: true } })

    expect(client.getQueryData(['auth', 'session'])).toBeUndefined()
    expect(rememberSignedInAccount).not.toHaveBeenCalled()
  })

  it('useSignInTwoFactor seeds the session on success', async () => {
    signInTwoFactor.mockResolvedValueOnce({ ...SESSION, is2faEnabled: true })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSignInTwoFactor(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ challenge: 'chal-1', code: '123456' }),
    ).resolves.toMatchObject({ ok: true })

    expect(signInTwoFactor).toHaveBeenCalledWith('chal-1', '123456', undefined)
    expect(client.getQueryData(['auth', 'session'])).toMatchObject({
      email: 'ops@example.com',
      is2faEnabled: true,
    })
  })

  it('useSignInTwoFactor forwards the backup-code kind', async () => {
    signInTwoFactor.mockResolvedValueOnce(SESSION)

    const { result } = renderHook(() => useSignInTwoFactor(), {
      wrapper: createWrapper(),
    })

    await result.current.run({
      challenge: 'chal-1',
      code: 'abcd-efgh',
      kind: 'backup',
    })
    expect(signInTwoFactor).toHaveBeenCalledWith('chal-1', 'abcd-efgh', 'backup')
  })

  it('useSignInTwoFactor remembers a remote account like password sign-in', async () => {
    isRemoteCookieClient.mockReturnValue(true)
    signInTwoFactor.mockResolvedValueOnce(SESSION)

    const { result } = renderHook(() => useSignInTwoFactor(), {
      wrapper: createWrapper(),
    })

    await result.current.run({ challenge: 'chal-1', code: '123456' })
    expect(rememberSignedInAccount).toHaveBeenCalledWith({
      email: 'ops@example.com',
      runtime: null,
    })
  })
})

describe('useSignInWithPasskey', () => {
  it('runs the ceremony and seeds the session', async () => {
    passkeyLoginOptions.mockResolvedValueOnce({
      challenge: 'chal-1',
      options: { rpId: 'panel.example.com' },
    })
    loginWithPasskey.mockResolvedValueOnce({
      supported: true,
      credential: { id: 'cred' },
    })
    passkeyLoginVerify.mockResolvedValueOnce(SESSION)
    const client = createAppQueryClient()

    const { result } = renderHook(() => useSignInWithPasskey(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(loginWithPasskey).toHaveBeenCalledWith({
      rpId: 'panel.example.com',
    })
    expect(passkeyLoginVerify).toHaveBeenCalledWith('chal-1', { id: 'cred' })
    expect(client.getQueryData(['auth', 'session'])).toMatchObject(SESSION)
  })

  it('fails with the web-only note when the platform has no WebAuthn', async () => {
    passkeyLoginOptions.mockResolvedValueOnce({
      challenge: 'chal-1',
      options: {},
    })
    loginWithPasskey.mockResolvedValueOnce({ supported: false })

    const { result } = renderHook(() => useSignInWithPasskey(), {
      wrapper: createWrapper(),
    })

    const outcome = await result.current.run()
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new TypeError('expected an unsupported failure')
    expect(outcome.error).toContain('browser')
    expect(passkeyLoginVerify).not.toHaveBeenCalled()
  })
})

describe('two-factor management hooks', () => {
  it('useTwoFactorStatusQuery loads status and passkeys', async () => {
    fetchTwoFactorStatus.mockResolvedValueOnce({
      enabled: true,
      method: 'totp',
      backupCodesRemaining: 8,
      passkeys: [],
      linkedProviders: [],
    })

    const { result } = renderHook(() => useTwoFactorStatusQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.backupCodesRemaining).toBe(8)
  })

  it('useTwoFactorStatusQuery stays idle when enabled is false', () => {
    const { result } = renderHook(
      () => useTwoFactorStatusQuery({ enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchTwoFactorStatus).not.toHaveBeenCalled()
  })

  it('useEnrollTotp forwards an optional step-up password', async () => {
    enrollTotp.mockResolvedValueOnce({ secret: 'JBSWY3DP', otpauthUri: 'x' })

    const { result } = renderHook(() => useEnrollTotp(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ password: 'hunter2' }),
    ).resolves.toMatchObject({ ok: true, value: { secret: 'JBSWY3DP' } })
    expect(enrollTotp).toHaveBeenCalledWith('hunter2')
  })

  it('useVerifyTotp marks the cached session as enrolled', async () => {
    verifyTotp.mockResolvedValueOnce({ backupCodes: ['aaaa-bbbb'] })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'session'], SESSION)

    const { result } = renderHook(() => useVerifyTotp(), {
      wrapper: createWrapper(client),
    })

    await expect(result.current.run({ code: '123456' })).resolves.toMatchObject({
      ok: true,
    })
    expect(client.getQueryData(['auth', 'session'])).toMatchObject({
      is2faEnabled: true,
    })
  })

  it('useVerifyTotp leaves an empty session cache empty', async () => {
    verifyTotp.mockResolvedValueOnce({ backupCodes: [] })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useVerifyTotp(), {
      wrapper: createWrapper(client),
    })

    await result.current.run({ code: '123456' })
    expect(client.getQueryData(['auth', 'session'])).toBeUndefined()
  })

  it('useRegenerateBackupCodes returns the new codes', async () => {
    regenerateBackupCodes.mockResolvedValueOnce({ backupCodes: ['cccc-dddd'] })

    const { result } = renderHook(() => useRegenerateBackupCodes(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run({})).resolves.toMatchObject({
      ok: true,
      value: { backupCodes: ['cccc-dddd'] },
    })
    expect(regenerateBackupCodes).toHaveBeenCalledWith(undefined)
  })

  it('useDisableTwoFactor clears the cached session flag', async () => {
    disableTwoFactor.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'session'], { ...SESSION, is2faEnabled: true })

    const { result } = renderHook(() => useDisableTwoFactor(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ password: 'hunter2', code: '123456' }),
    ).resolves.toMatchObject({ ok: true })
    expect(disableTwoFactor).toHaveBeenCalledWith('hunter2', '123456')
    expect(client.getQueryData(['auth', 'session'])).toMatchObject({
      is2faEnabled: false,
    })
  })
})

describe('passkey management hooks', () => {
  it('usePasskeyRegisterOptions forwards an optional password', async () => {
    passkeyRegisterOptions.mockResolvedValueOnce({
      challenge: 'chal-1',
      options: {},
    })

    const { result } = renderHook(() => usePasskeyRegisterOptions(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ password: 'hunter2' }),
    ).resolves.toMatchObject({ ok: true, value: { challenge: 'chal-1' } })
    expect(passkeyRegisterOptions).toHaveBeenCalledWith('hunter2')
  })

  it('usePasskeyRegisterVerify invalidates the passkey reads', async () => {
    passkeyRegisterVerify.mockResolvedValueOnce({ ok: true, id: 'pk-1' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => usePasskeyRegisterVerify(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        challenge: 'chal-1',
        name: 'Laptop',
        credential: { id: 'cred' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(passkeyRegisterVerify).toHaveBeenCalledWith('chal-1', 'Laptop', {
      id: 'cred',
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['auth', 'two-factor'],
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'passkeys'] })
  })

  it('useDeletePasskey invalidates the passkey reads', async () => {
    deletePasskey.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeletePasskey(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ id: 'pk-1', password: 'hunter2' }),
    ).resolves.toMatchObject({ ok: true })

    expect(deletePasskey).toHaveBeenCalledWith('pk-1', 'hunter2')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'passkeys'] })
  })

  it('useUnlinkProvider invalidates the two-factor projection', async () => {
    unlinkProvider.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUnlinkProvider(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ provider: 'github', password: 'hunter2' }),
    ).resolves.toMatchObject({ ok: true })

    expect(unlinkProvider).toHaveBeenCalledWith('github', 'hunter2')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'two-factor'] })
  })
})
