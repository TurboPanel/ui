import Constants from 'expo-constants'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, ModalSheet, MonoText } from '@/components/ui'
import { versionRows } from '@/lib/build-info'
import type { HealthResponse } from '@/lib/instance-api'
import { readAppSourceRelease } from '@/lib/source-release'
import { colors, spacing } from '@/lib/theme'

function readWebInterfaceVersion(): string | null {
  try {
    return readAppSourceRelease(Constants.expoConfig).version
  } catch {
    return null
  }
}

/**
 * The versions popup, opened from the version beside the T mark when there
 * is no update to apply: the control plane's running build and this web
 * interface's own version, nothing else. The same on both editions.
 */
export function VersionsSheet({
  visible,
  health,
  onClose,
}: Readonly<{
  visible: boolean
  health: HealthResponse | undefined
  onClose: () => void
}>) {
  const rows = useMemo(() => versionRows(health, readWebInterfaceVersion()), [health])
  return (
    <ModalSheet
      visible={visible}
      onRequestClose={onClose}
      title="Versions"
      maxWidth={420}
      footer={
        <ButtonRow align="end">
          <Button label="Close" variant="primary" onPress={onClose} />
        </ButtonRow>
      }
    >
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <MonoText selectable style={styles.value}>
            {row.value}
          </MonoText>
        </View>
      ))}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  value: {
    color: colors.textBody,
    fontSize: 13,
  },
})
