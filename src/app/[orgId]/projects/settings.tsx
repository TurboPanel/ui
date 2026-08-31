import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { DefaultEnvironmentSettingsSection } from '@/components/org/default-environment-settings-section'
import { PrincipalDefaultsSettingsSection } from '@/components/org/principal-defaults-settings-section'
import { colors, spacing } from '@/lib/theme'

export default function ProjectSettingsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const id = orgId ?? ''

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Project settings</Text>
      <Text style={styles.copy}>
        Defaults applied when new projects are created. Existing projects keep
        their current environments and names.
      </Text>
      <DefaultEnvironmentSettingsSection orgId={id} />
      <PrincipalDefaultsSettingsSection orgId={id} />
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
