import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { FabricConfirmSheet } from '@/components/org/network/fabric-confirm-sheet'
import {
  FABRIC_PAUSE_CONFIRM,
  FABRIC_PAUSE_RETRY_HINT,
  FABRIC_REMOVE_CONFIRM,
  type FabricConfirmCopy,
  fabricPausedNotice,
  type FabricServerOutcome,
  type FabricState,
} from '@/lib/fabric-servers'
import { useRemoveOrgFabric, useSaveOrgFabric } from '@/lib/queries/fabric'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

type PendingConfirm = 'pause' | 'remove' | null

function confirmCopy(pending: PendingConfirm): FabricConfirmCopy | null {
  if (pending === 'pause') return FABRIC_PAUSE_CONFIRM
  if (pending === 'remove') return FABRIC_REMOVE_CONFIRM
  return null
}

/**
 * While paused: tunnels are only called down once every server confirmed;
 * until then it counts, and a server that failed is named with its error.
 */
function FabricPausedCallout({ outcomes }: Readonly<{ outcomes: readonly FabricServerOutcome[] }>) {
  const notice = fabricPausedNotice(outcomes)
  if (notice.kind !== 'failed') {
    return (
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>{notice.text}</Text>
      </View>
    )
  }
  return (
    <View style={styles.failedNotice}>
      <Text style={panelStyles.error}>{notice.text}</Text>
      {notice.failures.map((line) => (
        <Text key={line} style={panelStyles.error}>
          {line}
        </Text>
      ))}
      <Text style={panelStyles.muted}>{FABRIC_PAUSE_RETRY_HINT}</Text>
    </View>
  )
}

/**
 * The organization switch (on, or off and kept) and the separate remove
 * action. Turning on or resuming needs no confirm; turning off and removing
 * each ask first, and the control plane's own words show when it refuses.
 */
export function FabricLifecycleControls({
  orgId,
  state,
  hasFabric,
  disabled,
  serverOutcomes = [],
}: Readonly<{
  orgId: string
  state: FabricState
  /** Each server's last reconcile, for the paused notice. */
  serverOutcomes?: readonly FabricServerOutcome[]
  /** A fabric exists (on or paused), so there is something to remove. */
  hasFabric: boolean
  disabled: boolean
}>) {
  const save = useSaveOrgFabric(orgId)
  const remove = useRemoveOrgFabric(orgId)
  const [pending, setPending] = useState<PendingConfirm>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = save.isPending || remove.isPending

  function fail(fallback: string) {
    return (err: unknown) => {
      setPending(null)
      setError(userErrorMessage(err, fallback))
    }
  }

  function turnOn() {
    setError(null)
    save.mutate(
      { enabled: true },
      { onError: fail(`Failed to turn on ${TURBOFABRIC_PRODUCT_NAME}`) }
    )
  }

  function confirm() {
    setError(null)
    const onSuccess = () => setPending(null)
    if (pending === 'pause') {
      save.mutate(
        { enabled: false },
        {
          onSuccess,
          onError: fail(`Failed to turn off ${TURBOFABRIC_PRODUCT_NAME}`),
        }
      )
    } else if (pending === 'remove') {
      remove.mutate(undefined, {
        onSuccess,
        onError: fail(`Failed to remove ${TURBOFABRIC_PRODUCT_NAME}`),
      })
    }
  }

  return (
    <View style={styles.root}>
      <SettingRow label={TURBOFABRIC_PRODUCT_NAME}>
        <Toggle
          value={state === 'on'}
          disabled={disabled || busy}
          busy={save.isPending}
          accessibilityLabel={`Turn ${TURBOFABRIC_PRODUCT_NAME} on or off`}
          onValueChange={(next) => {
            if (next) turnOn()
            else setPending('pause')
          }}
        />
      </SettingRow>
      {state === 'paused' ? <FabricPausedCallout outcomes={serverOutcomes} /> : null}
      {hasFabric ? (
        <View style={styles.removeRow}>
          {state === 'paused' ? (
            // Asks every server again to take its tunnel down.
            <Button
              label="Turn Off Again"
              variant="secondary"
              disabled={disabled || busy}
              onPress={() => setPending('pause')}
            />
          ) : null}
          <Button
            label={FABRIC_REMOVE_CONFIRM.title}
            variant="danger"
            disabled={disabled || busy}
            onPress={() => setPending('remove')}
          />
        </View>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <FabricConfirmSheet
        copy={confirmCopy(pending)}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  failedNotice: {
    gap: spacing.xs,
  },
  removeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
