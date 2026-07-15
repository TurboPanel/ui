/** Exact or one-label wildcard DNS coverage (mirrors instance `coversHostname`). */
export function coversHostname(dnsNames: string[], hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (host.length === 0) return false
  for (const raw of dnsNames) {
    const name = raw.trim().toLowerCase().replace(/\.$/, '')
    if (name === host) return true
    if (name.startsWith('*.')) {
      const suffix = name.slice(1)
      if (!host.endsWith(suffix)) continue
      const label = host.slice(0, host.length - suffix.length)
      if (label.length > 0 && !label.includes('.')) return true
    }
  }
  return false
}

export function coversAllHostnames(
  dnsNames: string[],
  hostnames: string[],
): boolean {
  if (hostnames.length === 0) return false
  return hostnames.every((h) => coversHostname(dnsNames, h))
}
