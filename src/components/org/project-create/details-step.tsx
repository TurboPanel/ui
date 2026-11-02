import { Link, type Href } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { showsDefaultPill } from '@/components/org/project-create/environment-name'
import { FormDisclosure } from '@/components/org/project-create/form-disclosure'
import { panelStyles } from '@/components/ui/panel-styles'
import type { FieldErrors, WorkspaceMode } from '@/components/org/project-create/validation'
import {
  EmptyState,
  FormField,
  LoadingState,
  SegmentedControl,
  TextField,
  TextLink,
} from '@/components/ui'
import { DESCRIPTION_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { orgProjectSettingsHref } from '@/lib/org-navigation'
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
            style={[styles.workspaceOption, selected && styles.workspaceOptionSelected, webPointer]}
            onPress={() => onSelect(ws.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={workspaceLabel(ws)}
          >
            <Text style={styles.workspaceOptionText}>{workspaceLabel(ws)}</Text>
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
      {workspaces.length > 1 ? <Text style={styles.subLabel}>Choose workspace</Text> : null}
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

/** One line for the closed Workspace section: where the project will land. */
export function workspaceSummary(
  workspaceMode: WorkspaceMode,
  workspaces: readonly WorkspaceRecord[],
  pickedWorkspaceId: string,
  newWorkspaceName: string
): string {
  if (workspaceMode === 'new') {
    const name = newWorkspaceName.trim()
    return name ? `New: ${name}` : 'New workspace'
  }
  const picked = workspaces.find((ws) => ws.id === pickedWorkspaceId)
  return picked ? workspaceLabel(picked) : 'Choose a workspace'
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

/**
 * Name of the project's primary environment (the first one, where the wizard
 * puts the content). Empty means "let the server apply
 * the organization default"; the pill shows only while the value is that default.
 */
export function EnvironmentNameField({
  orgId,
  value,
  defaultName,
  onChange,
  error,
}: Readonly<{
  orgId: string
  value: string
  defaultName: string | null
  onChange: (value: string) => void
  error?: string
}>) {
  const [pillWidth, setPillWidth] = useState(0)
  const showPill = showsDefaultPill(value, defaultName)
  return (
    <TextField
      label="Primary environment name"
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      accessibilityLabel="Primary environment name"
      maxLength={DISPLAY_NAME_MAX_LENGTH}
      placeholder="Organization default"
      style={showPill ? { paddingRight: pillWidth + PILL_INSET } : undefined}
      adornment={
        showPill ? (
          <Text
            style={styles.defaultPill}
            onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
          >
            Organization Default
          </Text>
        ) : null
      }
      footer={
        <Link href={orgProjectSettingsHref(orgId) as Href} asChild>
          <Pressable
            style={StyleSheet.flatten([styles.hintLink, webPointer])}
            accessibilityRole="link"
            accessibilityLabel="Set the primary environment name for this organization"
          >
            <Text style={styles.hintLinkText}>
              Set the primary environment name for this organization
            </Text>
          </Pressable>
        </Link>
      }
      error={error}
    />
  )
}

/**
 * Top of the new-project screen: the name, the workspace it lands in
 * (prefilled when there is one to pick), and an optional description behind
 * a link, with the workspace in a closed section. The first environment is
 * named later, on "Set up production".
 */
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
  openWorkspaceByDefault,
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
  /** Organization Settings › Project Settings: open the Workspace section without being asked. */
  openWorkspaceByDefault: boolean
}>) {
  // Open from the start when there is something to show (an error, or text kept from before).
  const [descriptionOpen, setDescriptionOpen] = useState(
    () => description.length > 0 || fieldErrors.description !== undefined
  )
  const showDescription = descriptionOpen || fieldErrors.description !== undefined
  return (
    <>
      <TextField
        label="Project name"
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="My project"
        autoCapitalize="words"
        autoFocus
        accessibilityLabel="Project name"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        error={fieldErrors.name}
      />

      {showDescription ? (
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
      ) : (
        <TextLink
          label="Add a description"
          size="sm"
          onPress={() => {
            setDescriptionOpen(true)
          }}
        />
      )}

      <FormDisclosure
        title="Workspace"
        summary={workspaceSummary(
          workspaceMode,
          workspaces,
          pickedWorkspaceId,
          newWorkspaceNameValue
        )}
        openByDefault={openWorkspaceByDefault}
        hasError={fieldErrors.workspaceId !== undefined || fieldErrors.workspaceName !== undefined}
      >
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
      </FormDisclosure>
    </>
  )
}

/** Gap between the pill and the input's right edge, plus room before the text. */
const PILL_INSET = 20

const styles = StyleSheet.create({
  defaultPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.accentSoft,
    color: colors.link,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hintLink: {
    alignSelf: 'flex-start',
  },
  hintLinkText: {
    color: colors.link,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
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
