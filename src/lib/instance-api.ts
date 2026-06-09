export type DaemonConnection = {
  id: string
  connectedAt: string
  hostname: string | null
  serverId: string | null
  remoteAddress: string | null
}

function fleetKey(conn: DaemonConnection): string {
  const address = conn.remoteAddress?.trim()
  return conn.serverId?.trim() ||
    conn.hostname?.trim() ||
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
const CLIENT_API = '/api/client/v1'

export type SessionInfo = {
  userId: string | null
  username: string | null
  email: string | null
  role: string | null
  needsInstall: boolean
  organizationId: string | null
}

export type InstallStatus = {
  needsInstall: boolean
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetch(`${CLIENT_API}/auth/session`, {
    headers: { 'content-type': 'application/json' },
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) detail = body.error
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/auth/session failed: ${detail}`)
  }

  const body = await response.json() as SessionInfo & { ok: true }
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    needsInstall: body.needsInstall ?? false,
    organizationId: body.organizationId ?? null,
  }
}

export async function signIn(
  username: string,
  password: string,
): Promise<SessionInfo> {
  const body = await apiFetch<SessionInfo & { ok: true }>(`${CLIENT_API}/auth/sign-in`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    needsInstall: body.needsInstall ?? false,
    organizationId: body.organizationId ?? null,
  }
}

export async function bootstrapInstall(
  username: string,
  password: string,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/install/bootstrap`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function signOut(): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-out`, {
    method: 'POST',
  })
}

export async function fetchInstallStatus(): Promise<InstallStatus> {
  return await apiFetch(`${CLIENT_API}/install/status`)
}

export async function completeInstall(body: {
  hostUsername: string
  hostPassword: string
  superadminEmail: string
  superadminPassword: string
}): Promise<SessionInfo & { organizationId: string }> {
  const response = await apiFetch<SessionInfo & { ok: true; organizationId: string }>(
    `${CLIENT_API}/install`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return {
    userId: response.userId ?? null,
    username: response.username ?? null,
    email: response.email ?? null,
    role: response.role ?? null,
    needsInstall: false,
    organizationId: response.organizationId,
  }
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

export type OrganizationRecord = {
  id: string
  displayName: string
  slug: string | null
}

export async function fetchOrganizations(): Promise<{ organizations: OrganizationRecord[] }> {
  return await apiFetch(`${DEVELOPER_API}/organizations`)
}

export type ServerRecord = {
  id: string
  displayName: string | null
  organizationId: string | null
  options: Record<string, unknown> | null
  createdAt: string
}

export async function fetchServers(): Promise<{ servers: ServerRecord[] }> {
  return await apiFetch(`${DEVELOPER_API}/servers`)
}

export async function createServer(body: {
  displayName?: string | null
  options?: Record<string, unknown> | null
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${DEVELOPER_API}/servers`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateServer(
  id: string,
  body: {
    displayName?: string | null
    organizationId?: string | null
    options?: Record<string, unknown> | null
  },
): Promise<{ ok: true }> {
  return await apiFetch(`${DEVELOPER_API}/servers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
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

export async function startDrizzleStudio(): Promise<{
  ok: boolean
  browserUrl: string
  port: number
}> {
  return await apiFetch(`${DEVELOPER_API}/database/studio`, { method: 'POST' })
}

export const DRIZZLE_STUDIO_PROXY_PORT = 8444

/**
 * Drizzle Studio UI URL for local.drizzle.studio.
 * LAN access uses Caddy on :8444 (?host=&port=). localhost uses forwarded :4983 (?port=).
 */
export function drizzleStudioOpenUrl(opts?: {
  hostname?: string
  localPort?: number
  proxyPort?: number
}): string {
  const base = 'https://local.drizzle.studio'
  const hostname = opts?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const proxyPort = opts?.proxyPort ?? DRIZZLE_STUDIO_PROXY_PORT
  const localPort = opts?.localPort ?? 4983

  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const params = new URLSearchParams({ host: hostname, port: String(proxyPort) })
    return `${base}?${params.toString()}`
  }

  if (localPort !== 4983) {
    return `${base}?port=${localPort}`
  }
  return base
}

const DRIZZLE_LOCAL_PORT_KEY = 'turbopanel:drizzle-studio-local-port'

export function loadDrizzleLocalPort(): number {
  if (typeof window === 'undefined') return 4983
  const raw = window.localStorage.getItem(DRIZZLE_LOCAL_PORT_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : 4983
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4983
}

export function saveDrizzleLocalPort(port: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DRIZZLE_LOCAL_PORT_KEY, String(port))
}

export async function upgradeSystem(): Promise<{ ok: boolean; commit: string }> {
  return await apiFetch(`${DEVELOPER_API}/system/upgrade`, {
    method: 'POST',
  })
}

/** Wipe dev Postgres, repush schema.ts, and restart the instance. */
export async function resetDevInstance(): Promise<{ ok: true; restarted: boolean }> {
  return await apiFetch(`${DEVELOPER_API}/system/reset-dev`, {
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

export const EXPO_PTY_WS_PATH = '/ws/developer/v1/expo-pty'

export async function fetchExpoStatus(): Promise<{ running: boolean }> {
  return await apiFetch(`${DEVELOPER_API}/expo/status`)
}

export async function restartExpoService(): Promise<{ ok: boolean; error?: string }> {
  return await apiFetch(`${DEVELOPER_API}/expo/restart`, { method: 'POST' })
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
