import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { displayNameConflictMessage, DESCRIPTION_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import type { WorkspaceRecord } from '@/lib/instance-api'
import {
  useCreateWorkspace,
  useUpdateWorkspace,
  useWorkspace,
} from '@/lib/queries'
import { isTurbopanelWorkspace } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  validateWorkspaceDescription,
  validateWorkspaceName,
} from '@/lib/workspace-validation'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

type WorkspaceFormMode = 'create' | 'edit'
type WorkspaceFieldErrors = {
  name?: string
  description?: string
}

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

function workspaceFormHeading(mode: WorkspaceFormMode): string {
  return mode === 'create' ? 'New workspace' : 'Edit workspace'
}

function workspaceFormSubmitLabel(
  submitting: boolean,
  mode: WorkspaceFormMode,
): string {
  if (submitting) {
    return 'Saving…'
  }
  if (mode === 'create') {
    return 'Create workspace'
  }
  return 'Save changes'
}

function isTurbopanelWorkspaceEdit(
  mode: WorkspaceFormMode,
  workspace: WorkspaceRecord | null,
): boolean {
  return mode === 'edit' && workspace != null && isTurbopanelWorkspace(workspace)
}

function workspaceFormApiError(
  queryError: unknown,
  createError: string | null,
  updateError: string | null,
): string | undefined {
  if (queryError instanceof Error) {
    return queryError.message
  }
  return createError ?? updateError ?? undefined
}

function conflictOrRawError(error: string | null | undefined): string | undefined {
  if (!error) {
    return undefined
  }
  return displayNameConflictMessage(error) ?? error
}

type WorkspaceFormMutation = Readonly<{
  run: (body: {
    name: string
    description?: string
  }) => Promise<{ ok: true; value: unknown } | { ok: false; error: string | null }>
}>

async function persistWorkspaceForm({
  mode,
  name,
  description,
  createWorkspace,
  updateWorkspace,
}: Readonly<{
  mode: WorkspaceFormMode
  name: string
  description: string
  createWorkspace: WorkspaceFormMutation
  updateWorkspace: WorkspaceFormMutation
}>) {
  if (mode === 'create') {
    const body: { name: string; description?: string } = { name }
    if (description) {
      body.description = description
    }
    return createWorkspace.run(body)
  }
  return updateWorkspace.run({ name: name.trim(), description })
}

function workspaceFieldInputStyle(hasError: boolean) {
  if (Platform.OS === 'web') {
    return {
      ...webInputStyle,
      borderColor: hasError ? colors.error : colors.border,
    }
  }
  return [styles.input, hasError && styles.inputError]
}

function WorkspaceFormFields({
  name,
  description,
  fieldErrors,
  apiError,
  submitting,
  submitLabel,
  onDisplayNameChange,
  onDescriptionChange,
  onSubmit,
  onCancel,
}: Readonly<{
  name: string
  description: string
  fieldErrors: WorkspaceFieldErrors
  apiError: string | undefined
  submitting: boolean
  submitLabel: string
  onDisplayNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}>) {
  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={workspaceFieldInputStyle(Boolean(fieldErrors.name))}
          value={name}
          onChangeText={onDisplayNameChange}
          placeholder="e.g. Product or Marketing"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!submitting}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
        />
        {fieldErrors.name ? (
          <Text style={styles.fieldError}>{fieldErrors.name}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={workspaceFieldInputStyle(Boolean(fieldErrors.description))}
          value={description}
          onChangeText={onDescriptionChange}
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
          onPress={onSubmit}
        >
          <Text style={styles.primaryButtonText}>{submitLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          disabled={submitting}
          onPress={onCancel}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </>
  )
}

export function WorkspaceFormSection({
  orgId,
  workspaceId,
  mode,
}: Readonly<{
  orgId: string
  workspaceId?: string
  mode: WorkspaceFormMode
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
  const [fieldErrors, setFieldErrors] = useState<WorkspaceFieldErrors>({})

  useEffect(() => {
    if (mode === 'edit' && workspaceQuery.data?.workspace) {
      setDisplayName(workspaceQuery.data.workspace.name ?? '')
      setDescription(workspaceQuery.data.workspace.description ?? '')
    }
  }, [mode, workspaceQuery.data?.workspace])

  const validate = (): WorkspaceFieldErrors => {
    const errors: WorkspaceFieldErrors = {}
    const nameError = validateWorkspaceName(displayName)
    if (nameError) {
      errors.name = nameError
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

    const trimmedName = displayName.trim()
    const trimmedDescription = description.trim()
    const result = await persistWorkspaceForm({
      mode,
      name: trimmedName,
      description: trimmedDescription,
      createWorkspace,
      updateWorkspace,
    })
    if (!result.ok) {
      const displayNameError = conflictOrRawError(result.error)
      if (displayNameError) {
        setFieldErrors({ name: displayNameError })
      }
      return
    }
    await workspaceScope?.refreshWorkspaces()
    router.replace(`/${orgId}/workspaces`)
  }

  const submitting = createWorkspace.isPending || updateWorkspace.isPending
  const loadingWorkspace = mode === 'edit' && workspaceQuery.isLoading
  const loadedWorkspace = workspaceQuery.data?.workspace ?? null
  const systemEdit = isTurbopanelWorkspaceEdit(mode, loadedWorkspace)
  const apiError = workspaceFormApiError(
    workspaceQuery.error,
    createWorkspace.actionError,
    updateWorkspace.actionError,
  )
  const heading = workspaceFormHeading(mode)
  const workspacesHref = `/${orgId}/workspaces`

  if (systemEdit) {
    return (
      <View style={styles.root}>
        <Text style={styles.heading}>{heading}</Text>
        <SectionPanel title={heading}>
          <SystemManagedNotice onBack={() => router.replace(workspacesHref)} />
        </SectionPanel>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{heading}</Text>

      <SectionPanel title={heading}>
        {loadingWorkspace ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : (
          <WorkspaceFormFields
            name={displayName}
            description={description}
            fieldErrors={fieldErrors}
            apiError={apiError}
            submitting={submitting}
            submitLabel={workspaceFormSubmitLabel(submitting, mode)}
            onDisplayNameChange={(value) => {
              setDisplayName(value)
              setFieldErrors({})
            }}
            onDescriptionChange={(value) => {
              setDescription(value)
              setFieldErrors((prev) => ({ ...prev, description: undefined }))
            }}
            onSubmit={() => void handleSubmit()}
            onCancel={() => router.replace(workspacesHref)}
          />
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
