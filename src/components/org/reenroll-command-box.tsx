import { StyleSheet, Text, View } from 'react-native'
import { Button, CopyButton, MonoText } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { reenrollExpiryLabel, reenrollTokenIsLive } from '@/lib/reenroll-token'
import { spacing } from '@/lib/theme'

/**
 * A one-time install command with its expiry. The secret is shown once; leaving
 * the page loses it. `onRevoke` is offered only while the token is still unused.
 */
export function ReenrollCommandBox({
  command,
  expiresAt,
  revoking = false,
  revokeError = null,
  onRevoke,
  nowMs,
}: Readonly<{
  command: string
  expiresAt: string
  revoking?: boolean
  revokeError?: string | null
  onRevoke?: () => void
  nowMs?: number
}>) {
  const live = reenrollTokenIsLive(expiresAt, nowMs)
  return (
    <View style={styles.root}>
      <MonoText>{command}</MonoText>
      <Text style={panelStyles.muted}>{reenrollExpiryLabel(expiresAt, nowMs)}</Text>
      <Text style={panelStyles.muted}>
        Copy it now. It is shown once and cannot be shown again.
      </Text>
      {revokeError ? <Text style={panelStyles.error}>{revokeError}</Text> : null}
      <View style={styles.actions}>
        <CopyButton
          value={command}
          label="Copy Command"
          accessibilityLabel="Copy install command"
        />
        {live && onRevoke ? (
          <Button label="Revoke" busyLabel="Revoking…" busy={revoking} onPress={onRevoke} />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
