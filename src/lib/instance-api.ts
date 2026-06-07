export type DaemonConnection = {
  id: string
  connectedAt: string
  hostname: string | null
  nodeId: string | null
  remoteAddress: string | null
}

function fleetKey(conn: DaemonConnection): string {
  const address = conn.remoteAddress?.trim()
  return conn.hostname?.trim() ||
    conn.nodeId?.trim() ||
    (address && address !== '__direct__' ? address : '') ||
    conn.id
}

/** One entry per physical host — keeps the newest socket when duplicates exist. */
export function uniqueFleetConnections(
  connections: DaemonConnection[],
): DaemonConnection[] {
  const byKey = new Map<string, DaemonConnection>()
  for (const conn of connections) {
    const key = fleetKey(conn)
    const existing = byKey.get(key)
    if (!existing || conn.connectedAt > existing.connectedAt) {
      byKey.set(key, conn)
    }
  }
  return [...byKey.values()].sort((a, b) => a.connectedAt.localeCompare(b.connectedAt))
}

/** Display label for a daemon — hostname, then IP, then internal connection id. */
export function daemonLabel(
  daemonId: string,
  connections: DaemonConnection[],
): string {
  const conn = connections.find((entry) => entry.id === daemonId)
  const hostname = conn?.hostname?.trim()
  if (hostname) return hostname
  const address = conn?.remoteAddress?.trim()
  if (address) return address
  return daemonId
}

export type DaemonEvent =
  | { at: string; kind: 'connected'; daemonId: string }
  | { at: string; kind: 'disconnected'; daemonId: string }
  | {
    at: string
    kind: 'message'
    daemonId: string
    direction: 'in' | 'out'
    message: { type: string; [key: string]: unknown }
  }
  | { at: string; kind: 'broadcast'; sent: number; payload: unknown }

export type CommandResult = {
  id: string
  daemonId: string
  command: string
  status: 'pending' | 'done'
  exitCode?: number
  stdout?: string
  stderr?: string
  sentAt: string
  finishedAt?: string
}

export type ServerAddresses = {
  privateIpv4: string[]
  privateIpv6: string[]
  publicIpv4: string[]
  publicIpv6: string[]
}

export type ServerAddressEntry = {
  source: string
  addresses?: ServerAddresses
  error?: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}`)
  }

  return await response.json() as T
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return await apiFetch('/api/health')
}

export async function fetchDaemonConnections(): Promise<{ connections: DaemonConnection[] }> {
  return await apiFetch('/api/daemon/connections')
}

export async function fetchDaemonEvents(limit = 40): Promise<{ events: DaemonEvent[] }> {
  return await apiFetch(`/api/daemon/events?limit=${limit}`)
}

export async function broadcastToDaemon(payload: unknown): Promise<{ ok: boolean; sent: number }> {
  return await apiFetch('/api/daemon/broadcast', {
    method: 'POST',
    body: JSON.stringify({ payload }),
  })
}

export async function fetchCommandResults(limit = 25): Promise<{ commands: CommandResult[] }> {
  return await apiFetch(`/api/daemon/commands?limit=${limit}`)
}

export async function runCommand(
  daemonId: string,
  command: string,
): Promise<{ ok: boolean; commandId: string }> {
  return await apiFetch(`/api/daemon/${encodeURIComponent(daemonId)}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export async function runCommandOnAll(
  command: string,
): Promise<{ ok: boolean; sent: number; commandIds: string[] }> {
  return await apiFetch('/api/daemon/command', {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export async function fetchInstanceAddresses(): Promise<{
  ok: boolean
  source: string
  addresses: ServerAddresses
}> {
  return await apiFetch('/api/instance/addresses')
}

export async function fetchDaemonAddresses(
  daemonId: string,
): Promise<{
  ok: boolean
  daemonId: string
  hostname: string | null
  addresses: ServerAddresses
}> {
  return await apiFetch(`/api/daemon/${encodeURIComponent(daemonId)}/addresses`)
}

export async function fetchAllDaemonAddresses(): Promise<{
  servers: Array<{
    daemonId: string
    hostname: string | null
    addresses?: ServerAddresses
    error?: string
  }>
}> {
  return await apiFetch('/api/daemon/addresses')
}

export async function upgradeSystem(): Promise<{ ok: boolean; commit: string }> {
  return await apiFetch('/api/system/upgrade', {
    method: 'POST',
  })
}

export function formatEvent(
  event: DaemonEvent,
  connections: DaemonConnection[] = [],
): string {
  const time = new Date(event.at).toLocaleTimeString()
  const label = (daemonId: string) => daemonLabel(daemonId, connections)
  switch (event.kind) {
    case 'connected':
      return `${time}  ${label(event.daemonId)} connected`
    case 'disconnected':
      return `${time}  ${label(event.daemonId)} disconnected`
    case 'broadcast':
      return `${time}  broadcast sent=${event.sent} ${JSON.stringify(event.payload)}`
    case 'message': {
      const arrow = event.direction === 'in' ? '←' : '→'
      const detail = event.message.type === 'echo'
        ? JSON.stringify(event.message.payload)
        : event.message.type
      return `${time}  ${label(event.daemonId)} ${arrow} ${detail}`
    }
  }
}
