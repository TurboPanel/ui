/**
 * Fleet / detail connection display — mirrors instance
 * `mapServerDaemonStatusFromColumns` (`daemonStatus: unknown` when the server
 * has never transitioned). UI labels that as Initializing so a just-registered
 * colocated host is not shown as Offline while the daemon is still connecting.
 */

export type ServerConnectionStatus = 'online' | 'offline' | 'initializing'

export type ServerConnectionPresence = Readonly<{
  connected: boolean
  statusChangedAt: string | null
}>

export function resolveServerConnectionStatus(
  input: ServerConnectionPresence,
): ServerConnectionStatus {
  if (input.connected) return 'online'
  const changedAt = input.statusChangedAt
  if (changedAt == null || changedAt.trim() === '') return 'initializing'
  return 'offline'
}

export function serverConnectionStatusLabel(
  status: ServerConnectionStatus,
): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'offline':
      return 'Offline'
    case 'initializing':
      return 'Initializing'
  }
}
