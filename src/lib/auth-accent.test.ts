import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navyPalette } from '@/lib/theme-palettes'

const platform = vi.hoisted(() => ({ OS: 'web' as string }))

vi.mock('react-native', () => ({
  Platform: platform,
}))

function createSessionStorage() {
  const memory = new Map<string, string>()
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
    clear: () => {
      memory.clear()
    },
  }
}

describe('auth-accent', () => {
  let sessionStorageMock: ReturnType<typeof createSessionStorage>

  beforeEach(() => {
    platform.OS = 'web'
    sessionStorageMock = createSessionStorage()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorageMock,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'sessionStorage')
    vi.resetModules()
  })

  async function loadAuthAccent() {
    return import('@/lib/auth-accent')
  }

  describe('authAccentForRuntime', () => {
    it('uses the Navy brand blue for both runtimes, with white text on it', async () => {
      const { authAccentForRuntime } = await loadAuthAccent()
      for (const runtime of ['workers', 'deno', undefined] as const) {
        const theme = authAccentForRuntime(runtime)
        expect(theme.accent).toBe(navyPalette.accent)
        expect(theme.onAccent).toBe(navyPalette.accentInk)
        expect(theme.bgActive).toBe(navyPalette.accentSoft)
      }
    })

    it('labels High Availability for workers and Self-hosted otherwise', async () => {
      const { authAccentForRuntime } = await loadAuthAccent()
      expect(authAccentForRuntime('workers').label).toBe('High Availability')
      expect(authAccentForRuntime('deno').label).toBe('Self-hosted')
      expect(authAccentForRuntime(undefined).label).toBe('Self-hosted')
    })

    it('returns real hex values, safe for colour maths', async () => {
      const { authAccentForRuntime } = await loadAuthAccent()
      expect(authAccentForRuntime('deno').accent).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  describe('readStoredControlPlaneRuntime', () => {
    it('reads deno and workers from sessionStorage on web', async () => {
      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'deno')
      const { readStoredControlPlaneRuntime } = await loadAuthAccent()
      expect(readStoredControlPlaneRuntime()).toBe('deno')

      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'workers')
      expect(readStoredControlPlaneRuntime()).toBe('workers')
    })

    it('returns undefined for invalid or missing values', async () => {
      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'invalid')
      const { readStoredControlPlaneRuntime } = await loadAuthAccent()
      expect(readStoredControlPlaneRuntime()).toBeUndefined()
    })

    it('returns undefined on native and when sessionStorage is missing', async () => {
      const { readStoredControlPlaneRuntime } = await loadAuthAccent()
      platform.OS = 'ios'
      expect(readStoredControlPlaneRuntime()).toBeUndefined()

      platform.OS = 'web'
      Reflect.deleteProperty(globalThis, 'sessionStorage')
      expect(readStoredControlPlaneRuntime()).toBeUndefined()
    })

    it('returns undefined when sessionStorage throws', async () => {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: () => {
            throw new Error('blocked')
          },
        },
      })
      const { readStoredControlPlaneRuntime } = await loadAuthAccent()
      expect(readStoredControlPlaneRuntime()).toBeUndefined()
    })
  })

  describe('authSpinnerColor', () => {
    it('is the brand blue whatever the runtime', async () => {
      const { authSpinnerColor } = await loadAuthAccent()
      expect(authSpinnerColor()).toBe(navyPalette.brand)
    })
  })

  describe('rememberControlPlaneRuntime', () => {
    it('persists deno and workers on web', async () => {
      const { rememberControlPlaneRuntime } = await loadAuthAccent()
      rememberControlPlaneRuntime('workers')
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBe('workers')
      rememberControlPlaneRuntime('deno')
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBe('deno')
    })

    it('no-ops for unknown runtime and on native', async () => {
      const { rememberControlPlaneRuntime } = await loadAuthAccent()
      rememberControlPlaneRuntime(undefined)
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBeNull()

      platform.OS = 'ios'
      rememberControlPlaneRuntime('deno')
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBeNull()
    })

    it('skips persist when sessionStorage is missing on web', async () => {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
      const { rememberControlPlaneRuntime } = await loadAuthAccent()
      expect(() => rememberControlPlaneRuntime('workers')).not.toThrow()
    })

    it('ignores sessionStorage write failures', async () => {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: {
          setItem: () => {
            throw new Error('quota')
          },
        },
      })
      const { rememberControlPlaneRuntime } = await loadAuthAccent()
      expect(() => rememberControlPlaneRuntime('deno')).not.toThrow()
    })
  })

  describe('resolveControlPlaneRuntime', () => {
    it('prefers explicit runtime from status', async () => {
      const { resolveControlPlaneRuntime } = await loadAuthAccent()
      expect(resolveControlPlaneRuntime({ runtime: 'workers' })).toBe('workers')
      expect(resolveControlPlaneRuntime({ runtime: 'deno' })).toBe('deno')
    })

    it('infers deno from install fields and workers from bare status', async () => {
      const { resolveControlPlaneRuntime } = await loadAuthAccent()
      expect(resolveControlPlaneRuntime({ needsInstall: false })).toBe('deno')
      expect(resolveControlPlaneRuntime({ isInstallMode: true })).toBe('deno')
      expect(resolveControlPlaneRuntime({ runtime: undefined })).toBe('workers')
    })

    it('returns undefined for nullish status', async () => {
      const { resolveControlPlaneRuntime } = await loadAuthAccent()
      expect(resolveControlPlaneRuntime(null)).toBeUndefined()
      expect(resolveControlPlaneRuntime(undefined)).toBeUndefined()
    })
  })
})
