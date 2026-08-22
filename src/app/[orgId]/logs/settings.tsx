import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ContainerLogsSettingsSection } from '@/components/org/logs/container-logs-settings-section'
import { colors, spacing } from '@/lib/theme'

export default function OrgLogsSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const id = orgId ?? ''

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Log settings</Text>
      <Text style={styles.copy}>
        Whether this organization retains what its containers print. It is a
        single organization-wide switch rather than an inherited default —
        retention is billed and stored per tenant, so there is no lower layer
        that could sensibly override it.
      </Text>
      <ContainerLogsSettingsSection orgId={id} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
})
