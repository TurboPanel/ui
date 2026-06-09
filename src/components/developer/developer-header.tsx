import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { dashboardHref, useAuth } from '@/lib/auth-context'
import { ALL_TARGET } from '@/lib/developer-navigation'
import { useDeveloper } from '@/lib/developer-context'
import { daemonLabel } from '@/lib/instance-api'
import { colors } from '@/lib/theme'
import { TargetChip } from '@/components/developer/target-chip'
import { developerStyles } from '@/components/developer/developer-styles'

export function DeveloperHeader({ onMenuPress }: { onMenuPress?: () => void }) {
  const router = useRouter()
  const { session, needsInstall } = useAuth()
  const exitHref = dashboardHref(session, needsInstall)
  const {
    healthOk,
    connections,
    fleet,
    target,
    setTarget,
    targetLabel,
    staleCount,
  } = useDeveloper()

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        {onMenuPress ? (
          <Pressable style={styles.menuButton} onPress={onMenuPress}>
            <Text style={styles.menuIcon}>☰</Text>
          </Pressable>
        ) : null}
        <View style={developerStyles.row}>
          <View style={[developerStyles.dot, healthOk ? developerStyles.dotOk : developerStyles.dotBad]} />
          <Text style={developerStyles.rowText}>
            API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
          </Text>
          <Text style={developerStyles.fleetCount}>
            {fleet.length} server{fleet.length === 1 ? '' : 's'}
            {staleCount > 0 ? ` (${staleCount} stale)` : ''}
          </Text>
        </View>
        <Pressable
          style={styles.exitButton}
          onPress={() => router.push(exitHref as Href)}
        >
          <Text style={styles.exitLabel}>Organization console</Text>
        </Pressable>
      </View>

      <Text style={developerStyles.inlineLabel}>Target</Text>
      <View style={developerStyles.targets}>
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
        <Text style={developerStyles.muted}>No daemon connected yet</Text>
      ) : (
        <Text style={developerStyles.muted}>Diagnostics run against: {targetLabel}</Text>
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
    flexWrap: 'wrap',
  },
  exitButton: {
    marginLeft: 'auto',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exitLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
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
