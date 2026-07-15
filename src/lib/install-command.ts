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

function encodeLicenseArg(licenseId: string, licenseToken: string): string {
  const combined = `${licenseId}:${licenseToken}`
  return btoa(combined)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/** Rebuild a dev install command (run.sh + downloads on the same public host). */
export function buildInstallCommandWithBaseUrl(opts: {
  licenseId: string
  licenseToken: string
  baseUrl: string
}): string {
  const base = trimTrailingSlash(opts.baseUrl.trim())
  const licenseArg = encodeLicenseArg(opts.licenseId, opts.licenseToken)
  if (base.startsWith('http://')) {
    return (
      `curl -fsSL ${base}/run.sh | ` +
      `sh -s -- --license ${licenseArg} --host ${base}`
    )
  }
  return (
    `curl -fsSLk ${base}/run.sh | ` +
    `sh -s -- --license ${licenseArg} --host ${base} --insecure-tls`
  )
}

export function resolveDisplayedInstallCommand(
  revealed: { licenseId: string; licenseToken: string; installCommand: string },
  installBaseUrl: string,
): string {
  const trimmed = installBaseUrl.trim()
  if (!trimmed) return revealed.installCommand
  return buildInstallCommandWithBaseUrl({
    licenseId: revealed.licenseId,
    licenseToken: revealed.licenseToken,
    baseUrl: trimmed,
  })
}
