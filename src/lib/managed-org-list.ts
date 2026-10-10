/**
 * Pure labels for the org-wide managed services table (`/managed`).
 */

import type { ManagedListRecord, ManagedServiceEngine } from '@/lib/managed-services'
import { managedCatalogEntryForCode } from '@/lib/managed-services'
import {
  DEFAULT_MANAGED_INGRESS_PORTS,
  type ManagedIngressPorts,
  managedIngressPortForEngine,
} from '@/lib/managed-ingress-ports'

export const MANAGED_SHARED_LOOPBACK_HOST = '127.0.0.1'

export const DELETED_PROJECT_LABEL = '(deleted project)'

function engineBackendPort(engine: ManagedServiceEngine): number | null {
  return managedCatalogEntryForCode(engine)?.defaultPort ?? null
}

/**
 * Resolve the shared ProxySQL listener clients dial on the host.
 *
 * Prefers API `host`/`port` when they already carry the ingress listener.
 * Remaps stale engine backend ports (5432 / 3306) using org ingress settings.
 */
export function resolveManagedSharedListener(
  row: Pick<
    ManagedListRecord,
    'host' | 'port' | 'serverId' | 'engine' | 'status'
  >,
  ingressPorts: ManagedIngressPorts = DEFAULT_MANAGED_INGRESS_PORTS,
): { host: string; port: number } | null {
  if (!row.serverId || !row.engine) return null

  const ingressPort = managedIngressPortForEngine(row.engine, ingressPorts)

  if (row.host && row.port != null) {
    const backend = engineBackendPort(row.engine)
    if (backend !== null && row.port === backend) {
      return { host: MANAGED_SHARED_LOOPBACK_HOST, port: ingressPort }
    }
    return { host: row.host, port: row.port }
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
  ingressPorts?: ManagedIngressPorts,
): string {
  const endpoint = resolveManagedSharedListener(row, ingressPorts)
  if (!endpoint) return 'Not exposed'
  return `${endpoint.host}:${endpoint.port}`
}

export function managedOrgListProjectEnvironmentLabel(
  row: Pick<ManagedListRecord, 'projectName' | 'environmentName' | 'projectId'>,
): string {
  const project = row.projectName?.trim() || DELETED_PROJECT_LABEL
  const environment = row.environmentName?.trim()
  if (environment) return `${project} / ${environment}`
  return project
}

export function managedOrgListServerPresentation(
  row: Pick<ManagedListRecord, 'serverName' | 'serverId'>,
): Readonly<{ display: string; accessibilityLabel: string }> {
  const name = row.serverName?.trim()
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
