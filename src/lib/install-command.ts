export function defaultDevInstallBaseUrl(): string {
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = globalThis.location as Location
    const origin = location.origin?.trim()
    if (origin && origin !== 'null') return origin
  }
  return 'https://localhost:8443'
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/** Rebuild a dev install command (run.sh + downloads on the same public host). */
export function buildInstallCommandWithBaseUrl(opts: {
  licenseId: string
  licenseToken: string
  baseUrl: string
}): string {
  const base = trimTrailingSlash(opts.baseUrl.trim())
  const licenseArg = `${opts.licenseId}:${opts.licenseToken}`
  return (
    `curl -fsSLk ${base}/run.sh | ` +
    `sh -s -- --license ${licenseArg} --host ${base} --binary-url ${base}/downloads/daemon --insecure-tls`
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
