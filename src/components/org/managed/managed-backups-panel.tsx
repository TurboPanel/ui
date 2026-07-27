import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { formatBytes } from '@/lib/format-metrics'
import {
  managedErrorMessage,
  shortBackupChecksum,
  type ManagedBackupRecord,
} from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

function DeleteActions({
  armed,
  disabled,
  onConfirm,
  onCancel,
  onArm,
  buttonStyle,
}: Readonly<{
  armed: boolean
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
  onArm: () => void
  buttonStyle?: StyleProp<ViewStyle>
}>) {
  if (armed) {
    return (
      <View style={styles.rowActions}>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onConfirm}
        >
          <Text style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}>
            Confirm delete
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer, buttonStyle]}
      disabled={disabled}
      onPress={onArm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Delete</Text>
    </Pressable>
  )
}

function BackupRow({
  backup,
  canManage,
  disabled,
  managedDisplayName,
  deleteArmed,
  restoreArmed,
  working,
  onArmDelete,
  onCancelDelete,
  onConfirmDelete,
  onArmRestore,
  onCancelRestore,
  onConfirmRestore,
}: Readonly<{
  backup: ManagedBackupRecord
  canManage: boolean
  disabled: boolean
  managedDisplayName: string
  deleteArmed: boolean
  restoreArmed: boolean
  working: boolean
  onArmDelete: () => void
  onCancelDelete: () => void
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
        <Text style={orgPanelStyles.muted}>
          {formatBytes(backup.sizeBytes)}
          {backup.database ? ` · ${backup.database}` : ''} ·{' '}
          {shortBackupChecksum(backup.checksum)}
        </Text>
      </View>

      {canManage ? (
        <View style={styles.rowActions}>
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnSecondary,
              webPointer,
              disabled && styles.disabled,
            ]}
            disabled={disabled}
            onPress={onArmRestore}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Restore</Text>
          </Pressable>
          <DeleteActions
            armed={deleteArmed}
            disabled={disabled}
            onConfirm={onConfirmDelete}
            onCancel={onCancelDelete}
            onArm={onArmDelete}
          />
        </View>
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
          <TextInput
            style={Platform.OS === 'web' ? webInputStyle : styles.input}
            value={restoreConfirmText}
            onChangeText={setRestoreConfirmText}
            placeholder={managedDisplayName}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!working}
          />
          <View style={styles.rowActions}>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                webPointer,
                !canConfirmRestore && styles.disabled,
              ]}
              disabled={!canConfirmRestore}
              onPress={onConfirmRestore}
            >
              <Text style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}>
                {working ? 'Restoring…' : 'Confirm restore'}
              </Text>
            </Pressable>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={() => {
                setRestoreConfirmText('')
                onCancelRestore()
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
            </Pressable>
          </View>
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
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
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
      setDeleteArmed(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete backup'))
      setDeleteArmed(null)
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
        <Text style={orgPanelStyles.muted}>
          Backups are not supported on this managed engine yet.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Backups" hint="Back up and restore this managed service">
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {canManage ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            disabled && styles.disabled,
          ]}
          disabled={disabled}
          onPress={() => {
            void backupNow()
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            {working ? 'Backing up…' : 'Back up now'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.list}>
        {backups.map((backup) => (
          <BackupRow
            key={backup.id}
            backup={backup}
            canManage={canManage}
            disabled={disabled}
            managedDisplayName={managedDisplayName}
            deleteArmed={deleteArmed === backup.id}
            restoreArmed={restoreArmed === backup.id}
            working={working}
            onArmDelete={() => {
              setDeleteArmed(backup.id)
              setRestoreArmed(null)
            }}
            onCancelDelete={() => setDeleteArmed(null)}
            onConfirmDelete={() => {
              void deleteBackup(backup.id)
            }}
            onArmRestore={() => {
              setRestoreArmed(backup.id)
              setDeleteArmed(null)
            }}
            onCancelRestore={() => setRestoreArmed(null)}
            onConfirmRestore={() => {
              void restoreBackup(backup.id)
            }}
          />
        ))}
        {backups.length === 0 ? (
          <Text style={orgPanelStyles.muted}>No backups yet.</Text>
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
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  danger: {
    color: colors.error,
  },
  disabled: {
    opacity: 0.55,
  },
})
