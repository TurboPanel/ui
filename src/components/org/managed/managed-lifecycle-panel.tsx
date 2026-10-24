import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, TextField } from '@/components/ui'
import { SectionHeading } from '@/components/ui/v4'
import type { ManagedStatus } from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

export function ManagedLifecyclePanel({
  status,
  projectName,
  canManage,
  busy,
  onLifecycle,
  onApply,
  onDelete,
}: Readonly<{
  status: ManagedStatus
  projectName: string
  canManage: boolean
  busy: boolean
  onLifecycle: (action: 'start' | 'stop' | 'restart') => Promise<void>
  onApply: () => Promise<void>
  onDelete: () => Promise<void>
}>) {
  const [confirmText, setConfirmText] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applying = status === 'applying' || busy || working
  const canConfirmDelete =
    confirmText.trim() === projectName && !applying

  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(userErrorMessage(err, 'Action failed'))
    } finally {
      setWorking(false)
    }
  }

  const heading = (
    <SectionHeading title="Danger zone" note="Start, stop or destroy the database" danger />
  )

  if (!canManage) {
    return (
      <View style={styles.root}>
        {heading}
        <Text style={panelStyles.muted}>
          You need manage permission to start, stop or destroy the database.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {heading}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <ButtonRow>
        <Button
          label="Start"
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('start'))
          }}
        />
        <Button
          label="Stop"
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('stop'))
          }}
        />
        <Button
          label="Restart"
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('restart'))
          }}
        />
        <Button
          label="Apply changes"
          variant="primary"
          disabled={applying}
          onPress={() => {
            void run(onApply)
          }}
        />
        <Button
          label="Destroy database"
          variant="danger"
          disabled={applying}
          onPress={() => setShowDelete((current) => !current)}
        />
      </ButtonRow>

      {showDelete ? (
        <View style={styles.deleteBox}>
          <Text style={styles.deleteCopy}>
            Type <Text style={styles.confirmName}>{projectName}</Text> to destroy this database and
            its data for good. The environment stays.
          </Text>
          <TextField
            label="Confirmation"
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={projectName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!applying}
          />
          <ButtonRow>
            <Button
              label="Confirm delete"
              busyLabel="Deleting…"
              variant="danger"
              busy={working}
              disabled={!canConfirmDelete}
              onPress={() => {
                void run(async () => {
                  await onDelete()
                  setShowDelete(false)
                  setConfirmText('')
                })
              }}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setShowDelete(false)
                setConfirmText('')
              }}
            />
          </ButtonRow>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  deleteBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.bgSecondary,
  },
  deleteCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  confirmName: {
    color: colors.text,
    fontWeight: '700',
  },
})
