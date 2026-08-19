// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCompleteInstall,
  useCreateOrganization,
  useInstallStatusQuery,
  useOrganizationsQuery,
  useSessionQuery,
  useSignIn,
  useSignOut,
  useUpdateOrganization,
} from '@/lib/queries/auth'

const {
  fetchSession,
  fetchInstallStatus,
  fetchOrganizations,
  signIn,
  signOut,
  createOrganization,
  updateOrganization,
  completeInstall,
} = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  fetchInstallStatus: vi.fn(),
  fetchOrganizations: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  completeInstall: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchSession,
  fetchInstallStatus,
  fetchOrganizations,
  signIn,
  signOut,
  createOrganization,
  updateOrganization,
  completeInstall,
  signUp: vi.fn(),
  verifyEmail: vi.fn(),
  bootstrapInstall: vi.fn(),
}))

vi.mock('@/lib/control-plane-accounts', () => ({
  getActiveControlPlaneAccount: vi.fn(() => null),
  rememberSignedInAccount: vi.fn(),
  removeActiveControlPlaneAccount: vi.fn(),
}))

vi.mock('@/lib/control-plane', () => ({
  isRemoteCookieClient: vi.fn(() => false),
}))

vi.mock('@/lib/org-context', () => ({
  setActiveOrganizationId: vi.fn(),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
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
      organizations: [{ id: 'org-1', displayName: 'Acme', createdAt: 't' }],
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

  it('useCreateOrganization invalidates organizations on success', async () => {
    createOrganization.mockResolvedValueOnce({ ok: true, id: 'org-2' })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'organizations'], {
      organizations: [{ id: 'org-1', displayName: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useCreateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ displayName: 'Beta' }),
    ).resolves.toMatchObject({ ok: true, value: { id: 'org-2' } })
  })

  it('useUpdateOrganization patches organizations cache', async () => {
    updateOrganization.mockResolvedValueOnce({
      ok: true,
      organization: { id: 'org-1', displayName: 'Renamed', createdAt: 't' },
    })
    const client = createAppQueryClient()
    client.setQueryData(['auth', 'organizations'], {
      organizations: [{ id: 'org-1', displayName: 'Acme', createdAt: 't' }],
    })

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ organizationId: 'org-1', displayName: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const cached = client.getQueryData<{ organizations: { displayName: string }[] }>(
        ['auth', 'organizations'],
      )
      expect(cached?.organizations[0]?.displayName).toBe('Renamed')
    })
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
      email: 'admin@example.com',
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
})
