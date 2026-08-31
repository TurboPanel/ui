import type {
  FleetServerUsageRecord,
  ServerHostResources,
} from '@/lib/instance-api'
import { resolveServerConnectionStatus } from '@/lib/server-connection-status'

/** Fields needed to roll up fleet capacity + online count. */
export type FleetCapacityServer = Readonly<{
  id: string
  connected: boolean
  statusChangedAt: string | null
  resources: ServerHostResources | null
}>

export type FleetStatus = {
  serverCount: number
  onlineCount: number
  offlineCount: number
  initializingCount: number
  totalCores: number | null
  totalMemoryBytes: number | null
}

export function formatSiBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = value
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(n)} ${units[unit]}`
  let digits = 2
  if (n >= 100) digits = 0
  else if (n >= 10) digits = 1
  return `${n.toFixed(digits)} ${units[unit]}`
}

export function formatCoresTotal(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function indexFleetUsageByServerId(
  rows: readonly FleetServerUsageRecord[] | undefined,
): Map<string, FleetServerUsageRecord> {
  const map = new Map<string, FleetServerUsageRecord>()
  for (const entry of rows ?? []) {
    map.set(entry.serverId, entry)
  }
  return map
}

function memoryTotalFromUsage(
  usage: FleetServerUsageRecord | undefined,
): number | null {
  if (!usage || usage.sampleCount <= 0) return null
  // v2 stores the total directly — no used+available reconstruction.
  const total = usage.values.memoryTotalBytes
  if (total == null || !Number.isFinite(total)) return null
  return total > 0 ? total : null
}

function sumSocketTotals(
  sockets: NonNullable<ServerHostResources['cpus']>,
  field: 'cores' | 'threads',
  fallback: 'cores' | 'threads',
): number | null {
  let total = 0
  let known = false
  for (const socket of sockets) {
    const n = socket[field]?.total ?? socket[fallback]?.total
    if (n != null && Number.isFinite(n) && n > 0) {
      total += n
      known = true
    }
  }
  return known ? total : null
}

/** Physical cores for inventory totals; falls back to threads when unknown. */
export function serverInventoryCpuCores(
  server: FleetCapacityServer,
): number | null {
  const sockets = server.resources?.cpus
  if (sockets && sockets.length > 0) {
    return sumSocketTotals(sockets, 'cores', 'threads')
  }
  return null
}

/** Logical CPUs for load-average bars (`load / threads`). */
export function serverCpuThreads(server: FleetCapacityServer): number | null {
  const sockets = server.resources?.cpus
  if (sockets && sockets.length > 0) {
    return sumSocketTotals(sockets, 'threads', 'cores')
  }
  return null
}

function serverMemoryTotal(
  server: FleetCapacityServer,
  usage: FleetServerUsageRecord | undefined,
): number | null {
  const fromResources = server.resources?.memory?.totalBytes
  if (fromResources != null && Number.isFinite(fromResources) && fromResources > 0) {
    return fromResources
  }
  return memoryTotalFromUsage(usage)
}

export function computeFleetStatus(
  servers: readonly FleetCapacityServer[],
  usageByServerId: ReadonlyMap<string, FleetServerUsageRecord>,
): FleetStatus {
  let cores = 0
  let coresKnown = false
  let memory = 0
  let memoryKnown = false
  let onlineCount = 0
  let offlineCount = 0
  let initializingCount = 0

  for (const server of servers) {
    switch (resolveServerConnectionStatus(server)) {
      case 'online':
        onlineCount += 1
        break
      case 'offline':
        offlineCount += 1
        break
      case 'initializing':
        initializingCount += 1
        break
    }
    const c = serverInventoryCpuCores(server)
    if (c != null) {
      cores += c
      coresKnown = true
    }
    const mem = serverMemoryTotal(server, usageByServerId.get(server.id))
    if (mem != null) {
      memory += mem
      memoryKnown = true
    }
  }

  return {
    serverCount: servers.length,
    onlineCount,
    offlineCount,
    initializingCount,
    totalCores: coresKnown ? cores : null,
    totalMemoryBytes: memoryKnown ? memory : null,
  }
}

function fleetNotOnlineParts(status: FleetStatus): string[] {
  const parts: string[] = []
  if (status.offlineCount > 0) {
    parts.push(`${status.offlineCount} offline`)
  }
  if (status.initializingCount > 0) {
    parts.push(`${status.initializingCount} initializing`)
  }
  return parts
}

/** Secondary copy beside the green online count; omitted when every host is online. */
export function fleetServersStatSuffix(status: FleetStatus): string | undefined {
  const parts = fleetNotOnlineParts(status)
  if (parts.length === 0) return
  return parts.join(' · ')
}

export function fleetStatusAccessibilityLabel(status: FleetStatus): string {
  return [
    `${status.onlineCount} of ${status.serverCount} servers online`,
    ...fleetNotOnlineParts(status),
    `total ${formatCoresTotal(status.totalCores)} cores`,
    `total ${formatSiBytes(status.totalMemoryBytes)} RAM`,
  ].join(', ')
}
