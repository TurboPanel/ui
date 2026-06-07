import { Text, View } from 'react-native'
import { SectionPanel } from '@/components/admin/section-panel'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import { daemonLabel } from '@/lib/instance-api'
import { ADMIN_SECTIONS } from '@/lib/admin-navigation'

const section = ADMIN_SECTIONS.find((s) => s.id === 'fleet')!

export function FleetSection() {
  const { healthOk, connections, fleet, staleCount } = useAdmin()

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <View style={adminStyles.row}>
        <View style={[adminStyles.dot, healthOk ? adminStyles.dotOk : adminStyles.dotBad]} />
        <Text style={adminStyles.rowText}>
          API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
        </Text>
        <Text style={adminStyles.fleetCount}>
          {fleet.length} server{fleet.length === 1 ? '' : 's'}
          {staleCount > 0 ? ` (${staleCount} stale sockets clearing…)` : ''}
        </Text>
      </View>

      {fleet.length === 0 ? (
        <Text style={adminStyles.muted}>Waiting for daemon connections…</Text>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={adminStyles.inlineLabel}>Connected agents</Text>
          {fleet.map((conn) => (
            <View key={conn.id} style={adminStyles.detailCard}>
              <Text style={adminStyles.detailTitle}>
                {daemonLabel(conn.id, connections)}
              </Text>
              <Text style={adminStyles.detailLine}>
                <Text style={adminStyles.detailLabel}>Connection: </Text>
                {conn.id}
              </Text>
              {conn.hostname ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Hostname: </Text>
                  {conn.hostname}
                </Text>
              ) : null}
              {conn.nodeId ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Node ID: </Text>
                  {conn.nodeId}
                </Text>
              ) : null}
              {conn.remoteAddress ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Remote: </Text>
                  {conn.remoteAddress}
                </Text>
              ) : null}
              <Text style={adminStyles.detailLine}>
                <Text style={adminStyles.detailLabel}>Connected: </Text>
                {new Date(conn.connectedAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}
