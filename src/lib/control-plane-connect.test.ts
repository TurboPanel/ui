import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HA_CONTROL_PLANE_ORIGIN, LOCAL_HTTPS_ORIGIN } from '@/lib/control-plane'
import { connectToControlPlane } from '@/lib/control-plane-connect'
import {
  activateControlPlaneOrigin,
  getActiveControlPlaneOrigin,
  resetControlPlaneStoreForTests,
} from '@/lib/control-plane-accounts'
import { fetchInstallStatus } from '@/lib/instance-api'

vi.mock('@/lib/instance-api', () => ({
  fetchInstallStatus: vi.fn(),
}))

vi.mock('@/lib/auth-accent', () => ({
  applyConsoleChromeRuntime: vi.fn(),
  resolveControlPlaneRuntime: () => 'deno',
}))

describe('connectToControlPlane', () => {
  beforeEach(() => {
    resetControlPlaneStoreForTests()
    vi.mocked(fetchInstallStatus).mockReset()
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
})
