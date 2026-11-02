import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, LoadingState, SectionPanel } from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { InstanceHostnameRecord } from '@/lib/instance-api'
import {
  useHostnameIngressStatuses,
  useInstanceTunnelStatus,
  useRefreshInstanceTunnelStatus,
} from '@/lib/queries/ingress'
import { colors, spacing } from '@/lib/theme'
import {
  connectorSummary,
  edgeSummary,
  lastHealthCheck,
  tunnelLastError,
} from '@/lib/tunnel-status'

/**
 * Tunnel status for either path (API token or pasted run token): connector and
 * version, edge locations and connections, routed hostnames, last check and
 * last error. Read every minute; Refresh asks the daemon again.
 */
export function TunnelStatusPanel({
  hostnames,
}: Readonly<{ hostnames: readonly InstanceHostnameRecord[] }>) {
  const query = useInstanceTunnelStatus()
  const refresh = useRefreshInstanceTunnelStatus()
  const [error, setError] = useState<string | null>(null)
  const tunneled = hostnames.filter((row) => row.mode === 'cloudflare-tunnel')
  const statuses = useHostnameIngressStatuses(tunneled.map((row) => row.id))
  const status = query.data
  const connector = connectorSummary(status)
  const routed = status?.edge?.hostnames ?? tunneled.map((row) => row.host)
  const lastError = tunnelLastError(
    status,
    statuses.map((item) => item.data?.detail)
  )
  const checkedAt = lastHealthCheck(status)

  const onRefresh = async () => {
    setError(null)
    const result = await refresh.run()
    if (!result.ok && result.error) setError(result.error)
  }

  return (
    <SectionPanel
      title="Status"
      hint="Read every minute"
      headerRight={
        <Button
          label="Refresh"
          busyLabel="Refreshing…"
          size="sm"
          busy={refresh.isPending}
          onPress={() => void onRefresh()}
        />
      }
    >
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <Text style={panelStyles.error}>Failed to load the tunnel status</Text>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <Row label="Connector">
        <Badge label={connector.label} tone={connector.tone} />
        {connector.detail ? <Text style={styles.value}>{connector.detail}</Text> : null}
      </Row>
      <Row label="Edge">
        <Text style={styles.value}>{edgeSummary(status)}</Text>
      </Row>
      <Row label="Hostnames Routed">
        <Text style={styles.value}>{routed.length > 0 ? routed.join(', ') : 'None'}</Text>
      </Row>
      <Row label="Last Health Check">
        <Text style={styles.value}>{formatLocalDateTime(checkedAt, { fallback: 'Not yet' })}</Text>
      </Row>
      <Row label="Last Error">
        <Text style={lastError ? styles.error : styles.value}>{lastError ?? 'None'}</Text>
      </Row>
    </SectionPanel>
  )
}

function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.cell}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '600', minWidth: 140 },
  cell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, flex: 1 },
  value: { color: colors.text, fontSize: 13 },
  error: { color: colors.errorText, fontSize: 13 },
})
