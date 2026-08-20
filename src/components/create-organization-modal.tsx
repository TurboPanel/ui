import { useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { foldDisplayNameApostrophes, DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from '@/lib/display-name'
import { colors, layout, spacing } from '@/lib/theme'

type CreateOrganizationModalProps = Readonly<{
  visible: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string }>
}>

export function CreateOrganizationModal({
  visible,
  onClose,
  onCreate,
}: CreateOrganizationModalProps) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [name, setName] = useState('New Organization')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName('New Organization')
    setError(null)
    setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting) {
      return
    }
    reset()
    onClose()
  }

  const handleCreate = async () => {
    const displayName = foldDisplayNameApostrophes(name).trim()
    const validationError = validateDisplayName(displayName)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)
    const result = await onCreate(name)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not create organization.')
      return
    }
    reset()
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close create organization dialog"
        />
        <View style={[styles.panel, isCompact && styles.panelSheet]}>
          <Text style={styles.title}>Create organization</Text>
          <Text style={styles.copy}>
            You will be the owner of the new organization and can invite others later.
          </Text>

          <Text style={styles.fieldLabel}>Organization name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value)
              if (error) {
                setError(null)
              }
            }}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!submitting}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            accessibilityLabel="Organization name"
          />
          {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnSecondary,
                pressed && styles.itemPressed,
                webPointer,
              ]}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnPrimary,
                pressed && styles.itemPressed,
                submitting && styles.disabled,
                webPointer,
              ]}
              onPress={() => {
                handleCreate().catch(() => {
                  setSubmitting(false)
                  setError('Could not create organization.')
                })
              }}
              disabled={submitting}
            >
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                {submitting ? 'Creating…' : 'Create'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    padding: spacing.lg,
    gap: spacing.sm,
    zIndex: 2,
  },
  panelSheet: {
    marginTop: 'auto',
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  itemPressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
})
