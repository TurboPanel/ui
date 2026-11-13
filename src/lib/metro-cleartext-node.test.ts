import { describe, expect, it } from 'vitest'
import {
  allowsCleartextMetro,
  metroCleartextAts,
  withDevelopmentClientNativeNetwork,
} from '@/lib/metro-cleartext-node.mjs'

function withUnsetEasEnv(run: () => void) {
  const previousProfile = process.env.EAS_BUILD_PROFILE
  const previousBuild = process.env.EAS_BUILD
  delete process.env.EAS_BUILD_PROFILE
  delete process.env.EAS_BUILD
  try {
    run()
  } finally {
    if (previousProfile === undefined) {
      delete process.env.EAS_BUILD_PROFILE
    } else {
      process.env.EAS_BUILD_PROFILE = previousProfile
    }
    if (previousBuild === undefined) {
      delete process.env.EAS_BUILD
    } else {
      process.env.EAS_BUILD = previousBuild
    }
  }
}

describe('allowsCleartextMetro', () => {
  it('allows local prebuild when EAS env is unset', () => {
    expect(allowsCleartextMetro({})).toBe(true)
  })

  it('allows the EAS development profile', () => {
    expect(
      allowsCleartextMetro({
        EAS_BUILD: 'true',
        EAS_BUILD_PROFILE: 'development',
      }),
    ).toBe(true)
    expect(
      allowsCleartextMetro({ EAS_BUILD_PROFILE: '  development  ' }),
    ).toBe(true)
  })

  it('denies preview, production, and other named profiles', () => {
    expect(allowsCleartextMetro({ EAS_BUILD_PROFILE: 'preview' })).toBe(false)
    expect(allowsCleartextMetro({ EAS_BUILD_PROFILE: 'production' })).toBe(
      false,
    )
    expect(
      allowsCleartextMetro({
        EAS_BUILD: 'true',
        EAS_BUILD_PROFILE: 'production',
      }),
    ).toBe(false)
  })

  it('denies an EAS build that has no profile', () => {
    expect(allowsCleartextMetro({ EAS_BUILD: 'true' })).toBe(false)
  })

  it('defaults to process.env when no map is passed', () => {
    withUnsetEasEnv(() => {
      expect(allowsCleartextMetro()).toBe(true)
    })
  })
})

describe('metroCleartextAts', () => {
  it('allows arbitrary loads, local networking, and .lan HTTP', () => {
    const ats = metroCleartextAts()
    expect(ats.NSAllowsArbitraryLoads).toBe(true)
    expect(ats.NSAllowsLocalNetworking).toBe(true)
    expect(ats.NSExceptionDomains.lan).toEqual({
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    })
    expect(ats.NSExceptionDomains.localhost.NSExceptionAllowsInsecureHTTPLoads)
      .toBe(true)
    expect(ats.NSExceptionDomains.local.NSIncludesSubdomains).toBe(true)
  })
})

describe('withDevelopmentClientNativeNetwork', () => {
  it('returns the same object when cleartext is denied', () => {
    const expo = { name: 'TurboPanel' }
    expect(
      withDevelopmentClientNativeNetwork(expo, { EAS_BUILD_PROFILE: 'production' }),
    ).toBe(expo)
  })

  it('bakes iOS ATS and Android cleartext for a development client', () => {
    const next = withDevelopmentClientNativeNetwork(
      {
        name: 'TurboPanel',
        ios: {
          bundleIdentifier: 'app.turbopanel',
          infoPlist: { ITSAppUsesNonExemptEncryption: false },
        },
        android: { package: 'app.turbopanel' },
      },
      { EAS_BUILD_PROFILE: 'development' },
    )
    const ios = next.ios as {
      bundleIdentifier: string
      infoPlist: { ITSAppUsesNonExemptEncryption: boolean; NSAppTransportSecurity: unknown }
    }
    const android = next.android as { package: string; usesCleartextTraffic: boolean }
    expect(ios.bundleIdentifier).toBe('app.turbopanel')
    expect(ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false)
    expect(ios.infoPlist.NSAppTransportSecurity).toEqual(metroCleartextAts())
    expect(android.package).toBe('app.turbopanel')
    expect(android.usesCleartextTraffic).toBe(true)
  })

  it('creates ios and android objects when they were missing', () => {
    const next = withDevelopmentClientNativeNetwork(
      { slug: 'ui' },
      { EAS_BUILD_PROFILE: 'development' },
    )
    expect(next.slug).toBe('ui')
    const ios = next.ios as { infoPlist: { NSAppTransportSecurity: unknown } }
    const android = next.android as { usesCleartextTraffic: boolean }
    expect(ios.infoPlist.NSAppTransportSecurity).toEqual(metroCleartextAts())
    expect(android.usesCleartextTraffic).toBe(true)
  })

  it('ignores non-object ios, android, and infoPlist values', () => {
    const fromBadIos = withDevelopmentClientNativeNetwork(
      { ios: null, extra: { a: 1 } },
      { EAS_BUILD_PROFILE: 'development' },
    )
    const fromStringIos = withDevelopmentClientNativeNetwork(
      { ios: 'nope' },
      { EAS_BUILD_PROFILE: 'development' },
    )
    const fromBadPlist = withDevelopmentClientNativeNetwork(
      { ios: { infoPlist: ['nope'] }, android: ['nope'] },
      { EAS_BUILD_PROFILE: 'development' },
    )
    const ios = fromBadIos.ios as { infoPlist: { NSAppTransportSecurity: unknown } }
    const stringIos = fromStringIos.ios as { infoPlist: { NSAppTransportSecurity: unknown } }
    const android = fromBadPlist.android as { usesCleartextTraffic: boolean }
    expect(ios.infoPlist.NSAppTransportSecurity).toEqual(metroCleartextAts())
    expect(stringIos.infoPlist.NSAppTransportSecurity).toEqual(metroCleartextAts())
    expect(android.usesCleartextTraffic).toBe(true)
    expect(fromBadIos.extra).toEqual({ a: 1 })
  })

  it('defaults to process.env when no map is passed', () => {
    withUnsetEasEnv(() => {
      const next = withDevelopmentClientNativeNetwork({ slug: 'ui' })
      const android = next.android as { usesCleartextTraffic: boolean }
      expect(android.usesCleartextTraffic).toBe(true)
    })
  })
})
