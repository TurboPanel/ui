import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ServerCapacitySettingsSection } from '@/components/org/server-capacity-settings-section'
import { ServerTimezoneSettingsSection } from '@/components/org/server-timezone-settings-section'
import { spacing } from '@/lib/theme'

export default function ServerSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const id = orgId ?? ''

  return (
    <View style={styles.root}>
      <ServerTimezoneSettingsSection orgId={id} />
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
