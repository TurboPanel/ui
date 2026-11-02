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

/** "4 connections in Tokyo, Osaka", or the note saying why the edge half is empty. */
export function edgeSummary(status: InstanceTunnelStatus | undefined): string {
  const edge = status?.edge
  if (!edge) return status?.edgeNote ?? 'Connect a Cloudflare account to see the edge side.'
  const count = edge.connections === 1 ? '1 connection' : `${edge.connections} connections`
  return edge.locations.length > 0 ? `${count} in ${edge.locations.join(', ')}` : count
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
