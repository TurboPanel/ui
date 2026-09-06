import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HA_CONTROL_PLANE_ORIGIN,
  LOCAL_HTTP_ORIGIN,
  LOCAL_HTTPS_ORIGIN,
  canBootstrapAgainstControlPlane,
  controlPlaneKindForOrigin,
  formatControlPlaneHostLabel,
  isMetroWebOrigin,
  isRemoteCookieClient,
  isStandaloneExpoWeb,
  parseControlPlaneOrigin,
  readBrowserLocationOrigin,
  readControlPlaneClientEnv,
  resolveApiUrl,
  resolveControlPlaneClientKind,
  setControlPlaneEnvReader,
  usesSameOriginApi,
} from '@/lib/control-plane'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'

const nativeEnv = {
  platformOS: 'ios',
  isDev: true,
  locationOrigin: null,
} as const

const metroEnv = {
  platformOS: 'web',
  isDev: true,
  locationOrigin: 'http://localhost:8081',
} as const

const caddyEnv = {
  platformOS: 'web',
  isDev: true,
  locationOrigin: 'https://localhost:8443',
} as const

const prodWebEnv = {
  platformOS: 'web',
  isDev: false,
  locationOrigin: 'https://turbopanel.app',
} as const

describe('resolveControlPlaneClientKind', () => {
  it('treats production web as same-origin', () => {
    expect(resolveControlPlaneClientKind(prodWebEnv)).toBe('same-origin')
  })

  it('treats Caddy-proxied dev web as same-origin', () => {
    expect(resolveControlPlaneClientKind(caddyEnv)).toBe('same-origin')
    expect(
      resolveControlPlaneClientKind({
        ...caddyEnv,
        locationOrigin: LOCAL_HTTP_ORIGIN,
      }),
    ).toBe('same-origin')
  })

  it('treats Metro web as standalone Expo web', () => {
    expect(resolveControlPlaneClientKind(metroEnv)).toBe('metro-web')
    expect(
      resolveControlPlaneClientKind({
        ...metroEnv,
        locationOrigin: 'http://203.0.113.20:8081',
      }),
    ).toBe('metro-web')
  })

  it('treats iOS and Android as native', () => {
    expect(resolveControlPlaneClientKind(nativeEnv)).toBe('native')
    expect(
      resolveControlPlaneClientKind({ ...nativeEnv, platformOS: 'android' }),
    ).toBe('native')
  })
})

describe('isMetroWebOrigin', () => {
  it('matches Expo Metro ports and exp.direct hosts', () => {
    expect(isMetroWebOrigin('http://localhost:8081')).toBe(true)
    expect(isMetroWebOrigin('http://127.0.0.1:8082')).toBe(true)
    expect(isMetroWebOrigin('http://localhost:19000')).toBe(true)
    expect(isMetroWebOrigin('http://127.0.0.1:19006')).toBe(true)
    expect(isMetroWebOrigin('https://exp.direct')).toBe(true)
    expect(isMetroWebOrigin('https://abc.exp.direct')).toBe(true)
    expect(isMetroWebOrigin(LOCAL_HTTPS_ORIGIN)).toBe(false)
    expect(isMetroWebOrigin(null)).toBe(false)
  })

  it('returns false for unparseable origins', () => {
    expect(isMetroWebOrigin('not a url')).toBe(false)
  })
})

describe('client-kind helpers', () => {
  it('classifies same-origin, Metro web, and native from the env', () => {
    expect(usesSameOriginApi(caddyEnv)).toBe(true)
    expect(isStandaloneExpoWeb(caddyEnv)).toBe(false)
    expect(isRemoteCookieClient(caddyEnv)).toBe(false)

    expect(usesSameOriginApi(metroEnv)).toBe(false)
    expect(isStandaloneExpoWeb(metroEnv)).toBe(true)
    expect(isRemoteCookieClient(metroEnv)).toBe(false)

    expect(usesSameOriginApi(nativeEnv)).toBe(false)
    expect(isStandaloneExpoWeb(nativeEnv)).toBe(false)
    expect(isRemoteCookieClient(nativeEnv)).toBe(true)
  })

  it('reads the registered env reader by default', () => {
    setControlPlaneEnvReader(() => metroEnv)
    try {
      expect(readControlPlaneClientEnv()).toEqual(metroEnv)
      expect(usesSameOriginApi()).toBe(false)
      expect(isStandaloneExpoWeb()).toBe(true)
      expect(isRemoteCookieClient()).toBe(false)
      expect(canBootstrapAgainstControlPlane()).toBe(false)
    } finally {
      setControlPlaneEnvReader(() => ({
        platformOS: 'web',
        isDev: typeof __DEV__ !== 'undefined' && __DEV__,
        locationOrigin: readBrowserLocationOrigin(),
      }))
    }
  })
})

