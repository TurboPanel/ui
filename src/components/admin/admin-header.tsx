import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ALL_TARGET } from '@/lib/admin-navigation'
import { useAdmin } from '@/lib/admin-context'
import { daemonLabel } from '@/lib/instance-api'
import { colors } from '@/lib/admin-theme'
import { TargetChip } from '@/components/admin/target-chip'
import { adminStyles } from '@/components/admin/admin-styles'

export function AdminHeader({ onMenuPress }: { onMenuPress?: () => void }) {
  const {
    healthOk,
    connections,
    fleet,
    target,
    setTarget,
    targetLabel,
    staleCount,
  } = useAdmin()

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        {onMenuPress ? (
          <Pressable style={styles.menuButton} onPress={onMenuPress}>
            <Text style={styles.menuIcon}>☰</Text>
          </Pressable>
        ) : null}
        <View style={adminStyles.row}>
          <View style={[adminStyles.dot, healthOk ? adminStyles.dotOk : adminStyles.dotBad]} />
          <Text style={adminStyles.rowText}>
            API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
          </Text>
          <Text style={adminStyles.fleetCount}>
            {fleet.length} server{fleet.length === 1 ? '' : 's'}
            {staleCount > 0 ? ` (${staleCount} stale)` : ''}
          </Text>
        </View>
      </View>

      <Text style={adminStyles.inlineLabel}>Target</Text>
      <View style={adminStyles.targets}>
        <TargetChip
          label="All"
          active={target === ALL_TARGET}
          onPress={() => setTarget(ALL_TARGET)}
        />
        {fleet.map((conn) => (
          <TargetChip
            key={conn.id}
            label={daemonLabel(conn.id, connections)}
            active={target === conn.id}
            onPress={() => setTarget(conn.id)}
          />
        ))}
      </View>
      {fleet.length === 0 ? (
        <Text style={adminStyles.muted}>No daemon connected yet</Text>
      ) : (
        <Text style={adminStyles.muted}>Diagnostics run against: {targetLabel}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgPanel,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    color: colors.textBody,
    fontSize: 16,
  },
})
