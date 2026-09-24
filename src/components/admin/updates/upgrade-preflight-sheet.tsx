import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, CopyButton, ModalSheet, StatusDot } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradePreflightResult } from '@/lib/instance-api'
import { isRunnableRecoveryCommand } from '@/lib/upgrade-recovery'
import { colors, spacing } from '@/lib/theme'

export function UpgradePreflightSheet({
  visible,
  preflight,
  busy,
  onClose,
  onConfirm,
}: Readonly<{
  visible: boolean
  preflight: UpgradePreflightResult | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}>) {
  const recovery = preflight?.recoveryCommand?.trim() ?? ''
  const runnable = recovery.length > 0 && isRunnableRecoveryCommand(recovery)

  return (
    <ModalSheet
      visible={visible}
      title="Ready to update TurboPanel?"
      onRequestClose={onClose}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" variant="secondary" onPress={onClose} />
          <Button
            label="Start update"
            variant="primary"
            busy={busy}
            busyLabel="Starting…"
            disabled={preflight?.canStart === false}
            onPress={onConfirm}
          />
        </ButtonRow>
      }
    >
      <View style={styles.body}>
        <Text style={panelStyles.pageCopy}>
          TurboPanel backs up the control plane database before installing. Keep this recovery
          command somewhere safe before you continue.
        </Text>
        {preflight?.checks.map((check) => (
          <View key={check.id} style={styles.checkRow}>
            <StatusDot tone={check.passed ? 'online' : 'failed'} />
            <View style={styles.checkCopy}>
              <Text style={styles.checkLabel}>{check.label}</Text>
              {check.detail ? <Text style={panelStyles.muted}>{check.detail}</Text> : null}
            </View>
          </View>
        ))}
        {preflight?.blockers?.length ? (
          <Text style={panelStyles.error}>{preflight.blockers.join(' ')}</Text>
        ) : null}
        {recovery ? (
          <View style={styles.recovery}>
            <Text style={panelStyles.detailLabel}>
              {runnable ? 'Recovery command' : 'Recovery command template'}
            </Text>
            {preflight?.runId ? (
              <Text style={panelStyles.muted}>Attempt {preflight.runId}</Text>
            ) : null}
            {preflight?.backupPath ? (
              <Text style={panelStyles.muted}>Backup {preflight.backupPath}</Text>
            ) : null}
            <Text style={styles.mono}>{recovery}</Text>
            {runnable ? <CopyButton value={recovery} label="Copy command" /> : (
              <Text style={panelStyles.muted}>
                This command is not ready to copy. It will name the backup after the update starts.
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  checkCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  checkLabel: {
    color: colors.text,
  },
  recovery: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    backgroundColor: colors.bgInset,
  },
  mono: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 12,
  },
})
