import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  Button,
  EmptyState,
  FormField,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  DESCRIPTION_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
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
import { userWorkspaces } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FORM_MAX_WIDTH = 440

type WorkspaceMode = 'existing' | 'new'

const WORKSPACE_MODE_OPTIONS = [
  { value: 'existing', label: 'Existing' },
  { value: 'new', label: 'Create new' },
] as const

type FieldErrors = {
  name?: string
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
  return workspace.name?.trim() || 'Workspace'
}

/** Shown / submitted workspace name: mirrors project until the operator overrides. */
function resolveMirroredWorkspaceName(
  projectName: string,
  workspaceName: string,
  overridden: boolean,
): string {
  if (overridden) return workspaceName.trim()
  return projectName.trim()
}

function resolveLoadError(
  workspacesError: unknown,
  projectsError: unknown,
): string | null {
  if (workspacesError instanceof Error) return workspacesError.message
  if (projectsError instanceof Error) return projectsError.message
  return null
}

function conflictOrRawError(error: string | null | undefined): string | null {
  if (!error) return null
  return displayNameConflictMessage(error) ?? error
}

function validateProjectCreateFields(options: {
  name: string
  description: string
  workspaceMode: WorkspaceMode
  pickedWorkspaceId: string
  /** Ids the picker offers — existing mode must pick one of these. */
  allowedWorkspaceIds: readonly string[]
  newWorkspaceName: string
  newWorkspaceNameOverridden: boolean
  projectNames: readonly (string | null | undefined)[]
  workspaceNames: readonly (string | null | undefined)[]
}): FieldErrors {
  const errors: FieldErrors = {}
  const nameError = validateDisplayName(options.name)
  if (nameError) errors.name = nameError
  else if (isDisplayNameTaken(options.name, options.projectNames)) {
    errors.name =
      'A project with this name already exists in the organization.'
  }

  const descriptionError = validateDescription(options.description)
  if (descriptionError) errors.description = descriptionError

  if (options.workspaceMode === 'existing') {
    if (!options.pickedWorkspaceId) {
      errors.workspaceId = 'Select a workspace.'
    } else if (
      !options.allowedWorkspaceIds.includes(options.pickedWorkspaceId)
    ) {
      errors.workspaceId = 'Select a user workspace.'
    }
    return errors
  }

  const workspaceName = resolveMirroredWorkspaceName(
    options.name,
    options.newWorkspaceName,
    options.newWorkspaceNameOverridden,
  )
  const workspaceNameError = validateDisplayName(workspaceName)
  if (workspaceNameError) {
    errors.workspaceName = options.newWorkspaceNameOverridden
      ? workspaceNameError
      : 'Project name is required before creating a matching workspace.'
  } else if (isDisplayNameTaken(workspaceName, options.workspaceNames)) {
    errors.workspaceName =
      'A workspace with this name already exists in the organization.'
  }

  return errors
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
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </View>
  )
}

