/** Shared labels and parsers for org → datacenter → server host defaults. */

export const DEFAULT_SSH_PORT = 22

export type HostDefaultsSource = 'server' | 'organization' | 'datacenter'

export type NtpDefaults = {
  enabled?: boolean
  servers?: string[]
  fallbackServers?: string[]
}

export function configuredSourceLabel(
  source: HostDefaultsSource | null | undefined,
): string {
  if (source === 'server') return 'Server override'
  if (source === 'datacenter') return 'Datacenter default'
  if (source === 'organization') return 'Organization default'
  return 'Not set'
}

export function sshPortSourceLabel(
  source: HostDefaultsSource | null | undefined,
): string {
  if (source == null) return `Platform default (${String(DEFAULT_SSH_PORT)})`
  return configuredSourceLabel(source)
}

export function parseSshPortDraft(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || String(parsed) !== trimmed) return null
  if (parsed < 1 || parsed > 65535) return null
  return parsed
}

export function formatNtpHostList(hosts: string[] | undefined): string {
  return (hosts ?? []).join(', ')
}

export function parseNtpHostList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function ntpDefaultsFromDrafts(
  enabled: boolean,
  serversText: string,
  fallbackText: string,
): NtpDefaults {
  const ntp: NtpDefaults = { enabled }
  const servers = parseNtpHostList(serversText)
  const fallbackServers = parseNtpHostList(fallbackText)
  if (servers.length > 0) ntp.servers = servers
  if (fallbackServers.length > 0) ntp.fallbackServers = fallbackServers
  return ntp
}

/** True when the draft would inherit the parent layer (no NTP default). */
export function isEmptyNtpDraft(
  enabled: boolean,
  serversText: string,
  fallbackText: string,
): boolean {
  return (
    !enabled &&
    parseNtpHostList(serversText).length === 0 &&
    parseNtpHostList(fallbackText).length === 0
  )
}
