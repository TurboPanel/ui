import { StyleSheet, Text } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  SectionPanel,
  type DataTableColumn,
} from '@/components/ui'
import { INGRESS_PHASE_PRESENTATION } from '@/lib/connection-modes'
import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { useInstanceDaemon } from '@/lib/queries/admin'
import { useHostnameIngressStatus } from '@/lib/queries/ingress'
import { colors } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'hostname', header: 'Hostname', flex: 2, minWidth: 200 },
  { key: 'tunnel', header: 'Tunnel', flex: 1, minWidth: 140 },
  { key: 'connections', header: 'Connections', minWidth: 120 },
  { key: 'phase', header: 'Phase', minWidth: 120, gap: 4 },
  { key: 'selfCheck', header: 'Self-Check', minWidth: 110 },
  { key: 'connector', header: 'Connector', minWidth: 140 },
]

/** A healthy tunnel holds four connections to the edge. */
const FULL_CONNECTIONS = 4

/** Live health for every hostname that runs through the control plane's own tunnel. */
export function TunnelHealthPanel({
  hostnames,
}: Readonly<{ hostnames: readonly InstanceHostnameRecord[] }>) {
  const daemon = useInstanceDaemon()
  const tunneled = hostnames.filter((row) => row.mode === 'cloudflare-tunnel')
  const connector = connectorText(daemon.data)
  return (
    <SectionPanel title="Tunnel Health" hint="Read live from the connector and Cloudflare">
      <DataTable columns={COLUMNS} minWidth={830}>
        {tunneled.length === 0 ? (
          <DataTableEmpty>No hostname uses Cloudflare Tunnel yet.</DataTableEmpty>
        ) : (
          tunneled.map((row, index) => (
            <TunnelHealthRow
              key={row.id}
              record={row}
              connector={connector}
              alt={index % 2 === 1}
              last={index === tunneled.length - 1}
            />
          ))
        )}
      </DataTable>
    </SectionPanel>
  )
}

function connectorText(
  daemon: Readonly<{ connected?: boolean; version?: string | null }> | undefined
): string {
  if (!daemon) return 'Checking…'
  if (daemon.connected === false) return 'Daemon offline'
  return daemon.version ? `Ready, daemon ${daemon.version}` : 'Ready'
}

function TunnelHealthRow({
  record,
  connector,
  alt,
  last,
}: Readonly<{ record: InstanceHostnameRecord; connector: string; alt: boolean; last: boolean }>) {
  const status = useHostnameIngressStatus(record.id)
  const facts = status.data?.facts
  const phase = status.data ? INGRESS_PHASE_PRESENTATION[status.data.phase] : null
  return (
    <DataTableRow alt={alt} last={last}>
      <DataTableCell column={COLUMNS[0]}>
        <Text selectable style={styles.mono}>
          {record.host}
        </Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[1]}>
        <Text style={styles.text}>{facts?.tunnel ?? '—'}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[2]}>
        <Text style={styles.text}>
          {facts?.connections === undefined ? '—' : `${facts.connections} of ${FULL_CONNECTIONS}`}
        </Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[3]}>
        {phase ? (
          <Badge label={phase.label} tone={phase.tone} />
        ) : (
          <Text style={styles.text}>—</Text>
        )}
        {status.data?.detail ? <Text style={styles.muted}>{status.data.detail}</Text> : null}
      </DataTableCell>
      <DataTableCell column={COLUMNS[4]}>
        <SelfCheck value={facts?.selfCheck} />
      </DataTableCell>
      <DataTableCell column={COLUMNS[5]}>
        <Text style={styles.muted}>{connector}</Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function SelfCheck({ value }: Readonly<{ value: boolean | undefined }>) {
  if (value === undefined) return <Text style={styles.text}>—</Text>
  return <Badge label={value ? 'Pass' : 'Fail'} tone={value ? 'ok' : 'danger'} />
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 13 },
  muted: { color: colors.textMuted, fontSize: 12 },
  mono: { color: colors.stdout, fontFamily: 'monospace', fontSize: 13 },
})
