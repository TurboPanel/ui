/**
 * Node-resolvable Metro cleartext policy for `app.config.ts`.
 *
 * Expo compiles the config to `app.config.js` and evaluates it with Node ESM,
 * which does not resolve an extensionless TypeScript import. Named
 * `metro-cleartext-node` so Vite/Metro do not pick this file when resolving a
 * `@/lib/metro-cleartext` module later.
 *
 * Development-client binaries load the JS bundle from Metro over plaintext
 * HTTP (`:8081`). Caddy TLS is `:8443` — Metro never speaks HTTPS, so
 * `https://host:8081` always fails. iOS App Transport Security still blocks
 * `http://studio.lan:8081` unless Info.plist allows it: `.lan` is not a Bonjour
 * `.local` name, so `NSAllowsLocalNetworking` alone is not enough.
 */

/**
 * @typedef {Readonly<Record<string, string | undefined>>} EnvMap
 */

/**
 * @param {EnvMap} [env]
 */
export function allowsCleartextMetro(env = process.env) {
  const profile = typeof env.EAS_BUILD_PROFILE === 'string'
    ? env.EAS_BUILD_PROFILE.trim()
    : ''
  if (profile === 'development') return true
  if (profile.length > 0) return false
  return env.EAS_BUILD !== 'true'
}

function insecureHttpDomain() {
  return {
    NSExceptionAllowsInsecureHTTPLoads: true,
    NSIncludesSubdomains: true,
  }
}

/** iOS Info.plist `NSAppTransportSecurity` for a development-client binary. */
export function metroCleartextAts() {
  return {
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      localhost: insecureHttpDomain(),
      lan: insecureHttpDomain(),
      local: insecureHttpDomain(),
    },
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Bake Metro HTTP exceptions into development-client native config.
 * Production / preview profiles stay ATS-strict and cleartext-off.
 *
 * @param {Record<string, unknown>} expo
 * @param {EnvMap} [env]
 */
export function withDevelopmentClientNativeNetwork(expo, env = process.env) {
  if (!allowsCleartextMetro(env)) return expo

  const ios = isPlainObject(expo.ios) ? expo.ios : {}
  const android = isPlainObject(expo.android) ? expo.android : {}
  const infoPlist = isPlainObject(ios.infoPlist) ? ios.infoPlist : {}
  return {
    ...expo,
    ios: {
      ...ios,
      infoPlist: {
        ...infoPlist,
        NSAppTransportSecurity: metroCleartextAts(),
      },
    },
    android: {
      ...android,
      usesCleartextTraffic: true,
    },
  }
}
