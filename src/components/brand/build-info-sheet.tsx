import Constants from 'expo-constants'
import { useMemo } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, ModalSheet, MonoText } from '@/components/ui'
import { buildInfoSections } from '@/lib/build-info'
import type { HealthResponse } from '@/lib/instance-api'
import { readAppSourceRelease } from '@/lib/source-release'
import { colors, spacing } from '@/lib/theme'

/**
 * Testing / staging only: what is running — this console build and the
 * control plane it talks to, each with its version and commit (the commit
 * opens on GitHub).
 */
export function BuildInfoSheet({
  visible,
  health,
  onClose,
}: Readonly<{
  visible: boolean
  health: HealthResponse | undefined
  onClose: () => void
}>) {
  const sections = useMemo(
    () => buildInfoSections(health, readAppSourceRelease(Constants.expoConfig)),
    [health],
  )
  return (
    <ModalSheet
      visible={visible}
      onRequestClose={onClose}
      title="What's running"
      maxWidth={420}
      footer={
        <ButtonRow align="end">
          <Button label="Close" variant="primary" onPress={onClose} />
        </ButtonRow>
      }
    >
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              {row.url ? (
                <MonoText
                  selectable
                  style={[styles.value, styles.link]}
                  accessibilityRole="link"
                  accessibilityLabel={`${section.title} commit ${row.value}, open on GitHub`}
                  onPress={() => {
                    const url = row.url
                    if (url) void Linking.openURL(url).catch(() => undefined)
                  }}
                >
                  {row.value}
                </MonoText>
              ) : (
                <MonoText selectable style={styles.value}>
                  {row.value}
                </MonoText>
              )}
            </View>
          ))}
        </View>
      ))}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  value: {
    color: colors.textBody,
    fontSize: 13,
  },
  link: {
    color: colors.accent,
  },
})
