import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  SectionPanel,
  TextField,
} from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { formatBytes } from '@/lib/format-metrics'
import {
  managedErrorMessage,
  shortBackupChecksum,
  type ManagedBackupRecord,
} from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

function BackupRow({
  backup,
  canManage,
  disabled,
  managedDisplayName,
  restoreArmed,
  working,
  onConfirmDelete,
  onArmRestore,
  onCancelRestore,
  onConfirmRestore,
}: Readonly<{
  backup: ManagedBackupRecord
  canManage: boolean
  disabled: boolean
  managedDisplayName: string
  restoreArmed: boolean
  working: boolean
  onConfirmDelete: () => void
  onArmRestore: () => void
  onCancelRestore: () => void
  onConfirmRestore: () => void
}>) {
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const canConfirmRestore =
    restoreConfirmText.trim() === managedDisplayName && !working

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>
          {formatLocalDateTime(backup.createdAt)}
        </Text>
        <Text style={panelStyles.muted}>
          {formatBytes(backup.sizeBytes)}
          {backup.database ? ` · ${backup.database}` : ''} ·{' '}
          {shortBackupChecksum(backup.checksum)}
        </Text>
      </View>

      {canManage ? (
        <ButtonRow>
          <Button
            label="Restore"
            size="sm"
            disabled={disabled}
            onPress={onArmRestore}
          />
          <ConfirmButton
            key={`delete-${restoreArmed}`}
            label="Delete"
            confirmLabel="Confirm delete"
            prompt="Delete this backup?"
            disabled={disabled || restoreArmed}
            onConfirm={onConfirmDelete}
          />
        </ButtonRow>
      ) : null}

      {restoreArmed ? (
        <View style={styles.restoreBox}>
          <Text style={styles.restoreCopy}>
            Restoring overwrites the current data in{' '}
            <Text style={styles.confirmName}>
              {backup.database ?? 'this managed service'}
            </Text>{' '}
            and cannot be undone. Type{' '}
            <Text style={styles.confirmName}>{managedDisplayName}</Text> to
            confirm.
          </Text>
          <TextField
            label="Confirmation"
            value={restoreConfirmText}
            onChangeText={setRestoreConfirmText}
            placeholder={managedDisplayName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!working}
          />
          <ButtonRow>
            <Button
              label="Confirm restore"
              busyLabel="Restoring…"
              variant="danger"
              size="sm"
              busy={working}
              disabled={!canConfirmRestore}
              onPress={onConfirmRestore}
            />
            <Button
              label="Cancel"
              size="sm"
              onPress={() => {
                setRestoreConfirmText('')
                onCancelRestore()
              }}
            />
          </ButtonRow>
        </View>
      ) : null}
    </View>
  )
}

export function ManagedBackupsPanel({
  backups,
  supported,
  managedDisplayName,
  canManage,
  busy,
  onBackupNow,
  onDelete,
  onRestore,
}: Readonly<{
  backups: ManagedBackupRecord[]
  /** False when the engine has no backup capability (`spec.backup` unset). */
  supported: boolean
  managedDisplayName: string
  canManage: boolean
  busy: boolean
  onBackupNow: () => Promise<void>
  onDelete: (backupId: string) => Promise<void>
  onRestore: (backupId: string) => Promise<void>
}>) {
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [restoreArmed, setRestoreArmed] = useState<string | null>(null)

  const disabled = !supported || busy || working || !canManage

  const backupNow = async () => {
    setWorking(true)
    setError(null)
    try {
      await onBackupNow()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to start backup'))
    } finally {
      setWorking(false)
    }
  }

  const deleteBackup = async (backupId: string) => {
    setWorking(true)
    setError(null)
    try {
      await onDelete(backupId)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete backup'))
    } finally {
      setWorking(false)
    }
  }

  const restoreBackup = async (backupId: string) => {
    setWorking(true)
    setError(null)
    try {
      await onRestore(backupId)
      setRestoreArmed(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to start restore'))
    } finally {
      setWorking(false)
    }
  }

  if (!supported) {
    return (
      <SectionPanel title="Backups" hint="Back up and restore this managed service">
        <Text style={panelStyles.muted}>
          Backups are not supported on this managed engine yet.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Backups" hint="Back up and restore this managed service">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      {canManage ? (
        <Button
          label="Back up now"
          busyLabel="Backing up…"
          variant="primary"
          busy={working}
          disabled={disabled}
          onPress={() => {
            void backupNow()
          }}
        />
      ) : null}

      <View style={styles.list}>
        {backups.map((backup) => (
          <BackupRow
            key={backup.id}
            backup={backup}
            canManage={canManage}
            disabled={disabled}
            managedDisplayName={managedDisplayName}
            restoreArmed={restoreArmed === backup.id}
            working={working}
            onConfirmDelete={() => {
              void deleteBackup(backup.id)
            }}
            onArmRestore={() => {
              setRestoreArmed(backup.id)
            }}
            onCancelRestore={() => setRestoreArmed(null)}
            onConfirmRestore={() => {
              void restoreBackup(backup.id)
            }}
          />
        ))}
        {backups.length === 0 ? (
          <EmptyState title="No backups yet." />
        ) : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  rowMain: {
    gap: 2,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  restoreBox: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.bgInput,
  },
  restoreCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  confirmName: {
    color: colors.text,
    fontWeight: '700',
  },
})
