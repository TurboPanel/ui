import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ManagedDefaultsSettingsSection } from '@/components/org/managed/managed-defaults-settings-section'
import { colors, spacing } from '@/lib/theme'

export default function ManagedSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const id = orgId ?? ''

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Managed settings</Text>
      <Text style={styles.copy}>
        Organization-wide settings for managed databases. TLS is an inherited
        default, so a service that set its own mode keeps it. Listener ports have
        no per-service override — one shared listener fronts every managed
        database on a server.
      </Text>
      <ManagedDefaultsSettingsSection orgId={id} />
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
