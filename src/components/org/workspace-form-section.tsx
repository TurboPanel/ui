import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { createWorkspace, fetchWorkspace, updateWorkspace } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

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

export function WorkspaceFormSection({
  orgId,
  workspaceId,
  mode,
}: {
  orgId: string
  workspaceId?: string
  mode: 'create' | 'edit'
}) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string
    description?: string
  }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingWorkspace, setLoadingWorkspace] = useState(mode === 'edit')

  useEffect(() => {
    if (mode !== 'edit' || !workspaceId) {
      return
    }

    let cancelled = false

    const load = async () => {
      setLoadingWorkspace(true)
      setApiError(null)
      try {
        const result = await fetchWorkspace(workspaceId)
        if (!cancelled) {
          setDisplayName(result.workspace.displayName ?? '')
          setDescription(result.workspace.description ?? '')
        }
      } catch (err) {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Failed to load workspace')
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkspace(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [mode, workspaceId])

  const validate = (): { displayName?: string; description?: string } => {
    const trimmedName = displayName.trim()
    const errors: { displayName?: string; description?: string } = {}

    if (!trimmedName) {
      errors.displayName = 'Name is required.'
    } else if (trimmedName.length > 255) {
      errors.displayName = 'Name must be 255 characters or fewer.'
    } else if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
      errors.displayName =
        'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
    }

    if (description.length > 255) {
      errors.description = 'Description must be 255 characters or fewer.'
    }

    return errors
  }

  const handleSubmit = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSubmitting(true)
    setApiError(null)
    try {
      const trimmedDescription = description.trim()
      if (mode === 'create') {
        await createWorkspace({
          displayName: displayName.trim(),
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
        })
      } else {
        await updateWorkspace(workspaceId!, {
          displayName: displayName.trim(),
          description: trimmedDescription,
        })
      }
      router.replace(`/${orgId}/workspaces`)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save workspace')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = (hasError: boolean) => [
    Platform.OS === 'web'
      ? {
          ...webInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.input,
    hasError && Platform.OS !== 'web' && styles.inputError,
  ]

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{mode === 'create' ? 'New workspace' : 'Edit workspace'}</Text>

      <SectionPanel title={mode === 'create' ? 'New workspace' : 'Edit workspace'}>
        {loadingWorkspace ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={inputStyle(Boolean(fieldErrors.displayName))}
                value={displayName}
                onChangeText={(t) => {
                  setDisplayName(t)
                  setFieldErrors({})
                }}
                placeholder="e.g. Product or Marketing"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!submitting}
                maxLength={255}
              />
              {fieldErrors.displayName ? (
                <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={inputStyle(Boolean(fieldErrors.description))}
                value={description}
                onChangeText={(t) => {
                  setDescription(t)
                  setFieldErrors((prev) => ({ ...prev, description: undefined }))
                }}
                placeholder="Optional description"
                placeholderTextColor={colors.textDim}
                editable={!submitting}
                maxLength={255}
                multiline
              />
              {fieldErrors.description ? (
                <Text style={styles.fieldError}>{fieldErrors.description}</Text>
              ) : null}
            </View>

            {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                disabled={submitting}
                onPress={() => void handleSubmit()}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Saving…' : mode === 'create' ? 'Create workspace' : 'Save changes'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                disabled={submitting}
                onPress={() => router.replace(`/${orgId}/workspaces`)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  field: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
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
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
