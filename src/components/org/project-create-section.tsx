import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { WizardStepIndicator } from '@/components/org/wizard-step-indicator'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  displayNameConflictMessage,
  isDisplayNameTaken,
  validateDescription,
  validateDisplayName,
} from '@/lib/display-name'
import type { WorkspaceRecord } from '@/lib/instance-api'
import {
  useCreateProject,
  useCreateWorkspace,
  useProjects,
  useWorkspaces,
} from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectSetupHref } from '@/lib/project-navigation'
import { chrome, colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

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

type WorkspaceMode = 'existing' | 'new'
type NewWorkspaceNameMode = 'sameAsProject' | 'custom'

type FieldErrors = {
  displayName?: string
  description?: string
  workspaceId?: string
  workspaceName?: string
}

function resolveScopedWorkspaceId(
  paramWorkspaceId: string | string[] | undefined,
  scopeId: string | undefined,
): string | undefined {
  if (typeof paramWorkspaceId === 'string' && paramWorkspaceId) {
    return paramWorkspaceId
  }
  if (scopeId && scopeId !== ALL_WORKSPACES_SCOPE) {
    return scopeId
  }
  return undefined
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return workspace.displayName?.trim() || 'Workspace'
}

function resolveNewWorkspaceName(
  nameMode: NewWorkspaceNameMode,
  projectName: string,
  customWorkspaceName: string,
): string {
  if (nameMode === 'sameAsProject') return projectName.trim()
  return customWorkspaceName.trim()
}

function resolveLoadError(
  workspacesError: unknown,
  projectsError: unknown,
): string | null {
  if (workspacesError instanceof Error) return workspacesError.message
  if (projectsError instanceof Error) return projectsError.message
  return null
}

function conflictOrRawError(error: string | undefined): string | null {
  if (!error) return null
  return displayNameConflictMessage(error) ?? error
}

function validateProjectCreateFields(options: {
  displayName: string
  description: string
  workspaceMode: WorkspaceMode
  pickedWorkspaceId: string
  newWorkspaceNameMode: NewWorkspaceNameMode
  customWorkspaceName: string
  projectNames: readonly (string | null | undefined)[]
  workspaceNames: readonly (string | null | undefined)[]
}): FieldErrors {
  const errors: FieldErrors = {}
  const nameError = validateDisplayName(options.displayName)
  if (nameError) errors.displayName = nameError
  else if (isDisplayNameTaken(options.displayName, options.projectNames)) {
    errors.displayName =
      'A project with this name already exists in the organization.'
  }

  const descriptionError = validateDescription(options.description)
  if (descriptionError) errors.description = descriptionError

  if (options.workspaceMode === 'existing') {
    if (!options.pickedWorkspaceId) {
      errors.workspaceId = 'Select a workspace.'
    }
    return errors
  }

  const workspaceName = resolveNewWorkspaceName(
    options.newWorkspaceNameMode,
    options.displayName,
    options.customWorkspaceName,
  )
  const workspaceNameError = validateDisplayName(workspaceName)
  if (workspaceNameError) {
    errors.workspaceName =
      options.newWorkspaceNameMode === 'sameAsProject'
        ? 'Project name is required before creating a matching workspace.'
        : workspaceNameError
  } else if (isDisplayNameTaken(workspaceName, options.workspaceNames)) {
    errors.workspaceName =
      'A workspace with this name already exists in the organization.'
  }

  return errors
}

function SegmentChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (next: T) => void
}>) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={orgPanelStyles.segmentGroup}>
        {options.map((option) => {
          const active = value === option.id
          return (
            <Pressable
              key={option.id}
              style={[
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                webPointer,
              ]}
              onPress={() => onChange(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </>
  )
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
    return <Text style={orgPanelStyles.muted}>Loading workspaces…</Text>
  }
  if (workspaces.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No workspaces yet — switch to Create new.
      </Text>
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
    <>
      <Text style={styles.label}>Existing workspace</Text>
      <WorkspacePickerBody
        workspaces={workspaces}
        loading={loading}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </>
  )
}

function NewWorkspaceFields({
  displayName,
  nameMode,
  customWorkspaceName,
  workspaceNameError,
  inputStyle,
  onNameModeChange,
  onCustomNameChange,
}: Readonly<{
  displayName: string
  nameMode: NewWorkspaceNameMode
  customWorkspaceName: string
  workspaceNameError?: string
  inputStyle: (hasError: boolean) => StyleProp<TextStyle>
  onNameModeChange: (mode: NewWorkspaceNameMode) => void
  onCustomNameChange: (name: string) => void
}>) {
  const trimmedProjectName = displayName.trim()
  const sameAsProjectHint = trimmedProjectName
    ? `Will create workspace "${trimmedProjectName}".`
    : 'Uses the project name once you enter it.'

  return (
    <>
      <SegmentChoice
        label="New workspace name"
        options={[
          { id: 'sameAsProject', label: 'Same as project' },
          { id: 'custom', label: 'Custom' },
        ]}
        value={nameMode}
        onChange={onNameModeChange}
      />
      {nameMode === 'sameAsProject' ? (
        <Text style={orgPanelStyles.muted}>{sameAsProjectHint}</Text>
      ) : (
        <>
          <Text style={styles.label}>Workspace name</Text>
          <TextInput
            value={customWorkspaceName}
            onChangeText={onCustomNameChange}
            placeholder="My workspace"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            accessibilityLabel="Workspace name"
            style={inputStyle(Boolean(workspaceNameError))}
          />
        </>
      )}
      {workspaceNameError ? (
        <Text style={orgPanelStyles.error}>{workspaceNameError}</Text>
      ) : null}
    </>
  )
}

function ProjectWorkspaceFields({
  workspaceMode,
  workspaces,
  loadingWorkspaces,
  pickedWorkspaceId,
  fieldErrors,
  displayName,
  newWorkspaceNameMode,
  customWorkspaceName,
  inputStyle,
  onWorkspaceModeChange,
  onPickedWorkspaceIdChange,
  onNewWorkspaceNameModeChange,
  onCustomWorkspaceNameChange,
}: Readonly<{
  workspaceMode: WorkspaceMode
  workspaces: WorkspaceRecord[]
  loadingWorkspaces: boolean
  pickedWorkspaceId: string
  fieldErrors: FieldErrors
  displayName: string
  newWorkspaceNameMode: NewWorkspaceNameMode
  customWorkspaceName: string
  inputStyle: (hasError: boolean) => StyleProp<TextStyle>
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onPickedWorkspaceIdChange: (id: string) => void
  onNewWorkspaceNameModeChange: (mode: NewWorkspaceNameMode) => void
  onCustomWorkspaceNameChange: (name: string) => void
}>) {
  return (
    <>
      <SegmentChoice
        label="Workspace"
        options={[
          { id: 'existing', label: 'Existing' },
          { id: 'new', label: 'Create new' },
        ]}
        value={workspaceMode}
        onChange={onWorkspaceModeChange}
      />
      {workspaceMode === 'existing' ? (
        <WorkspacePicker
          workspaces={workspaces}
          loading={loadingWorkspaces}
          selectedId={pickedWorkspaceId}
          error={fieldErrors.workspaceId}
          onSelect={onPickedWorkspaceIdChange}
        />
      ) : (
        <NewWorkspaceFields
          displayName={displayName}
          nameMode={newWorkspaceNameMode}
          customWorkspaceName={customWorkspaceName}
          workspaceNameError={fieldErrors.workspaceName}
          inputStyle={inputStyle}
          onNameModeChange={onNewWorkspaceNameModeChange}
          onCustomNameChange={onCustomWorkspaceNameChange}
        />
      )}
    </>
  )
}

/**
 * Step 1 of project setup: create an empty project (org default environment once).
 * Type / catalog selection continues on the project setup screen.
 */
export function ProjectCreateSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const params = useLocalSearchParams<{ workspaceId?: string }>()
  const workspaceScope = useOptionalWorkspaceScope()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)

  const workspacesQuery = useWorkspaces(orgId)
  const projectsQuery = useProjects(orgId)
  const createWorkspace = useCreateWorkspace(orgId)
  const createProject = useCreateProject(orgId)

  const workspaces = useMemo(
    () =>
      [...(workspacesQuery.data?.workspaces ?? [])].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [workspacesQuery.data?.workspaces],
  )
  const projectNames = useMemo(
    () => (projectsQuery.data?.projects ?? []).map((row) => row.displayName),
    [projectsQuery.data?.projects],
  )
  const loadingWorkspaces = workspacesQuery.isLoading || projectsQuery.isLoading

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('existing')
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState('')
  const [newWorkspaceNameMode, setNewWorkspaceNameMode] =
    useState<NewWorkspaceNameMode>('sameAsProject')
  const [customWorkspaceName, setCustomWorkspaceName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  const scopedWorkspaceId = resolveScopedWorkspaceId(
    params.workspaceId,
    workspaceScope?.scopeId,
  )

  const loadError = resolveLoadError(
    workspacesQuery.error,
    projectsQuery.error,
  )

  useEffect(() => {
    if (workspaces.length === 0 && !loadingWorkspaces) {
      setWorkspaceMode('new')
    }
  }, [workspaces.length, loadingWorkspaces])

  useEffect(() => {
    if (!scopedWorkspaceId) return
    setWorkspaceMode('existing')
    setPickedWorkspaceId(scopedWorkspaceId)
  }, [scopedWorkspaceId])

  useEffect(() => {
    if (pickedWorkspaceId || scopedWorkspaceId) return
    if (workspaces.length === 1) {
      setPickedWorkspaceId(workspaces[0]?.id ?? '')
    }
  }, [workspaces, pickedWorkspaceId, scopedWorkspaceId])

  const submit = async () => {
    const errors = validateProjectCreateFields({
      displayName,
      description,
      workspaceMode,
      pickedWorkspaceId,
      newWorkspaceNameMode,
      customWorkspaceName,
      projectNames,
      workspaceNames: workspaces.map((workspace) => workspace.displayName),
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setApiError(null)

    const trimmedName = displayName.trim()
    const trimmedDescription = description.trim()

    let workspaceId = pickedWorkspaceId
    if (workspaceMode === 'new') {
      const workspaceName = resolveNewWorkspaceName(
        newWorkspaceNameMode,
        displayName,
        customWorkspaceName,
      )
      const workspaceResult = await createWorkspace.run({
        displayName: workspaceName,
      })
      if (!workspaceResult.ok) {
        setApiError(conflictOrRawError(workspaceResult.error))
        return
      }
      workspaceId = workspaceResult.value.id
      await workspaceScope?.refreshWorkspaces()
    }

    const result = await createProject.run({
      type: 'empty',
      workspaceId,
      displayName: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    })
    if (!result.ok) {
      setApiError(conflictOrRawError(result.error))
      return
    }

    router.replace(projectSetupHref(orgId, result.value.id) as Href)
  }

  const inputStyle = (hasError: boolean) => [
    Platform.OS === 'web' ? webInputStyle : styles.input,
    hasError ? styles.inputError : null,
  ]

  const submitting = createWorkspace.isPending || createProject.isPending

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <WizardStepIndicator labels={['Details', 'Type']} activeIndex={0} />

      <SectionPanel
        title="New project"
        hint={`Creates an empty project with a ${defaultEnvironmentName} environment. You choose Compose, template, or managed next.`}
        accent
      >
        {apiError ?? loadError ? (
          <Text style={orgPanelStyles.error}>{apiError ?? loadError}</Text>
        ) : null}

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="My project"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          accessibilityLabel="Project name"
          style={inputStyle(Boolean(fieldErrors.displayName))}
        />
        {fieldErrors.displayName ? (
          <Text style={orgPanelStyles.error}>{fieldErrors.displayName}</Text>
        ) : null}

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Project description"
          style={inputStyle(Boolean(fieldErrors.description))}
        />
        {fieldErrors.description ? (
          <Text style={orgPanelStyles.error}>{fieldErrors.description}</Text>
        ) : null}

        <ProjectWorkspaceFields
          workspaceMode={workspaceMode}
          workspaces={workspaces}
          loadingWorkspaces={loadingWorkspaces}
          pickedWorkspaceId={pickedWorkspaceId}
          fieldErrors={fieldErrors}
          displayName={displayName}
          newWorkspaceNameMode={newWorkspaceNameMode}
          customWorkspaceName={customWorkspaceName}
          inputStyle={inputStyle}
          onWorkspaceModeChange={setWorkspaceMode}
          onPickedWorkspaceIdChange={setPickedWorkspaceId}
          onNewWorkspaceNameModeChange={setNewWorkspaceNameMode}
          onCustomWorkspaceNameChange={setCustomWorkspaceName}
        />

        <Pressable
          style={[
            styles.primaryButton,
            webPointer,
            submitting && styles.disabled,
          ]}
          disabled={submitting}
          onPress={() => {
            void submit()
          }}
          accessibilityRole="button"
          accessibilityLabel="Create project"
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Creating…' : 'Create project'}
          </Text>
        </Pressable>
      </SectionPanel>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  label: {
    color: colors.textLabel,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
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
  workspaceList: {
    gap: spacing.xs,
  },
  workspaceOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  workspaceOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  workspaceOptionText: {
    color: colors.text,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: chrome.accent,
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
})
