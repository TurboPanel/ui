import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { ManagedStatus } from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

export function ManagedLifecyclePanel({
  status,
  projectDisplayName,
  canManage,
  busy,
  onLifecycle,
  onApply,
  onDelete,
}: Readonly<{
  status: ManagedStatus
  projectDisplayName: string
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
    confirmText.trim() === projectDisplayName && !applying

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
        <Text style={orgPanelStyles.muted}>
          You need manage permission to change lifecycle.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Lifecycle" hint="Start, stop, apply, or delete">
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            applying && styles.disabled,
          ]}
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('start'))
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Start</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            applying && styles.disabled,
          ]}
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('stop'))
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Stop</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            applying && styles.disabled,
          ]}
          disabled={applying}
          onPress={() => {
            void run(() => onLifecycle('restart'))
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Restart</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            applying && styles.disabled,
          ]}
          disabled={applying}
          onPress={() => {
            void run(onApply)
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Apply changes</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            applying && styles.disabled,
          ]}
          disabled={applying}
          onPress={() => setShowDelete((current) => !current)}
        >
          <Text style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}>
            Delete
          </Text>
        </Pressable>
      </View>

      {showDelete ? (
        <View style={styles.deleteBox}>
          <Text style={styles.deleteCopy}>
            Type <Text style={styles.confirmName}>{projectDisplayName}</Text> to
            permanently delete this managed service.
          </Text>
          <TextInput
            style={Platform.OS === 'web' ? styles.webInput : styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={projectDisplayName}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!applying}
          />
          <View style={styles.actions}>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                webPointer,
                !canConfirmDelete && styles.disabled,
              ]}
              disabled={!canConfirmDelete}
              onPress={() => {
                void run(async () => {
                  await onDelete()
                  setShowDelete(false)
                  setConfirmText('')
                })
              }}
            >
              <Text style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}>
                {working ? 'Deleting…' : 'Confirm delete'}
              </Text>
            </Pressable>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={() => {
                setShowDelete(false)
                setConfirmText('')
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  webInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
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
