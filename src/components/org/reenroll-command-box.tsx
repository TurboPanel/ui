import { StyleSheet, Text, View } from 'react-native'
import { ConfirmButton, CopyButton, MonoText } from '@/components/ui'
import { useNow } from '@/components/org/project/use-now'
import { panelStyles } from '@/components/ui/panel-styles'
import { reenrollExpiryLabel, reenrollTokenIsLive } from '@/lib/reenroll-token'
import { spacing } from '@/lib/theme'

const MINUTE_MS = 60_000

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
  // A minute clock moves the countdown and drops Revoke at expiry without a refetch.
  const tick = useNow(MINUTE_MS)
  const now = nowMs ?? tick
  const live = reenrollTokenIsLive(expiresAt, now)
  return (
    <View style={styles.root}>
      <MonoText>{command}</MonoText>
      <Text style={panelStyles.muted}>{reenrollExpiryLabel(expiresAt, now)}</Text>
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
          <ConfirmButton
            label="Revoke Token"
            confirmLabel="Confirm Revoke"
            prompt="Revoke this re-enroll token? The command will stop working."
            busy={revoking}
            onConfirm={onRevoke}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
