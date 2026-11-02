import type { InstanceTunnelStatus, TunnelConnectorStatus } from '@/lib/instance-api'

export type TunnelTone = 'ok' | 'pending' | 'danger' | 'muted'

export const CONNECTOR_STATUS_PRESENTATION: Readonly<
  Record<TunnelConnectorStatus, { label: string; tone: TunnelTone }>
> = {
  'not-installed': { label: 'Not Installed', tone: 'muted' },
  connected: { label: 'Running', tone: 'ok' },
  connecting: { label: 'Connecting', tone: 'pending' },
  stopped: { label: 'Stopped', tone: 'muted' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const TUNNEL_PROVIDER_LABEL = 'Cloudflare Tunnel'

/** The connector line: its state and the version it runs. */
export function connectorSummary(status: InstanceTunnelStatus | undefined): {
  label: string
  tone: TunnelTone
  detail: string | null
} {
  const connector = status?.connector
  if (!connector) {
    return { label: 'Unknown', tone: 'muted', detail: status?.connectorNote ?? null }
  }
  const presentation = CONNECTOR_STATUS_PRESENTATION[connector.status] ?? {
    label: connector.status,
    tone: 'muted' as const,
  }
  return {
    ...presentation,
    detail: connector.version ? `Version ${connector.version}` : null,
  }
}

/** Shown for a fact only a connected account can give. */
export const NOT_VISIBLE_WITHOUT_ACCOUNT = 'Not visible without an account'
/** Shown when the daemon on the control plane host is too old to report a connector fact. */
export const NOT_REPORTED = 'Not reported yet. Update the daemon on the control plane host.'

function countConnections(count: number): string {
  return count === 1 ? '1 connection' : `${count} connections`
}

/**
 * "4 connections in nrt01, kix01" from the edge with an account; otherwise
 * the count the connector itself reports; else the note for the empty half.
 */
export function edgeSummary(status: InstanceTunnelStatus | undefined): string {
  const edge = status?.edge
  if (edge) {
    const count = countConnections(edge.connections)
    return edge.locations.length > 0 ? `${count} in ${edge.locations.join(', ')}` : count
  }
  const fromConnector = status?.connector?.edgeConnections
  if (typeof fromConnector === 'number') return countConnections(fromConnector)
  if (status?.connector) return NOT_REPORTED
  return status?.edgeNote ?? NOT_VISIBLE_WITHOUT_ACCOUNT
}

/** Edge details only an account adds (locations, edge status), or null when there is nothing to say. */
export function edgeAccountNote(status: InstanceTunnelStatus | undefined): string | null {
  if (status?.edge || status?.edgeError) return null
  return status?.edgeNote ?? null
}

/**
 * The names this tunnel routes: from the edge with an account, else from the
 * connector (which knows its routes, also for a pasted run token). A string
 * when neither can say.
 */
export function routedHostnames(status: InstanceTunnelStatus | undefined): string[] | string {
  if (status?.edge) return status.edge.hostnames
  const fromConnector = status?.connector?.hostnames
  if (Array.isArray(fromConnector)) return fromConnector
  if (status?.connector) return NOT_REPORTED
  return NOT_VISIBLE_WITHOUT_ACCOUNT
}

/** The newest health check either half reports, or null. */
export function lastHealthCheck(status: InstanceTunnelStatus | undefined): string | null {
  const times = [status?.connector?.checkedAt, status?.edge?.checkedAt]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  return times[0] ?? null
}

/**
 * The last error worth showing: a connector update that was rolled back, the
 * edge read's error, then the first hostname whose connection reports one.
 */
export function tunnelLastError(
  status: InstanceTunnelStatus | undefined,
  hostnameDetails: readonly (string | null | undefined)[] = []
): string | null {
  const update = status?.connector?.lastUpdate
  if (update?.reason && update.outcome !== 'updated') return update.reason
  if (status?.edgeError) return status.edgeError
  return hostnameDetails.find((detail): detail is string => Boolean(detail)) ?? null
}
