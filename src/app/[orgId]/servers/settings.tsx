import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ServerCapacitySettingsSection } from '@/components/org/server-capacity-settings-section'
import { ServerHostDefaultsSettingsSection } from '@/components/org/server-host-defaults-settings-section'
import { ServerTemperatureUnitSettingsSection } from '@/components/org/server-temperature-unit-settings-section'
import { ServerTimezoneSettingsSection } from '@/components/org/server-timezone-settings-section'
import { spacing } from '@/lib/theme'

export default function ServerSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const id = orgId ?? ''

  return (
    <View style={styles.root}>
      <ServerTimezoneSettingsSection orgId={id} />
      <ServerTemperatureUnitSettingsSection orgId={id} />
      <ServerHostDefaultsSettingsSection orgId={id} />
      <ServerCapacitySettingsSection orgId={id} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
