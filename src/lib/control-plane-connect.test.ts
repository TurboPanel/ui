import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HA_CONTROL_PLANE_ORIGIN, LOCAL_HTTPS_ORIGIN } from '@/lib/control-plane'
import { connectToControlPlane } from '@/lib/control-plane-connect'
import {
  activateControlPlaneOrigin,
  getActiveControlPlaneOrigin,
  getControlPlaneAccounts,
  resetControlPlaneStoreForTests,
} from '@/lib/control-plane-accounts'
import { fetchInstallStatus } from '@/lib/instance-api'

const authAccentMocks = vi.hoisted(() => ({
  applyConsoleChromeRuntime: vi.fn(),
  resolveControlPlaneRuntime: vi.fn((): 'deno' | 'workers' | undefined => 'deno'),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchInstallStatus: vi.fn(),
}))

vi.mock('@/lib/auth-accent', () => ({
  applyConsoleChromeRuntime: authAccentMocks.applyConsoleChromeRuntime,
  resolveControlPlaneRuntime: authAccentMocks.resolveControlPlaneRuntime,
}))

describe('connectToControlPlane', () => {
  beforeEach(() => {
    resetControlPlaneStoreForTests()
    vi.mocked(fetchInstallStatus).mockReset()
    authAccentMocks.applyConsoleChromeRuntime.mockReset()
    authAccentMocks.resolveControlPlaneRuntime.mockReset()
    authAccentMocks.resolveControlPlaneRuntime.mockReturnValue('deno')
  })

  it('rejects an invalid URL without probing', async () => {
    const result = await connectToControlPlane('not-a-url')
    expect(result.ok).toBe(false)
    expect(fetchInstallStatus).not.toHaveBeenCalled()
    expect(getActiveControlPlaneOrigin()).toBeNull()
  })

  it('activates the origin and returns status on success', async () => {
    vi.mocked(fetchInstallStatus).mockResolvedValue({
      runtime: 'deno',
      isSignupEnabled: false,
      needsInstall: false,
    })
    const result = await connectToControlPlane(`${LOCAL_HTTPS_ORIGIN}/`)
    expect(result).toEqual({
      ok: true,
      origin: LOCAL_HTTPS_ORIGIN,
      status: {
        runtime: 'deno',
        isSignupEnabled: false,
        needsInstall: false,
      },
    })
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    expect(authAccentMocks.resolveControlPlaneRuntime).toHaveBeenCalled()
    expect(authAccentMocks.applyConsoleChromeRuntime).toHaveBeenCalledWith('deno')
  })

  it('skips console chrome when status does not resolve a runtime', async () => {
    authAccentMocks.resolveControlPlaneRuntime.mockReturnValue(undefined)
    vi.mocked(fetchInstallStatus).mockResolvedValue({
      isSignupEnabled: false,
      needsInstall: false,
    })
    const result = await connectToControlPlane(LOCAL_HTTPS_ORIGIN)
    expect(result.ok).toBe(true)
    expect(authAccentMocks.applyConsoleChromeRuntime).not.toHaveBeenCalled()
  })

  it('returns a field error when status cannot be reached', async () => {
    vi.mocked(fetchInstallStatus).mockRejectedValue(
      new Error('/api/client/v1/status failed: HTTP 502'),
    )
    const result = await connectToControlPlane(LOCAL_HTTPS_ORIGIN)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('HTTP 502')
    }
    expect(getActiveControlPlaneOrigin()).toBeNull()
  })

  it('restores the previous origin when a new URL cannot be reached', async () => {
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    vi.mocked(fetchInstallStatus).mockRejectedValue(
      new Error('/api/client/v1/status failed: HTTP 502'),
    )
    const result = await connectToControlPlane(LOCAL_HTTPS_ORIGIN)
    expect(result.ok).toBe(false)
    expect(getActiveControlPlaneOrigin()).toBe(HA_CONTROL_PLANE_ORIGIN)
  })

  it('keeps an existing account and restores the previous origin when reconnect fails', async () => {
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    vi.mocked(fetchInstallStatus).mockRejectedValue(
      new Error('/api/client/v1/status failed: HTTP 503'),
    )
    const result = await connectToControlPlane(HA_CONTROL_PLANE_ORIGIN)
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new TypeError('expected reconnect failure')
    }
    expect(result.error).toContain('HTTP 503')
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    expect(
      getControlPlaneAccounts().some((account) => account.origin === HA_CONTROL_PLANE_ORIGIN),
    ).toBe(true)
  })

  it('returns a generic error when fetch throws a non-Error', async () => {
    vi.mocked(fetchInstallStatus).mockRejectedValue('offline')
    const result = await connectToControlPlane(LOCAL_HTTPS_ORIGIN)
    expect(result).toEqual({
      ok: false,
      error: 'Could not reach that control plane.',
    })
    expect(getActiveControlPlaneOrigin()).toBeNull()
  })

  it('keeps an existing origin when reconnect fails with no previous active origin', async () => {
    resetControlPlaneStoreForTests({
      accounts: [
        {
          origin: LOCAL_HTTPS_ORIGIN,
          kind: 'self-hosted',
          email: null,
          runtime: null,
          lastOrgId: null,
        },
      ],
      activeOrigin: null,
    })
    vi.mocked(fetchInstallStatus).mockRejectedValue('offline')
    const result = await connectToControlPlane(LOCAL_HTTPS_ORIGIN)
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new TypeError('expected reconnect failure without a previous origin')
    }
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    expect(getControlPlaneAccounts()).toHaveLength(1)
  })
})
