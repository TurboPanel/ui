/**
 * Node-resolvable Android user-CA trust for `app.config.ts`.
 *
 * API 24+ does not trust a user-installed Platform CA unless the app's
 * network security config names both the system store and user anchors.
 * The origin is chosen at runtime (`https://<LAN host>:8443`), so the
 * trust anchors sit on the base config and cover every dial. Development
 * builds still permit Metro cleartext; shipped builds do not.
 */
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { allowsCleartextMetro } from './metro-cleartext-node.mjs'

/**
 * `@expo/config-plugins` is a dependency of `expo`, not of this package, so
 * Vite cannot import it as a bare specifier. pnpm links it beside the real
 * Expo package inside the virtual store, not next to the `node_modules/expo`
 * symlink, so resolution starts from that real path when prebuild runs.
 */
function configPlugins() {
  const expoPackage = realpathSync(
    path.join(process.cwd(), 'node_modules/expo/package.json'),
  )
  return createRequire(expoPackage)('@expo/config-plugins')
}

const NETWORK_SECURITY_CONFIG_XML = 'network_security_config.xml'

/**
 * @param {boolean} permitCleartext
 */
export function networkSecurityConfigXml(permitCleartext) {
  const cleartext = permitCleartext ? 'true' : 'false'
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="${cleartext}">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`
}

/**
 * @param {unknown} androidManifest
 */
export function applyAndroidNetworkSecurityConfig(androidManifest) {
  if (
    androidManifest === null ||
    typeof androidManifest !== 'object' ||
    !('manifest' in androidManifest)
  ) {
    return androidManifest
  }
  const manifest = /** @type {{ application?: { $?: Record<string, string> }[] }} */ (
    androidManifest
  ).manifest
  const applications = manifest?.application
  const application = applications?.[0]
  if (!applications || !application) return androidManifest
  const nextApplications = applications.slice()
  nextApplications[0] = {
    ...application,
    $: {
      ...(application.$ ?? {}),
      'android:networkSecurityConfig': '@xml/network_security_config',
    },
  }
  return {
    ...androidManifest,
    manifest: {
      ...manifest,
      application: nextApplications,
    },
  }
}

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
export function androidUserCaTrustPlugin(config) {
  const { withAndroidManifest, withDangerousMod } = configPlugins()
  const withManifest = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidNetworkSecurityConfig(cfg.modResults)
    return cfg
  })
  return withDangerousMod(withManifest, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      )
      await mkdir(xmlDir, { recursive: true })
      await writeFile(
        path.join(xmlDir, NETWORK_SECURITY_CONFIG_XML),
        networkSecurityConfigXml(allowsCleartextMetro(process.env)),
      )
      return cfg
    },
  ])
}

/**
 * Register the user-CA trust plugin on every Android build, including
 * production and preview. Cleartext stays a development-client concern.
 *
 * @param {Record<string, unknown>} expo
 */
export function withAndroidUserCaTrust(expo) {
  const plugins = Array.isArray(expo.plugins) ? [...expo.plugins] : []
  if (!plugins.includes(androidUserCaTrustPlugin)) {
    plugins.push(androidUserCaTrustPlugin)
  }
  return {
    ...expo,
    plugins,
  }
}
