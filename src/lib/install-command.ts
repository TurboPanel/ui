import {
  formatInstanceDlBase,
  installOriginNeedsInsecureTls,
} from '@/lib/install-tls'

const DEV_HTTPS_PORT = 8443

function findManagedHttpsUrl(managedUrls: string[]): string | null {
  for (const raw of managedUrls) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'https:') return trimmed
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

function browserOrigin(): string | null {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) {
    return null
  }
  const origin = (globalThis.location as Location).origin?.trim()
  if (!origin || origin === 'null') return null
  return origin
}

function originMatchesManagedUrl(origin: string, managed: string): boolean {
  const parsedManaged = parseInstallBaseUrl(managed)
  const parsedOrigin = parseInstallBaseUrl(origin)
  if (!parsedManaged || !parsedOrigin) return false
  return parsedManaged === parsedOrigin
}

function findManagedUrlMatchingBrowser(managedUrls: string[]): string | null {
  const origin = browserOrigin()
  if (!origin) return null
  for (const raw of managedUrls) {
    if (originMatchesManagedUrl(origin, raw)) {
      return parseInstallBaseUrl(raw) ?? origin
    }
  }
  return null
}

export function defaultDevInstallBaseUrl(managedUrls?: string[]): string {
  if (managedUrls && managedUrls.length > 0) {
    const fromBrowser = findManagedUrlMatchingBrowser(managedUrls)
    if (fromBrowser) return fromBrowser
    const httpsUrl = findManagedHttpsUrl(managedUrls)
    if (httpsUrl) return httpsUrl
    const host = parseManagedUrlHost(managedUrls)
    if (host) return httpsDevOriginFromHost(host)
  }
  const origin = browserOrigin()
  if (origin) {
    const parsed = parseInstallBaseUrl(origin)
    if (parsed) return parsed
  }
  return `https://localhost:${DEV_HTTPS_PORT}`
}

export function defaultDevCaddyHttpsBaseUrl(managedUrls?: string[]): string {
  const host = parseManagedUrlHost(managedUrls ?? [])
  if (host) return httpsDevOriginFromHost(host)
  const origin = browserOrigin()
  if (origin) {
    try {
      const hostname = new URL(origin).hostname?.trim()
      if (hostname && hostname !== 'null') return httpsDevOriginFromHost(hostname)
    } catch {
      // fall through
    }
  }
  return `https://localhost:${DEV_HTTPS_PORT}`
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
 * https scheme, no credentials, no path/query/hash.
 */
export function parseInstallBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:') return null
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
  dlBase?: string
}): string {
  const curl = opts.curlInsecure ? 'curl -fsSLk' : 'curl -fsSL'
  const envParts = [
    `TURBOPANEL_LICENSE=${opts.licenseArg}`,
    `TURBOPANEL_HOST=${opts.host}`,
  ]
  if (opts.insecureTls) envParts.push('TURBOPANEL_INSECURE_TLS=1')
  if (opts.dlBase) envParts.push(`TURBOPANEL_DL_BASE=${opts.dlBase}`)
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
  const dlBase = formatInstanceDlBase(base)
  const insecureTls = opts.insecureTls ?? installOriginNeedsInsecureTls(base)
  return buildInstallPipeline({
    curlUrl,
    licenseArg,
    host: base,
    insecureTls,
    curlInsecure: insecureTls,
    dlBase,
  })
}

/**
 * The command `POST /licenses` already checked. An origin edited after
 * minting is not copied into it; the create step sends that origin, and
 * the control plane checks the Platform CA leaf before it returns this
 * string.
 */
export function resolveDisplayedInstallCommand(
  revealed: { licenseId: string; licenseToken: string; installCommand: string },
  _installBaseUrl: string,
): string {
  return revealed.installCommand
}
