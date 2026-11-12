import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ConfirmButton, InlineNotice } from '@/components/ui'
import type { TunnelRecord } from '@/lib/instance-api'
import { useRotateTunnelRunToken } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import {
  ROTATE_CONFIRM,
  ROTATE_SINGLE_SERVER_WARNING,
  rotationBlockedReason,
  rotationProgressLine,
  rotationResumable,
  rotationRunning,
  rotationStoppedHint,
  rotationStoppedLine,
} from '@/lib/tunnel-runs'

/**
 * Rotate Run Token on a tunnel card: a two-press confirm to start, progress
 * while it runs (the tunnel list refreshes faster then), the reason and a
 * resume when it stopped, and the reason the action is unavailable when the
 * control plane would refuse it.
 */
export function NetworkTunnelRotate({
  orgId,
  tunnel,
  names,
}: Readonly<{
  orgId: string
  tunnel: TunnelRecord
  names: ReadonlyMap<string, string>
}>) {
  const [error, setError] = useState<string | null>(null)
  const rotate = useRotateTunnelRunToken(orgId, tunnel.id)
  const rotation = tunnel.runTokenRotation ?? null
  const single = tunnel.carryingServerIds.length === 1
  const blocked = rotationBlockedReason(tunnel, names)
  const stopped = rotationStoppedLine(rotation, names)
  // A stopped rotation is resumed even when a server is out of reach: the control plane waits for it.
  const resumable = rotationResumable(tunnel)

  async function start() {
    setError(null)
    const result = await rotate.run({ confirmSingleServer: single })
    if (!result.ok) setError(tunnelErrorMessage(result.cause, 'Failed to rotate the run token'))
  }

  // An older control plane does not offer rotation: nothing to show.
  if (tunnel.runTokenRotationBlock === undefined) return null

  if (rotation && rotationRunning(rotation)) {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.muted} accessibilityRole="text">
          {rotationProgressLine(rotation, names)}
        </Text>
      </View>
    )
  }

  const prompt = single ? `${ROTATE_CONFIRM} ${ROTATE_SINGLE_SERVER_WARNING}` : ROTATE_CONFIRM
  return (
    <View style={styles.root}>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {stopped ? (
        <InlineNotice
          tone="warning"
          title={stopped}
          body={rotation ? rotationStoppedHint(rotation, names) : undefined}
          actions={
            resumable ? (
              <Button
                label="Resume Rotation"
                size="sm"
                busy={rotate.isPending}
                onPress={() => void start()}
                accessibilityLabel={`Resume the run token rotation of ${tunnel.name}`}
              />
            ) : null
          }
        />
      ) : null}
      {stopped ? null : (
        <ButtonRow>
          <ConfirmButton
            label="Rotate Run Token"
            confirmLabel="Rotate"
            dismissLabel="Cancel"
            prompt={prompt}
            variant="secondary"
            stacked
            busy={rotate.isPending}
            disabled={blocked !== null}
            onConfirm={() => void start()}
          />
        </ButtonRow>
      )}
      {blocked && !resumable ? <Text style={panelStyles.muted}>{blocked}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
})
