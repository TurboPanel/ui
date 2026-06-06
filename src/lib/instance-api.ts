export type DaemonConnection = {
  id: string
  connectedAt: string
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

export function formatEvent(event: DaemonEvent): string {
  const time = new Date(event.at).toLocaleTimeString()
  switch (event.kind) {
    case 'connected':
      return `${time}  ${event.daemonId} connected`
    case 'disconnected':
      return `${time}  ${event.daemonId} disconnected`
    case 'broadcast':
      return `${time}  broadcast sent=${event.sent} ${JSON.stringify(event.payload)}`
    case 'message': {
      const arrow = event.direction === 'in' ? '←' : '→'
      const detail = event.message.type === 'echo'
        ? JSON.stringify(event.message.payload)
        : event.message.type
      return `${time}  ${event.daemonId} ${arrow} ${detail}`
    }
  }
}
