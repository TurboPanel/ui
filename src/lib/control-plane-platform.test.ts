import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'web' as string }))

vi.mock('react-native', () => ({
  Platform: platform,
}))

describe('control-plane-platform bootstrap', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'location')
    delete (globalThis as { __DEV__?: boolean }).__DEV__
    vi.resetModules()
  })

  it('registers Platform and browser origin with the control-plane env reader', async () => {
    vi.resetModules()
    platform.OS = 'ios'
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: 'https://localhost:8443' },
    })
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = true

    await import('@/lib/control-plane-platform')
    const { readControlPlaneClientEnv } = await import('@/lib/control-plane')

    expect(readControlPlaneClientEnv()).toEqual({
      platformOS: 'ios',
      isDev: true,
      locationOrigin: 'https://localhost:8443',
    })
  })

  it('returns null location origin when window.location is unavailable', async () => {
    vi.resetModules()
    platform.OS = 'android'
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false

    await import('@/lib/control-plane-platform')
    const { readControlPlaneClientEnv } = await import('@/lib/control-plane')

    expect(readControlPlaneClientEnv()).toEqual({
      platformOS: 'android',
      isDev: false,
      locationOrigin: null,
    })
  })
})
