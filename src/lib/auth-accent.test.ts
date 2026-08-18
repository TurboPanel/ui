import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { colors } from '@/lib/theme'

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

function createDocumentMock() {
  const properties = new Map<string, string>()
  return {
    documentElement: {
      style: {
        setProperty: (name: string, value: string) => {
          properties.set(name, value)
        },
        getPropertyValue: (name: string) => properties.get(name) ?? '',
      },
    },
    _properties: properties,
  }
}

describe('auth-accent', () => {
  let sessionStorageMock: ReturnType<typeof createSessionStorage>
  let documentMock: ReturnType<typeof createDocumentMock>

  beforeEach(() => {
    platform.OS = 'web'
    sessionStorageMock = createSessionStorage()
    documentMock = createDocumentMock()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorageMock,
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: documentMock,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'sessionStorage')
    Reflect.deleteProperty(globalThis, 'document')
    vi.resetModules()
  })

  async function loadAuthAccent() {
    return import('@/lib/auth-accent')
  }

  describe('authAccentForRuntime', () => {
    it('returns HA blue theme for workers', async () => {
      const { authAccentForRuntime } = await loadAuthAccent()
      expect(authAccentForRuntime('workers')).toEqual({
        accent: colors.blue,
        onAccent: colors.buttonTextOnBlue,
        bgActive: colors.bgActiveBlue,
        label: 'High Availability',
      })
    })

    it('returns self-hosted green theme for deno and unknown', async () => {
      const { authAccentForRuntime } = await loadAuthAccent()
      const expected = {
        accent: colors.green,
        onAccent: colors.buttonText,
        bgActive: colors.bgActive,
        label: 'Self-hosted',
      }
      expect(authAccentForRuntime('deno')).toEqual(expected)
      expect(authAccentForRuntime(undefined)).toEqual(expected)
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
    it('uses explicit runtime before stored value', async () => {
      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'workers')
      const { authSpinnerColor } = await loadAuthAccent()
      expect(authSpinnerColor('deno')).toBe(colors.green)
      expect(authSpinnerColor('workers')).toBe(colors.blue)
    })

    it('falls back to stored runtime and muted when unknown', async () => {
      const { authSpinnerColor } = await loadAuthAccent()
      expect(authSpinnerColor(undefined)).toBe(colors.textMuted)

      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'workers')
      expect(authSpinnerColor(undefined)).toBe(colors.blue)

      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'deno')
      expect(authSpinnerColor(undefined)).toBe(colors.green)
    })
  })

  describe('applyConsoleChromeRuntime', () => {
    it('persists runtime and sets CSS variables on web', async () => {
      const { applyConsoleChromeRuntime } = await loadAuthAccent()
      applyConsoleChromeRuntime('workers')

      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBe('workers')
      expect(documentMock._properties.get('--tp-chrome-accent')).toBe(colors.blue)
      expect(documentMock._properties.get('--tp-chrome-bg-active')).toBe(
        colors.bgActiveBlue,
      )
      expect(documentMock._properties.get('--tp-chrome-on-accent')).toBe(
        colors.buttonTextOnBlue,
      )
    })

    it('no-ops for unknown runtime, native, or missing document', async () => {
      const { applyConsoleChromeRuntime } = await loadAuthAccent()
      applyConsoleChromeRuntime(undefined)
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBeNull()

      applyConsoleChromeRuntime('deno')
      sessionStorageMock.clear()
      documentMock._properties.clear()

      platform.OS = 'ios'
      applyConsoleChromeRuntime('deno')
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBeNull()

      platform.OS = 'web'
      Reflect.deleteProperty(globalThis, 'document')
      applyConsoleChromeRuntime('deno')
      expect(sessionStorageMock.getItem('tp.controlPlaneRuntime')).toBeNull()
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
      const { applyConsoleChromeRuntime } = await loadAuthAccent()
      expect(() => applyConsoleChromeRuntime('deno')).not.toThrow()
    })
  })

  describe('hydrateConsoleChromeFromStorage', () => {
    it('applies stored runtime on import and when called explicitly', async () => {
      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'deno')
      const mod = await loadAuthAccent()
      expect(documentMock._properties.get('--tp-chrome-accent')).toBe(colors.green)

      sessionStorageMock.setItem('tp.controlPlaneRuntime', 'workers')
      mod.hydrateConsoleChromeFromStorage()
      expect(documentMock._properties.get('--tp-chrome-accent')).toBe(colors.blue)
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
