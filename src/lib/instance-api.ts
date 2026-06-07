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

/**
 * Versioned API surface for the developer console. The instance also exposes
 * `/api/client/v1` (end-user UI) and `/api/daemon/v1` (agents); everything the
 * developer console calls lives under `/api/developer/v1`. `/api/health` is the
 * single unversioned probe.
 *
 * The developer surface is dev-only — the instance serves it only when not in a
 * production build (see the instance `src/dev-mode.ts`).
 */
const DEVELOPER_API = '/api/developer/v1'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) detail = body.error
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${path} failed: ${detail}`)
  }

  return await response.json() as T
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return await apiFetch('/api/health')
}

export async function fetchDaemonConnections(): Promise<{ connections: DaemonConnection[] }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/connections`)
}

export async function fetchDaemonEvents(limit = 40): Promise<{ events: DaemonEvent[] }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/events?limit=${limit}`)
}

export async function broadcastToDaemon(payload: unknown): Promise<{ ok: boolean; sent: number }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/broadcast`, {
    method: 'POST',
    body: JSON.stringify({ payload }),
  })
}

export async function fetchCommandResults(limit = 25): Promise<{ commands: CommandResult[] }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/commands?limit=${limit}`)
}

export async function runCommand(
  daemonId: string,
  command: string,
): Promise<{ ok: boolean; commandId: string }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/${encodeURIComponent(daemonId)}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export async function runCommandOnAll(
  command: string,
): Promise<{ ok: boolean; sent: number; commandIds: string[] }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export async function fetchInstanceAddresses(): Promise<{
  ok: boolean
  source: string
  addresses: ServerAddresses
}> {
  return await apiFetch(`${DEVELOPER_API}/instance/addresses`)
}

export async function fetchDaemonAddresses(
  daemonId: string,
): Promise<{
  ok: boolean
  daemonId: string
  hostname: string | null
  addresses: ServerAddresses
}> {
  return await apiFetch(`${DEVELOPER_API}/daemon/${encodeURIComponent(daemonId)}/addresses`)
}

export async function fetchAllDaemonAddresses(): Promise<{
  servers: Array<{
    daemonId: string
    hostname: string | null
    addresses?: ServerAddresses
    error?: string
  }>
}> {
  return await apiFetch(`${DEVELOPER_API}/daemon/addresses`)
}

export type DirtyRepo = {
  repo: string
  path: string
  changes: number
}

export type UpgradeStatus = {
  ok: boolean
  canUpgrade: boolean
  dirty: DirtyRepo[]
}

export async function fetchUpgradeStatus(): Promise<UpgradeStatus> {
  return await apiFetch(`${DEVELOPER_API}/system/upgrade-status`)
}

export type DatabaseStatus = {
  configured: boolean
  connected: boolean
  transport: 'socket' | 'tcp' | null
  user: string | null
  database: string | null
  version: string | null
  error: string | null
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
  return await apiFetch(`${DEVELOPER_API}/database/status`)
}

export type DrizzleStudioStatus = {
  running: boolean
  browserUrl: string
  port: number
}

export async function fetchDrizzleStudioStatus(): Promise<DrizzleStudioStatus> {
  return await apiFetch(`${DEVELOPER_API}/database/studio`)
}

export async function startDrizzleStudio(): Promise<{ ok: boolean; browserUrl: string }> {
  return await apiFetch(`${DEVELOPER_API}/database/studio`, { method: 'POST' })
}

export async function upgradeSystem(): Promise<{ ok: boolean; commit: string }> {
  return await apiFetch(`${DEVELOPER_API}/system/upgrade`, {
    method: 'POST',
  })
}

/** Push the instance host's current daemon build to one agent (dev only). */
export async function syncDevToDaemon(
  daemonId: string,
): Promise<{ ok: boolean; daemonId: string; error?: string }> {
  return await apiFetch(`${DEVELOPER_API}/daemon/${encodeURIComponent(daemonId)}/sync-dev`, {
    method: 'POST',
  })
}

/** Push the current daemon build to every connected agent (dev only). */
export async function syncDevToAllDaemons(): Promise<{
  ok: boolean
  results: Array<{ daemonId: string; ok: boolean; error?: string }>
}> {
  return await apiFetch(`${DEVELOPER_API}/daemon/sync-dev`, {
    method: 'POST',
  })
}

/** Set (or clear, with an empty token) the instance's Cloudflare tunnel token. */
export async function setInstanceTunnelToken(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  return await apiFetch(`${DEVELOPER_API}/instance/tunnel-token`, {
    method: 'POST',
    body: JSON.stringify({ token }),
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
