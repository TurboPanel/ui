import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { RELEASE_NOW_HINT, type RemoveNowOutcome } from '@/lib/hosting-plain-words'
import { colors, spacing } from '@/lib/theme'

/**
 * On a hostname whose entry has left the configuration file but whose row
 * still holds the name until the next deploy: Release now frees it at once.
 */
export function RemovedHostnameRelease({
  busy,
  disabled,
  onRelease,
}: Readonly<{ busy: boolean; disabled: boolean; onRelease: () => void }>) {
  return (
    <View style={styles.root}>
      <Text style={styles.hint}>{RELEASE_NOW_HINT}</Text>
      <Button
        label="Release now"
        size="sm"
        variant="secondary"
        busy={busy}
        disabled={disabled}
        onPress={onRelease}
      />
    </View>
  )
}

/** What the last release said, next to the hostings it concerns. */
export function HostingReleaseNotice({ notice }: Readonly<{ notice: RemoveNowOutcome | null }>) {
  if (!notice) return null
  const failed = notice.tone === 'error'
  return (
    <Text
      accessibilityRole={failed ? 'alert' : undefined}
      style={failed ? panelStyles.error : styles.notice}
    >
      {notice.message}
    </Text>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs, alignItems: 'flex-start' },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  notice: { color: colors.textBody, fontSize: 13 },
})
