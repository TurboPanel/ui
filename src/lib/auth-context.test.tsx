// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'

const { fetchSession, fetchInstallStatus, fetchOrganizations } = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  fetchInstallStatus: vi.fn(),
  fetchOrganizations: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchSession, fetchInstallStatus, fetchOrganizations }
})

vi.mock('@/lib/control-plane-accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/control-plane-accounts')>()
  return { ...actual, canQueryControlPlane: () => true }
})

import { AuthProvider, useAuth } from '@/lib/auth-context'

function memoryStorage() {
  const memory = new Map<string, string>()
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  }
}

const status = { isSignupEnabled: true, billingEnabled: false, authProviders: [] }

function renderAuth() {
  const queryClient = createAppQueryClient()
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
  return renderHook(() => useAuth(), { wrapper })
}

describe('AuthProvider first load', () => {
  beforeEach(() => {
    fetchSession.mockReset()
    fetchInstallStatus.mockReset()
    fetchOrganizations.mockReset()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    Reflect.deleteProperty(globalThis, 'sessionStorage')
  })

  it('starts the status and session reads together', async () => {
    fetchInstallStatus.mockReturnValue(new Promise(() => {}))
    fetchSession.mockReturnValue(new Promise(() => {}))
    const { result } = renderAuth()
    await waitFor(() => expect(fetchSession).toHaveBeenCalledTimes(1))
    expect(fetchInstallStatus).toHaveBeenCalledTimes(1)
    expect(result.current.isLoading).toBe(true)
  })

  it('finishes loading once both reads answer, and keeps a 401 as no session', async () => {
    fetchInstallStatus.mockResolvedValue(status)
    fetchSession.mockResolvedValue(null)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toBeNull()
    expect(result.current.isSignupEnabled).toBe(true)
  })

  it('shows the stored sign-in options before status answers, then replaces them', async () => {
    localStorage.setItem(
      'tp.statusSnapshot',
      JSON.stringify({ isSignupEnabled: true, authProviders: ['github'] })
    )
    let answer: (value: typeof status) => void = () => {}
    fetchInstallStatus.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    fetchSession.mockReturnValue(new Promise(() => {}))
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.isSignupEnabled).toBe(true))
    answer({ ...status, isSignupEnabled: false })
    await waitFor(() => expect(result.current.isSignupEnabled).toBe(false))
  })

  it('keeps loading until the live status answers, so a stored answer never decides a redirect', async () => {
    localStorage.setItem('tp.statusSnapshot', JSON.stringify({ isSignupEnabled: true }))
    let answer: (value: unknown) => void = () => {}
    fetchInstallStatus.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    fetchSession.mockResolvedValue(null)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.isSignupEnabled).toBe(true))
    await waitFor(() => expect(fetchSession).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.needsInstall).toBe(false)
    answer({ isSignupEnabled: false, needsInstall: true })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.needsInstall).toBe(true)
  })

  it('remembers a signed-in browser and forgets it after a 401', async () => {
    fetchInstallStatus.mockResolvedValue(status)
    fetchSession.mockResolvedValue({ user: { id: 'u1' } })
    const first = renderAuth()
    await waitFor(() => expect(localStorage.getItem('tp.hadSession')).toBe('1'))
    first.unmount()

    fetchSession.mockResolvedValue(null)
    renderAuth()
    await waitFor(() => expect(localStorage.getItem('tp.hadSession')).toBeNull())
  })

  it('keeps the status answer for the next visit', async () => {
    fetchInstallStatus.mockResolvedValue({ ...status, authProviders: ['google'] })
    fetchSession.mockResolvedValue(null)
    renderAuth()
    await waitFor(() => expect(localStorage.getItem('tp.statusSnapshot')).toContain('google'))
  })

  it('reports a failed read as a bootstrap error', async () => {
    fetchInstallStatus.mockRejectedValue(new Error('status down'))
    fetchSession.mockResolvedValue(null)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.bootstrapError).toBe('status down'))
  })

  it('sends a signed-out visitor to sign-in and an installed one to their organization', async () => {
    fetchInstallStatus.mockResolvedValue(status)
    fetchSession.mockResolvedValue(null)
    const out = renderAuth()
    await waitFor(() => expect(out.result.current.isLoading).toBe(false))
    await expect(out.result.current.resolveDashboardHref()).resolves.toBe('/sign-in')
    out.unmount()

    fetchSession.mockResolvedValue({ user: { id: 'u1' } })
    fetchOrganizations.mockResolvedValue({ organizations: [{ id: 'org1' }] })
    const inn = renderAuth()
    await waitFor(() => expect(inn.result.current.session).not.toBeNull())
    await expect(inn.result.current.resolveDashboardHref()).resolves.toMatch(/^\//)
  })

  it('falls back to the organization list when discovery fails', async () => {
    fetchInstallStatus.mockResolvedValue(status)
    fetchSession.mockResolvedValue({ user: { id: 'u1' } })
    fetchOrganizations.mockRejectedValue(new Error('nope'))
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.session).not.toBeNull())
    await expect(result.current.resolveDashboardHref()).resolves.toBe('/organizations')
  })

  it('refreshes status and session, clears the session and handles a 401', async () => {
    fetchInstallStatus.mockResolvedValue(status)
    fetchSession.mockResolvedValue({ user: { id: 'u1' } })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.session).not.toBeNull())
    await expect(result.current.refreshInstallStatus()).resolves.toBe(false)
    await expect(result.current.refreshSession()).resolves.toEqual({ user: { id: 'u1' } })
    fetchSession.mockResolvedValue(null)
    await result.current.handleUnauthorized()
    await waitFor(() => expect(result.current.session).toBeNull())
    result.current.clearSession()
    expect(result.current.session).toBeNull()
  })
})
