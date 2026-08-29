import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import type {
  FieldErrors,
  WorkspaceMode,
} from '@/components/org/project-create/validation'
import {
  EmptyState,
  FormField,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  DESCRIPTION_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
} from '@/lib/display-name'
import type { WorkspaceRecord } from '@/lib/instance-api'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

const WORKSPACE_MODE_OPTIONS = [
  { value: 'existing', label: 'Existing' },
  { value: 'new', label: 'Create new' },
] as const

function workspaceLabel(workspace: WorkspaceRecord): string {
  return workspace.name?.trim() || 'Workspace'
}

function WorkspacePickerBody({
  workspaces,
  loading,
  selectedId,
  onSelect,
}: Readonly<{
  workspaces: WorkspaceRecord[]
  loading: boolean
  selectedId?: string
  onSelect: (workspaceId: string) => void
}>) {
  if (loading) {
    return <LoadingState label="Loading workspaces…" />
  }
  if (workspaces.length === 0) {
    return <EmptyState title="No workspaces yet — switch to Create new." />
  }

  // Single workspace: no need for a tall picker list.
  if (workspaces.length === 1) {
    const only = workspaces[0]
    if (!only) return null
    return (
      <View style={styles.singleWorkspace}>
        <Text style={styles.singleWorkspaceText}>{workspaceLabel(only)}</Text>
      </View>
    )
  }

  return (
    <View style={styles.workspaceList}>
      {workspaces.map((ws) => {
        const selected = selectedId === ws.id
        return (
          <Pressable
            key={ws.id}
            style={[
              styles.workspaceOption,
              selected && styles.workspaceOptionSelected,
              webPointer,
            ]}
            onPress={() => onSelect(ws.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={workspaceLabel(ws)}
          >
            <Text style={styles.workspaceOptionText}>
              {workspaceLabel(ws)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function WorkspacePicker({
  workspaces,
  loading,
  selectedId,
  error,
  onSelect,
}: Readonly<{
  workspaces: WorkspaceRecord[]
  loading: boolean
  selectedId?: string
  error?: string
  onSelect: (workspaceId: string) => void
}>) {
  return (
    <View style={styles.fieldBlock}>
      {workspaces.length > 1 ? (
        <Text style={styles.subLabel}>Choose workspace</Text>
      ) : null}
      <WorkspacePickerBody
        workspaces={workspaces}
        loading={loading}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

function ProjectWorkspaceFields({
  workspaceMode,
  workspaces,
  loadingWorkspaces,
  pickedWorkspaceId,
  fieldErrors,
  newWorkspaceNameValue,
  onWorkspaceModeChange,
  onPickedWorkspaceIdChange,
  onNewWorkspaceNameChange,
}: Readonly<{
  workspaceMode: WorkspaceMode
  workspaces: WorkspaceRecord[]
  loadingWorkspaces: boolean
  pickedWorkspaceId: string
  fieldErrors: FieldErrors
  newWorkspaceNameValue: string
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onPickedWorkspaceIdChange: (id: string) => void
  onNewWorkspaceNameChange: (name: string) => void
}>) {
  return (
    <>
      <FormField label="Workspace">
        <SegmentedControl
          options={WORKSPACE_MODE_OPTIONS}
          value={workspaceMode}
          onChange={onWorkspaceModeChange}
          accessibilityLabel="Workspace"
        />
      </FormField>
      {workspaceMode === 'existing' ? (
        <WorkspacePicker
          workspaces={workspaces}
          loading={loadingWorkspaces}
          selectedId={pickedWorkspaceId}
          error={fieldErrors.workspaceId}
          onSelect={onPickedWorkspaceIdChange}
        />
      ) : (
        <TextField
          label="Workspace name"
          value={newWorkspaceNameValue}
          onChangeText={onNewWorkspaceNameChange}
          autoCapitalize="words"
          accessibilityLabel="Workspace name"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          error={fieldErrors.workspaceName}
        />
      )}
    </>
  )
}

/** Wizard step 1: name, description, and the workspace the project lands in. */
export function DetailsStep({
  displayName,
  description,
  workspaceMode,
  workspaces,
  loadingWorkspaces,
  pickedWorkspaceId,
  newWorkspaceNameValue,
  fieldErrors,
  onDisplayNameChange,
  onDescriptionChange,
  onWorkspaceModeChange,
  onPickedWorkspaceIdChange,
  onNewWorkspaceNameChange,
}: Readonly<{
  displayName: string
  description: string
  workspaceMode: WorkspaceMode
  workspaces: WorkspaceRecord[]
  loadingWorkspaces: boolean
  pickedWorkspaceId: string
  newWorkspaceNameValue: string
  fieldErrors: FieldErrors
  onDisplayNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onPickedWorkspaceIdChange: (id: string) => void
  onNewWorkspaceNameChange: (name: string) => void
}>) {
  return (
    <>
      <TextField
        label="Name"
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="My project"
        autoCapitalize="words"
        autoFocus
        accessibilityLabel="Project name"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        error={fieldErrors.name}
      />

      <TextField
        label="Description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Optional"
        accessibilityLabel="Project description"
        maxLength={DESCRIPTION_MAX_LENGTH}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
        style={styles.descriptionInput}
        error={fieldErrors.description}
      />

      <ProjectWorkspaceFields
        workspaceMode={workspaceMode}
        workspaces={workspaces}
        loadingWorkspaces={loadingWorkspaces}
        pickedWorkspaceId={pickedWorkspaceId}
        fieldErrors={fieldErrors}
        newWorkspaceNameValue={newWorkspaceNameValue}
        onWorkspaceModeChange={onWorkspaceModeChange}
        onPickedWorkspaceIdChange={onPickedWorkspaceIdChange}
        onNewWorkspaceNameChange={onNewWorkspaceNameChange}
      />
    </>
  )
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: spacing.xs,
  },
  subLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionInput: {
    minHeight: 72,
    paddingTop: 10,
    paddingBottom: 10,
  },
  workspaceList: {
    gap: spacing.xs,
    maxHeight: 160,
  },
  workspaceOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  workspaceOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  workspaceOptionText: {
    color: colors.text,
    fontSize: 14,
  },
  singleWorkspace: {
    borderWidth: 1,
    borderColor: colors.borderArea,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  singleWorkspaceText: {
    color: colors.textBody,
    fontSize: 14,
  },
})
