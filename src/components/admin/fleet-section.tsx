import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SectionPanel } from '@/components/admin/section-panel'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import { daemonLabel, upgradeSystem } from '@/lib/instance-api'
import { ADMIN_SECTIONS } from '@/lib/admin-navigation'
import { colors } from '@/lib/admin-theme'

const section = ADMIN_SECTIONS.find((s) => s.id === 'fleet')!

export function FleetSection() {
  const { healthOk, connections, fleet, staleCount } = useAdmin()
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeResult, setUpgradeResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  const canUpgrade = !upgrading && healthOk === true

  const onUpgrade = async () => {
    setUpgrading(true)
    setUpgradeResult(null)
    try {
      const result = await upgradeSystem()
      setUpgradeResult({
        ok: true,
        message: `Upgrade started at commit ${result.commit}. This instance will restart shortly and connected agents will update.`,
      })
    } catch (err) {
      setUpgradeResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Upgrade failed',
      })
    } finally {
      setUpgrading(false)
    }
  }

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

      <Text style={adminStyles.inlineLabel}>System upgrade</Text>
      <Text style={adminStyles.muted}>
        Fetch origin/trunk, notify connected agents to update, and restart this instance.
      </Text>
      <Pressable
        style={[adminStyles.button, !canUpgrade && adminStyles.buttonDisabled]}
        onPress={() => void onUpgrade()}
        disabled={!canUpgrade}
      >
        {upgrading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={adminStyles.buttonText}>Upgrading…</Text>
          </View>
        ) : (
          <Text style={adminStyles.buttonText}>Upgrade System</Text>
        )}
      </Pressable>
      {upgradeResult ? (
        <Text style={upgradeResult.ok ? adminStyles.muted : adminStyles.error}>
          {upgradeResult.message}
        </Text>
      ) : null}

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
