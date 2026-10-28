import { StyleSheet, Text, View } from 'react-native'
import { CopyButton } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { ControlPlaneRecovery } from '@/lib/instance-api'
import { isRunnableRecoveryCommand } from '@/lib/upgrade-recovery'
import { colors, spacing } from '@/lib/theme'

/**
 * Self-hosted, while a control plane or web interface install waits: the
 * backup the next automatic run takes before installing, and the command that
 * rolls back to it. The next run uses the same run id, so the command copied
 * now names that run.
 */
export function ControlPlaneRecoveryBlock({
  recovery,
}: Readonly<{ recovery: ControlPlaneRecovery | null | undefined }>) {
  if (!recovery) return null
  const command = recovery.rollbackCommand.trim()
  const runnable = isRunnableRecoveryCommand(command)
  return (
    <View style={styles.recovery}>
      <Text style={panelStyles.detailLabel}>Backup and Rollback</Text>
      <Text style={panelStyles.muted}>
        TurboPanel backs up the control plane database before installing. Keep this rollback command
        somewhere safe; it names update run {recovery.runId}.
      </Text>
      {recovery.backupPath ? (
        <View style={styles.row}>
          <Text style={styles.mono}>{recovery.backupPath}</Text>
          <CopyButton value={recovery.backupPath} label="Copy Backup Path" />
        </View>
      ) : null}
      {command ? <Text style={styles.mono}>{command}</Text> : null}
      {runnable ? (
        <CopyButton value={command} label="Copy Rollback Command" />
      ) : (
        <Text style={panelStyles.muted}>
          This command is not ready to copy. It will name the backup when the update starts.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  recovery: {
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 6,
    backgroundColor: colors.bgInset,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mono: {
    flexShrink: 1,
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 12,
  },
})
