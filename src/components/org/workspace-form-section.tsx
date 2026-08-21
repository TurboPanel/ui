import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { Button, ButtonRow, LoadingState, TextField } from '@/components/ui'
import { displayNameConflictMessage, DESCRIPTION_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import type { WorkspaceRecord } from '@/lib/instance-api'
import {
  useCreateWorkspace,
  useUpdateWorkspace,
  useWorkspace,
} from '@/lib/queries'
import { isTurbopanelWorkspace } from '@/lib/system-inventory'
import { spacing } from '@/lib/theme'
import {
  validateWorkspaceDescription,
  validateWorkspaceName,
} from '@/lib/workspace-validation'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

type WorkspaceFormMode = 'create' | 'edit'
type WorkspaceFieldErrors = {
  name?: string
  description?: string
}

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
      <TextField
        label="Name *"
        value={name}
        onChangeText={onDisplayNameChange}
        placeholder="e.g. Product or Marketing"
        autoCapitalize="words"
        autoCorrect={false}
        editable={!submitting}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        error={fieldErrors.name}
      />

      <TextField
        label="Description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Optional description"
        editable={!submitting}
        maxLength={DESCRIPTION_MAX_LENGTH}
        multiline
        error={fieldErrors.description}
      />

      {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}

      <ButtonRow>
        <Button
          label={submitLabel}
          variant="primary"
          busy={submitting}
          onPress={onSubmit}
        />
        <Button
          label="Cancel"
          variant="secondary"
          disabled={submitting}
          onPress={onCancel}
        />
      </ButtonRow>
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
        <SectionPanel title={heading}>
          <SystemManagedNotice onBack={() => router.replace(workspacesHref)} />
        </SectionPanel>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <SectionPanel title={heading}>
        {loadingWorkspace ? (
          <LoadingState />
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
})
