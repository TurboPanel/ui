const DEV_HTTPS_PORT = 8443
const DEV_HTTP_PORT = 8880

function findManagedUrlByScheme(
  managedUrls: string[],
  scheme: 'http' | 'https',
): string | null {
  for (const raw of managedUrls) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === `${scheme}:`) return trimmed
    } catch {
      // skip invalid entries
    }
  }
  return null
}

function parseManagedUrlHost(managedUrls: string[]): string | null {
  for (const raw of managedUrls) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      const hostname = new URL(trimmed).hostname?.trim()
      if (hostname) return hostname
    } catch {
      // skip invalid entries
    }
  }
  return null
}

function httpsDevOriginFromHost(host: string): string {
  return `https://${host}:${DEV_HTTPS_PORT}`
}

function httpDevOriginFromHost(host: string): string {
  return `http://${host}:${DEV_HTTP_PORT}`
}

export function defaultDevInstallBaseUrl(managedUrls?: string[]): string {
  if (managedUrls && managedUrls.length > 0) {
    const httpsUrl = findManagedUrlByScheme(managedUrls, 'https')
    if (httpsUrl) return httpsUrl
    const host = parseManagedUrlHost(managedUrls)
    if (host) return httpsDevOriginFromHost(host)
  }
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = globalThis.location as Location
    const origin = location.origin?.trim()
    if (origin && origin !== 'null') return origin
  }
  return `https://localhost:${DEV_HTTPS_PORT}`
}

export function defaultDevInstallHttpBaseUrl(managedUrls?: string[]): string {
  if (managedUrls && managedUrls.length > 0) {
    const httpUrl = findManagedUrlByScheme(managedUrls, 'http')
    if (httpUrl) return httpUrl
    const host = parseManagedUrlHost(managedUrls)
    if (host) return httpDevOriginFromHost(host)
  }
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = globalThis.location as Location
    const hostname = location.hostname?.trim()
    if (hostname && hostname !== 'null') {
      return httpDevOriginFromHost(hostname)
    }
  }
  return `http://localhost:${DEV_HTTP_PORT}`
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function hasNonOriginUrlParts(url: URL): boolean {
  return (
    (url.pathname !== '/' && url.pathname !== '') ||
    Boolean(url.search) ||
    Boolean(url.hash)
  )
}

function isBareTurbopanelShOrigin(trimmed: string): boolean {
  if (trimmed === 'turbopanel.sh') return true
  try {
    const url = new URL(trimmed)
    return (
      url.hostname === 'turbopanel.sh' &&
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !hasNonOriginUrlParts(url) &&
      (url.port === '' || url.port === '443' || url.port === '80')
    )
  } catch {
    return false
  }
}

/** Curl target for the installer script: bare `turbopanel.sh` on the CDN, otherwise origin + `/run.sh`. */
function formatInstallScriptCurlUrl(origin: string): string {
  const trimmed = trimTrailingSlash(origin.trim())
  if (isBareTurbopanelShOrigin(trimmed)) {
    return 'turbopanel.sh'
  }
  return `${trimmed}/run.sh`
}

function encodeLicenseArg(licenseId: string, licenseToken: string): string {
  const combined = `${licenseId}:${licenseToken}`
  return btoa(combined)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/**
 * Validate an edited install base URL with the same origin rules as the
 * instance `parseInstallBaseUrl` / `publicUrlEntryToInstallOrigin` helpers:
 * http(s) scheme, no credentials, no path/query/hash.
 *
 * Dev UI rebuilds allow plaintext `http:` (mirrors the instance
 * `{ allowHttp: true }` developer-surface allowance).
 */
export function parseInstallBaseUrl(
  value: string | undefined,
  opts: { allowHttp?: boolean } = {},
): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.protocol === 'http:' && !opts.allowHttp) return null
    const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '')
    if (!host || host === 'null') return null
    if (url.username || url.password) return null
    if (hasNonOriginUrlParts(url)) return null
    return trimTrailingSlash(url.origin)
  } catch {
    return null
  }
}

/**
 * Build the install pipeline. Values are emitted unquoted; callers must pass a
 * validated origin and base64url license (no shell metacharacters).
 */
function buildInstallPipeline(opts: {
  curlUrl: string
  licenseArg: string
  host: string
  insecureTls?: boolean
  curlInsecure?: boolean
}): string {
  const curl = opts.curlInsecure ? 'curl -fsSLk' : 'curl -fsSL'
  const envParts = [
    `TURBOPANEL_LICENSE=${opts.licenseArg}`,
    `TURBOPANEL_HOST=${opts.host}`,
  ]
  if (opts.insecureTls) envParts.push('TURBOPANEL_INSECURE_TLS=1')
  return `${curl} ${opts.curlUrl} | ${envParts.join(' ')} sh`
}

/**
 * Rebuild a dev install command (installer script + downloads on the same public host).
 * `baseUrl` must already be a validated origin from {@link parseInstallBaseUrl}.
 */
export function buildInstallCommandWithBaseUrl(opts: {
  licenseId: string
  licenseToken: string
  baseUrl: string
  /** Self-signed / platform-CA HTTPS: curl -k + TURBOPANEL_INSECURE_TLS. */
  insecureTls?: boolean
}): string {
  const base = trimTrailingSlash(opts.baseUrl.trim())
  const licenseArg = encodeLicenseArg(opts.licenseId, opts.licenseToken)
  const curlUrl = formatInstallScriptCurlUrl(base)
  if (base.startsWith('http://')) {
    return buildInstallPipeline({
      curlUrl,
      licenseArg,
      host: base,
    })
  }
  const insecureTls = opts.insecureTls ?? true
  return buildInstallPipeline({
    curlUrl,
    licenseArg,
    host: base,
    insecureTls,
    curlInsecure: insecureTls,
  })
}

export function resolveDisplayedInstallCommand(
  revealed: { licenseId: string; licenseToken: string; installCommand: string },
  installBaseUrl: string,
): string {
  const trimmed = installBaseUrl.trim()
  if (!trimmed) return revealed.installCommand

  // Reject untrusted / injectable edits — fall back to the server-built command.
  const validated = parseInstallBaseUrl(trimmed, { allowHttp: true })
  if (!validated) return revealed.installCommand

  return buildInstallCommandWithBaseUrl({
    licenseId: revealed.licenseId,
    licenseToken: revealed.licenseToken,
    baseUrl: validated,
  })
}
