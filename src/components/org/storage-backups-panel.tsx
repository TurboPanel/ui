import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ConfirmButton } from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { StorageCopyBackupRecord } from '@/lib/instance-api'
import { useStorageCopyBackupActions, useStorageCopyBackups } from '@/lib/queries/storage'
import { backupSummary, RESTORE_WARNING } from '@/lib/storage-backups'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function BackupRow({
  backup,
  busy,
  restoreArmed,
  onArmRestore,
  onCancelRestore,
  onRestore,
  onDelete,
}: Readonly<{
  backup: StorageCopyBackupRecord
  busy: boolean
  restoreArmed: boolean
  onArmRestore: () => void
  onCancelRestore: () => void
  onRestore: () => void
  onDelete: () => void
}>) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{formatLocalDateTime(backup.createdAt)}</Text>
      <Text style={panelStyles.muted}>{backupSummary(backup)}</Text>
      <ButtonRow>
        <Button label="Restore" size="sm" disabled={busy || restoreArmed} onPress={onArmRestore} />
        <ConfirmButton
          label="Delete"
          confirmLabel="Confirm delete"
          prompt="Delete this backup?"
          disabled={busy || restoreArmed}
          onConfirm={onDelete}
        />
      </ButtonRow>
      {restoreArmed ? (
        <View style={styles.restoreBox}>
          <Text style={styles.restoreCopy}>{RESTORE_WARNING}</Text>
          <ButtonRow>
            <Button
              label="Confirm restore"
              busyLabel="Restoring…"
              variant="danger"
              size="sm"
              busy={busy}
              onPress={onRestore}
            />
            <Button label="Cancel" size="sm" disabled={busy} onPress={onCancelRestore} />
          </ButtonRow>
        </View>
      ) : null}
    </View>
  )
}

/** Backups of one storage copy: back up now, restore, delete. Owners and managers only. */
export function StorageBackupsPanel({
  orgId,
  storageId,
  copyId,
}: Readonly<{ orgId: string; storageId: string; copyId: string }>) {
  const query = useStorageCopyBackups(orgId, storageId, copyId)
  const { backUp, remove, restore } = useStorageCopyBackupActions(orgId, storageId, copyId)
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const busy = backUp.isPending || remove.isPending || restore.isPending

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string | null; cause?: unknown }>,
    fallback: string
  ) => {
    setError(null)
    const result = await action()
    if (!result.ok) {
      setError(result.cause ? userErrorMessage(result.cause, fallback) : (result.error ?? null))
    }
    return result.ok
  }

  const backups = query.data?.backups ?? []
  const loadError = query.isError ? userErrorMessage(query.error, 'Failed to load backups') : null
  return (
    <View style={styles.panel}>
      <Text style={panelStyles.detailTitle}>Backups</Text>
      {(error ?? loadError) ? <Text style={panelStyles.error}>{error ?? loadError}</Text> : null}
      <Button
        label="Back up now"
        busyLabel="Backing up…"
        size="sm"
        busy={backUp.isPending}
        disabled={busy}
        onPress={() => {
          void run(() => backUp.run(), 'Failed to start the backup')
        }}
      />
      {backups.length === 0 && !query.isLoading ? (
        <Text style={panelStyles.muted}>No backups yet.</Text>
      ) : null}
      {backups.map((backup) => (
        <BackupRow
          key={backup.id}
          backup={backup}
          busy={busy}
          restoreArmed={armed === backup.id}
          onArmRestore={() => setArmed(backup.id)}
          onCancelRestore={() => setArmed(null)}
          onRestore={() => {
            void run(() => restore.run(backup.id), 'Failed to start the restore').then((ok) => {
              if (ok) setArmed(null)
            })
          }}
          onDelete={() => {
            void run(() => remove.run(backup.id), 'Failed to delete the backup')
          }}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: spacing.xs, marginTop: spacing.sm },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  rowLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  restoreBox: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
  },
  restoreCopy: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
})
