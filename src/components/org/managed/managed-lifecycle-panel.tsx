import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel, TextField } from '@/components/ui'
import type { ManagedStatus } from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

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
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setWorking(false)
    }
  }

  if (!canManage) {
    return (
      <SectionPanel title="Lifecycle" hint="Start, stop, apply, or delete">
        <Text style={panelStyles.muted}>
          You need manage permission to change lifecycle.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Lifecycle" hint="Start, stop, apply, or delete">
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
          label="Delete"
          variant="danger"
          disabled={applying}
          onPress={() => setShowDelete((current) => !current)}
        />
      </ButtonRow>

      {showDelete ? (
        <View style={styles.deleteBox}>
          <Text style={styles.deleteCopy}>
            Type <Text style={styles.confirmName}>{projectName}</Text> to
            permanently delete this managed service.
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
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
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