describe('readBrowserLocationOrigin', () => {
  it('returns null for opaque, blank, or missing origins', () => {
    vi.stubGlobal('location', { origin: 'null' })
    expect(readBrowserLocationOrigin()).toBeNull()

    vi.stubGlobal('location', { origin: '   ' })
    expect(readBrowserLocationOrigin()).toBeNull()

    vi.stubGlobal('location', { origin: undefined })
    expect(readBrowserLocationOrigin()).toBeNull()
  })

  it('returns a trimmed browser origin', () => {
    vi.stubGlobal('location', { origin: ` ${LOCAL_HTTPS_ORIGIN} ` })
    expect(readBrowserLocationOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
  })
})

describe('default control-plane env reader', () => {
  it('treats an unset __DEV__ identifier as not-dev web', async () => {
    vi.resetModules()
    delete (globalThis as { __DEV__?: boolean }).__DEV__
    vi.stubGlobal('location', { origin: LOCAL_HTTPS_ORIGIN })
    const { readControlPlaneClientEnv: readFreshEnv } = await import(
      '@/lib/control-plane'
    )
    expect(readFreshEnv()).toEqual({
      platformOS: 'web',
      isDev: false,
      locationOrigin: LOCAL_HTTPS_ORIGIN,
    })
  })
})

describe('canBootstrapAgainstControlPlane', () => {
  it('allows same-origin web without a stored origin', () => {
    expect(canBootstrapAgainstControlPlane(caddyEnv, null)).toBe(true)
    expect(canBootstrapAgainstControlPlane(prodWebEnv, null)).toBe(true)
  })

  it('blocks Metro web even when an origin is set', () => {
    expect(
      canBootstrapAgainstControlPlane(metroEnv, HA_CONTROL_PLANE_ORIGIN),
    ).toBe(false)
  })

  it('requires an origin on native', () => {
    expect(canBootstrapAgainstControlPlane(nativeEnv, null)).toBe(false)
    expect(
      canBootstrapAgainstControlPlane(nativeEnv, LOCAL_HTTPS_ORIGIN),
    ).toBe(true)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  setControlPlaneEnvReader(() => ({
    platformOS: 'web',
    isDev: typeof __DEV__ !== 'undefined' && __DEV__,
    locationOrigin: readBrowserLocationOrigin(),
  }))
})

describe('parseControlPlaneOrigin', () => {
  it('normalizes a valid URL to its origin', () => {
    expect(parseControlPlaneOrigin('https://panel.example.com/sign-in')).toEqual({
      ok: true,
      origin: 'https://panel.example.com',
    })
  })

  it('rejects empty and non-http URLs', () => {
    expect(parseControlPlaneOrigin('').ok).toBe(false)
    expect(parseControlPlaneOrigin('   ').ok).toBe(false)
    expect(parseControlPlaneOrigin('ftp://panel.example.com').ok).toBe(false)
    expect(parseControlPlaneOrigin('not a url').ok).toBe(false)
  })

  it('rejects http(s) URLs that parse without a hostname', () => {
    const OriginalURL = globalThis.URL
    vi.stubGlobal(
      'URL',
      class EmptyHostURL {
        protocol = 'https:'
        hostname = ''
        origin = 'https://empty-host.example'
        constructor(input: string | URL, base?: string | URL) {
          if (String(input) !== 'https://empty-host.example') {
            return new OriginalURL(input, base)
          }
        }
      },
    )
    const result = parseControlPlaneOrigin('https://empty-host.example')
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new TypeError('expected parse to fail for an empty hostname')
    }
    expect(result.error).toBe('Enter a valid http(s) URL.')
  })
})

describe('resolveApiUrl', () => {
  it('keeps relative paths on same-origin web', () => {
    expect(resolveApiUrl('/api/health', HA_CONTROL_PLANE_ORIGIN, caddyEnv)).toBe(
      '/api/health',
    )
  })

  it('prefixes the active origin on native', () => {
    expect(
      resolveApiUrl('/api/client/v1/status', LOCAL_HTTPS_ORIGIN, nativeEnv),
    ).toBe(`${LOCAL_HTTPS_ORIGIN}/api/client/v1/status`)
  })

  it('normalizes trailing and missing slashes on native', () => {
    expect(
      resolveApiUrl('api/health', `${LOCAL_HTTPS_ORIGIN}/`, nativeEnv),
    ).toBe(`${LOCAL_HTTPS_ORIGIN}/api/health`)
  })

  it('throws on native when no origin is set', () => {
    expect(() => resolveApiUrl('/api/health', null, nativeEnv)).toThrow(
      new TypeError('Control plane origin is not set'),
    )
  })
})

describe('control-plane labels', () => {
  it('marks the HA origin and formats hosts', () => {
    expect(controlPlaneKindForOrigin(HA_CONTROL_PLANE_ORIGIN)).toBe('ha')
    expect(controlPlaneKindForOrigin(LOCAL_HTTPS_ORIGIN)).toBe('self-hosted')
    expect(formatControlPlaneHostLabel(HA_CONTROL_PLANE_ORIGIN)).toBe(
      HA_PRODUCT_NAME,
    )
    expect(formatControlPlaneHostLabel(LOCAL_HTTPS_ORIGIN)).toBe('localhost:8443')
    expect(formatControlPlaneHostLabel('not a url')).toBe('not a url')
  })
})

describe('readEnvControlPlaneOrigin', () => {
  it('returns null when the env var is unset or invalid', async () => {
    const { readEnvControlPlaneOrigin } = await import('@/lib/control-plane')
    const previous = process.env.EXPO_PUBLIC_CONTROL_PLANE_URL
    delete process.env.EXPO_PUBLIC_CONTROL_PLANE_URL
    expect(readEnvControlPlaneOrigin()).toBeNull()
    process.env.EXPO_PUBLIC_CONTROL_PLANE_URL = 'not a url'
    expect(readEnvControlPlaneOrigin()).toBeNull()
    process.env.EXPO_PUBLIC_CONTROL_PLANE_URL = LOCAL_HTTPS_ORIGIN
    expect(readEnvControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_CONTROL_PLANE_URL
    } else {
      process.env.EXPO_PUBLIC_CONTROL_PLANE_URL = previous
    }
  })
})
