import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { displayNameConflictMessage, DESCRIPTION_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import {
  useCreateWorkspace,
  useUpdateWorkspace,
  useWorkspace,
} from '@/lib/queries'
import { isSystemWorkspace } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  validateWorkspaceDescription,
  validateWorkspaceName,
} from '@/lib/workspace-validation'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

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
}: Readonly<{
  orgId: string
  workspaceId?: string
  mode: 'create' | 'edit'
}>) {
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const workspaceQuery = useWorkspace(orgId, workspaceId ?? '', {
    enabled: mode === 'edit' && Boolean(workspaceId),
  })
  const createWorkspace = useCreateWorkspace(orgId)
  const updateWorkspace = useUpdateWorkspace(orgId, workspaceId ?? '')

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string
    description?: string
  }>({})

  useEffect(() => {
    if (mode === 'edit' && workspaceQuery.data?.workspace) {
      setDisplayName(workspaceQuery.data.workspace.displayName ?? '')
      setDescription(workspaceQuery.data.workspace.description ?? '')
    }
  }, [mode, workspaceQuery.data?.workspace])

  const validate = (): { displayName?: string; description?: string } => {
    const errors: { displayName?: string; description?: string } = {}
    const nameError = validateWorkspaceName(displayName)
    if (nameError) {
      errors.displayName = nameError
    }
    const descriptionError = validateWorkspaceDescription(description)
    if (descriptionError) {
      errors.description = descriptionError
    }
    return errors
  }

  const handleSubmit = async () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    const trimmedDescription = description.trim()
    if (mode === 'create') {
      const result = await createWorkspace.run({
        displayName: displayName.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      })
      if (!result.ok) {
        if (result.error) {
          setFieldErrors({
            displayName: displayNameConflictMessage(result.error) ?? result.error,
          })
        }
        return
      }
    } else {
      const result = await updateWorkspace.run({
        displayName: displayName.trim(),
        description: trimmedDescription,
      })
      if (!result.ok) {
        if (result.error) {
          setFieldErrors({
            displayName: displayNameConflictMessage(result.error) ?? result.error,
          })
        }
        return
      }
    }
    await workspaceScope?.refreshWorkspaces()
    router.replace(`/${orgId}/workspaces`)
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

  const submitting = createWorkspace.isPending || updateWorkspace.isPending
  const loadingWorkspace = mode === 'edit' && workspaceQuery.isLoading
  const loadedWorkspace = workspaceQuery.data?.workspace ?? null
  const systemEdit =
    mode === 'edit' && loadedWorkspace != null && isSystemWorkspace(loadedWorkspace)
  const apiError =
    workspaceQuery.error instanceof Error
      ? workspaceQuery.error.message
      : createWorkspace.actionError ?? updateWorkspace.actionError

  let submitLabel = 'Save changes'
  if (submitting) {
    submitLabel = 'Saving…'
  } else if (mode === 'create') {
    submitLabel = 'Create workspace'
  }

  if (systemEdit) {
    return (
      <View style={styles.root}>
        <Text style={styles.heading}>Edit workspace</Text>
        <SectionPanel title="Edit workspace">
          <SystemManagedNotice
            onBack={() => router.replace(`/${orgId}/workspaces`)}
          />
        </SectionPanel>
      </View>
    )
  }

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
                maxLength={DISPLAY_NAME_MAX_LENGTH}
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
                maxLength={DESCRIPTION_MAX_LENGTH}
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
                <Text style={styles.primaryButtonText}>{submitLabel}</Text>
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
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: chrome.onAccent,
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
