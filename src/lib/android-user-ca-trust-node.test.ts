import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  androidUserCaTrustPlugin,
  applyAndroidNetworkSecurityConfig,
  networkSecurityConfigXml,
  withAndroidUserCaTrust,
} from '@/lib/android-user-ca-trust-node.mjs'
import { withDevelopmentClientNativeNetwork } from '@/lib/metro-cleartext-node.mjs'

function expoConfigPlugins() {
  const expoPackage = realpathSync(
    path.join(process.cwd(), 'node_modules/expo/package.json'),
  )
  return createRequire(expoPackage)('@expo/config-plugins') as {
    evalModsAsync: (
      config: Record<string, unknown>,
      props: { projectRoot: string; platforms: string[] },
    ) => Promise<unknown>
    withDefaultBaseMods: (config: Record<string, unknown>) => Record<string, unknown>
  }
}

async function evaluateAndroidTrustPlugin(profile: 'production' | 'development') {
  const previousProfile = process.env.EAS_BUILD_PROFILE
  const previousBuild = process.env.EAS_BUILD
  process.env.EAS_BUILD = 'true'
  process.env.EAS_BUILD_PROFILE = profile
  const root = await mkdtemp(path.join(tmpdir(), 'tp-android-trust-'))
  const android = path.join(root, 'android')
  try {
    await mkdir(path.join(android, 'app/src/main'), { recursive: true })
    await writeFile(
      path.join(android, 'app/src/main/AndroidManifest.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.turbopanel">
  <application android:name=".MainApplication" />
</manifest>
`,
    )
    const { evalModsAsync, withDefaultBaseMods } = expoConfigPlugins()
    await evalModsAsync(
      withDefaultBaseMods(
        androidUserCaTrustPlugin({
          name: 'TurboPanel',
          slug: 'ui',
          android: { package: 'app.turbopanel' },
        }),
      ),
      { projectRoot: root, platforms: ['android'] },
    )
    const xml = await readFile(
      path.join(android, 'app/src/main/res/xml/network_security_config.xml'),
      'utf8',
    )
    const manifest = await readFile(
      path.join(android, 'app/src/main/AndroidManifest.xml'),
      'utf8',
    )
    return { xml, manifest }
  } finally {
    if (previousProfile === undefined) delete process.env.EAS_BUILD_PROFILE
    else process.env.EAS_BUILD_PROFILE = previousProfile
    if (previousBuild === undefined) delete process.env.EAS_BUILD
    else process.env.EAS_BUILD = previousBuild
    await rm(root, { recursive: true, force: true })
  }
}

function trustAnchors(xml: string) {
  expect(xml).toContain('<certificates src="system" />')
  expect(xml).toContain('<certificates src="user" />')
}

describe('networkSecurityConfigXml', () => {
  it('trusts the system store and user-installed Platform CA roots', () => {
    trustAnchors(networkSecurityConfigXml(false))
    trustAnchors(networkSecurityConfigXml(true))
  })

  it('permits Metro cleartext only when asked', () => {
    expect(networkSecurityConfigXml(false)).toContain(
      'cleartextTrafficPermitted="false"',
    )
    expect(networkSecurityConfigXml(true)).toContain(
      'cleartextTrafficPermitted="true"',
    )
  })
})

describe('applyAndroidNetworkSecurityConfig', () => {
  it('points the application at the network security config', () => {
    const manifest = {
      manifest: {
        application: [{ $: { 'android:name': '.MainApplication' } }],
      },
    }
    const applied = applyAndroidNetworkSecurityConfig(manifest) as {
      manifest: { application: { $: Record<string, string> }[] }
    }
    expect(applied.manifest.application[0]?.$['android:networkSecurityConfig'])
      .toBe('@xml/network_security_config')
    expect(applied.manifest.application[0]?.$['android:name']).toBe(
      '.MainApplication',
    )
  })
})

describe('withAndroidUserCaTrust', () => {
  it('registers user-CA trust on shipped builds and keeps Metro cleartext in development', () => {
    const expoBase = {
      name: 'TurboPanel',
      plugins: ['expo-router'],
      android: { package: 'app.turbopanel' },
    }
    const shipped = withAndroidUserCaTrust(
      withDevelopmentClientNativeNetwork(expoBase, {
        EAS_BUILD: 'true',
        EAS_BUILD_PROFILE: 'production',
      }),
    ) as typeof expoBase & {
      plugins: unknown[]
      android?: { package: string; usesCleartextTraffic?: boolean }
    }
    expect(shipped.plugins).toContain(androidUserCaTrustPlugin)
    expect(shipped.plugins).toContain('expo-router')
    expect(shipped.android?.usesCleartextTraffic).toBeUndefined()
    trustAnchors(networkSecurityConfigXml(false))

    const development = withAndroidUserCaTrust(
      withDevelopmentClientNativeNetwork(expoBase, {
        EAS_BUILD_PROFILE: 'development',
      }),
    ) as typeof expoBase & {
      plugins: unknown[]
      android: { package: string; usesCleartextTraffic: boolean }
    }
    expect(development.plugins).toContain(androidUserCaTrustPlugin)
    expect(development.android.usesCleartextTraffic).toBe(true)
    trustAnchors(networkSecurityConfigXml(true))
  })
})

describe('androidUserCaTrustPlugin', () => {
  it('writes user and system trust anchors into a production Android project', async () => {
    const { xml, manifest } = await evaluateAndroidTrustPlugin('production')
    trustAnchors(xml)
    expect(xml).toContain('cleartextTrafficPermitted="false"')
    expect(manifest).toContain(
      'android:networkSecurityConfig="@xml/network_security_config"',
    )
    expect(manifest).toContain('android:name=".MainApplication"')
  })

  it('keeps Metro cleartext on a development Android project', async () => {
    const { xml } = await evaluateAndroidTrustPlugin('development')
    trustAnchors(xml)
    expect(xml).toContain('cleartextTrafficPermitted="true"')
  })
})
