/**
 * Pure labels for the org-wide managed services table (`/managed`).
 */

import type { ManagedListRecord } from '@/lib/managed-services'
import {
  DEFAULT_MANAGED_INGRESS_PORTS,
  type ManagedIngressPorts,
  managedIngressPortForEngine,
} from '@/lib/managed-ingress-ports'

export const MANAGED_SHARED_LOOPBACK_HOST = '127.0.0.1'

export const DELETED_PROJECT_LABEL = '(deleted project)'

/** Shown until org managed-defaults (ingress ports) are known — never platform guesses. */
export const MANAGED_SHARED_LISTENER_PENDING_LABEL = '—'

/** `GET /organizations/:id/managed` list row (API uses `*Name`; DB joins use `*DisplayName`). */
export type ManagedOrgListWireRow = {
  projectId?: string
  projectName?: string | null
  projectDisplayName?: string | null
  environmentName?: string | null
  environmentDisplayName?: string | null
  serverId?: string | null
  serverName?: string | null
  serverDisplayName?: string | null
}

export function managedListProjectName(row: ManagedOrgListWireRow): string | null {
  return row.projectName?.trim() || row.projectDisplayName?.trim() || null
}

function managedListEnvironmentName(row: ManagedOrgListWireRow): string | null {
  return (
    row.environmentName?.trim() || row.environmentDisplayName?.trim() || null
  )
}

function managedListServerName(row: ManagedOrgListWireRow): string | null {
  return row.serverName?.trim() || row.serverDisplayName?.trim() || null
}

function isSharedIngressEndpoint(
  host: string,
  port: number,
  ingressPort: number,
): boolean {
  return host === MANAGED_SHARED_LOOPBACK_HOST && port === ingressPort
}

/**
 * Resolve the shared ProxySQL listener clients dial on the host.
 *
 * Prefers API `host`/`port` when they already carry the ingress listener.
 * Remaps stale residual host/port (engine backends, wrong hosts) to loopback ingress.
 */
export function resolveManagedSharedListener(
  row: Pick<
    ManagedListRecord,
    'host' | 'port' | 'serverId' | 'engine' | 'status'
  >,
  ingressPorts: ManagedIngressPorts | null = DEFAULT_MANAGED_INGRESS_PORTS,
): { host: string; port: number } | null {
  if (!row.serverId || !row.engine) return null
  if (ingressPorts === null) return null

  const ingressPort = managedIngressPortForEngine(row.engine, ingressPorts)

  if (row.host && row.port != null) {
    if (isSharedIngressEndpoint(row.host, row.port, ingressPort)) {
      return { host: row.host, port: row.port }
    }
    return { host: MANAGED_SHARED_LOOPBACK_HOST, port: ingressPort }
  }

  if (row.status === 'ready' || row.status === 'stopped') {
    return { host: MANAGED_SHARED_LOOPBACK_HOST, port: ingressPort }
  }

  return null
}

export function managedSharedListenerLabel(
  row: Pick<
    ManagedListRecord,
    'host' | 'port' | 'serverId' | 'engine' | 'status'
  >,
  ingressPorts?: ManagedIngressPorts | null,
): string {
  if (ingressPorts === null) return MANAGED_SHARED_LISTENER_PENDING_LABEL
  const endpoint = resolveManagedSharedListener(row, ingressPorts)
  if (!endpoint) return 'Not exposed'
  return `${endpoint.host}:${endpoint.port}`
}

export function managedOrgListProjectEnvironmentLabel(
  row: ManagedOrgListWireRow,
): string {
  const project = managedListProjectName(row) || DELETED_PROJECT_LABEL
  const environment = managedListEnvironmentName(row)
  if (environment) return `${project} / ${environment}`
  return project
}

export function managedOrgListServerPresentation(
  row: ManagedOrgListWireRow,
): Readonly<{ display: string; accessibilityLabel: string }> {
  const name = managedListServerName(row)
  const id = row.serverId?.trim()
  if (name) {
    return {
      display: name,
      accessibilityLabel: id ? `${name} (${id})` : name,
    }
  }
  if (id) {
    return { display: id, accessibilityLabel: id }
  }
  return { display: '—', accessibilityLabel: 'No server' }
}