function NewWorkspaceFields({
  value,
  workspaceNameError,
  onChange,
}: Readonly<{
  value: string
  workspaceNameError?: string
  onChange: (name: string) => void
}>) {
  return (
    <TextField
      label="Workspace name"
      value={value}
      onChangeText={onChange}
      autoCapitalize="words"
      accessibilityLabel="Workspace name"
      maxLength={DISPLAY_NAME_MAX_LENGTH}
      error={workspaceNameError}
    />
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
        <NewWorkspaceFields
          value={newWorkspaceNameValue}
          workspaceNameError={fieldErrors.workspaceName}
          onChange={onNewWorkspaceNameChange}
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
      [...userWorkspaces(workspacesQuery.data?.workspaces ?? [])].sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
      ),
    [workspacesQuery.data?.workspaces],
  )
  const allowedWorkspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces],
  )
  const projectNames = useMemo(
    () => (projectsQuery.data?.projects ?? []).map((row) => row.name),
    [projectsQuery.data?.projects],
  )
  const loadingWorkspaces = workspacesQuery.isLoading || projectsQuery.isLoading

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('existing')
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceNameOverridden, setNewWorkspaceNameOverridden] =
    useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  const scopedWorkspaceId = resolveScopedWorkspaceId(
    params.workspaceId,
    workspaceScope?.scopeId,
  )

  /** True when URL/scope pointed at system (or unknown) workspace — not creatable. */
  const scopedWorkspaceBlocked = useMemo(() => {
    if (!scopedWorkspaceId || loadingWorkspaces) return false
    return !allowedWorkspaceIds.includes(scopedWorkspaceId)
  }, [scopedWorkspaceId, loadingWorkspaces, allowedWorkspaceIds])

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
    if (!scopedWorkspaceId || loadingWorkspaces) return
    if (!allowedWorkspaceIds.includes(scopedWorkspaceId)) {
      setPickedWorkspaceId('')
      return
    }
    setWorkspaceMode('existing')
    setPickedWorkspaceId(scopedWorkspaceId)
  }, [scopedWorkspaceId, loadingWorkspaces, allowedWorkspaceIds])

  useEffect(() => {
    if (pickedWorkspaceId) return
    if (
      scopedWorkspaceId &&
      allowedWorkspaceIds.includes(scopedWorkspaceId)
    ) {
      return
    }
    if (workspaces.length === 1) {
      setPickedWorkspaceId(workspaces[0]?.id ?? '')
    }
  }, [workspaces, pickedWorkspaceId, scopedWorkspaceId, allowedWorkspaceIds])

  const submit = async () => {
    const errors = validateProjectCreateFields({
      name: displayName.trim(),
      description,
      workspaceMode,
      pickedWorkspaceId,
      allowedWorkspaceIds,
      newWorkspaceName,
      newWorkspaceNameOverridden,
      projectNames,
      workspaceNames: workspaces.map((workspace) => workspace.name),
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setApiError(null)

    const trimmedName = displayName.trim()
    const trimmedDescription = description.trim()

    let workspaceId = pickedWorkspaceId
    if (workspaceMode === 'new') {
      const workspaceName = resolveMirroredWorkspaceName(
    trimmedName,
        newWorkspaceName,
        newWorkspaceNameOverridden,
      )
      const workspaceResult = await createWorkspace.run({
        name: workspaceName,
      })
      if (!workspaceResult.ok) {
        setApiError(conflictOrRawError(workspaceResult.error))
        return
      }
      workspaceId = workspaceResult.value.id
      await workspaceScope?.refreshWorkspaces()
    } else if (!allowedWorkspaceIds.includes(workspaceId)) {
      setFieldErrors({ workspaceId: 'Select a user workspace.' })
      return
    }

    const result = await createProject.run({
      type: 'empty',
      workspaceId,
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    })
    if (!result.ok) {
      setApiError(conflictOrRawError(result.error))
      return
    }

    router.replace(projectSetupHref(orgId, result.value.id) as Href)
  }

  const submitting = createWorkspace.isPending || createProject.isPending
  const trimmedProjectName = displayName.trim()
  const mirroredWorkspaceName = resolveMirroredWorkspaceName(
    trimmedProjectName,
    newWorkspaceName,
    newWorkspaceNameOverridden,
  )

  const handleNewWorkspaceNameChange = (text: string) => {
    // Blank field resumes mirroring the project name as they type.
    if (text.trim() === '') {
      setNewWorkspaceNameOverridden(false)
      setNewWorkspaceName('')
      return
    }
    setNewWorkspaceNameOverridden(true)
    setNewWorkspaceName(text)
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
    >
      <View style={styles.column}>
        <View style={styles.pageHeader}>
          <Text style={[orgPanelStyles.pageTitle, styles.centeredText]}>
            New project
          </Text>
          <Text style={[orgPanelStyles.pageCopy, styles.centeredText]}>
            Creates a {defaultEnvironmentName} environment. Choose type next.
          </Text>
        </View>

        <GlassSurface style={styles.panel} intensity="regular">
          <View style={styles.panelBody}>
            {apiError ?? loadError ? (
              <Text style={orgPanelStyles.error}>{apiError ?? loadError}</Text>
            ) : null}

            {scopedWorkspaceBlocked ? (
              <SystemManagedNotice
                title="Platform workspace"
                description="Projects cannot be created in the System workspace. Choose a user workspace below."
                onBack={() => {
                  router.replace(`/${orgId}/projects` as Href)
                }}
                backLabel="Back to projects"
              />
            ) : null}

            <TextField
              label="Name"
              value={displayName}
              onChangeText={setDisplayName}
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
              onChangeText={setDescription}
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
              newWorkspaceNameValue={mirroredWorkspaceName}
              onWorkspaceModeChange={setWorkspaceMode}
              onPickedWorkspaceIdChange={setPickedWorkspaceId}
              onNewWorkspaceNameChange={handleNewWorkspaceNameChange}
            />

            <Button
              label="Create project"
              busyLabel="Creating…"
              variant="primary"
              busy={submitting}
              onPress={() => {
                void submit()
              }}
              accessibilityLabel="Create project"
            />
          </View>
        </GlassSurface>

        <Pressable
          style={[styles.cancelLink, webPointer]}
          onPress={() => {
            router.replace(`/${orgId}/projects` as Href)
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  root: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  column: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing.md,
  },
  pageHeader: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  panel: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  panelBody: {
    padding: spacing.lg,
    gap: spacing.md,
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
  cancelLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cancelLinkText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
})
