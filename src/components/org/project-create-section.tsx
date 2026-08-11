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
import { GlassSurface } from '@/components/glass/glass-surface'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
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
import { userWorkspaces } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FORM_MAX_WIDTH = 440

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 8,
  minHeight: 44,
  width: '100%' as const,
} as const

type WorkspaceMode = 'existing' | 'new'

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
  displayName: string
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
    } else if (
      !options.allowedWorkspaceIds.includes(options.pickedWorkspaceId)
    ) {
      errors.workspaceId = 'Select a user workspace.'
    }
    return errors
  }

  const workspaceName = resolveMirroredWorkspaceName(
    options.displayName,
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
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={[orgPanelStyles.segmentGroup, styles.segmentStretch]}>
        {options.map((option) => {
          const active = value === option.id
          return (
            <Pressable
              key={option.id}
              style={[
                orgPanelStyles.segmentChip,
                styles.segmentChipFlex,
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
    </View>
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
  inputStyle,
  onChange,
}: Readonly<{
  value: string
  workspaceNameError?: string
  inputStyle: (hasError: boolean) => StyleProp<TextStyle>
  onChange: (name: string) => void
}>) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>Workspace name</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="words"
        accessibilityLabel="Workspace name"
        style={inputStyle(Boolean(workspaceNameError))}
      />
      {workspaceNameError ? (
        <Text style={orgPanelStyles.error}>{workspaceNameError}</Text>
      ) : null}
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
  inputStyle,
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
  inputStyle: (hasError: boolean) => StyleProp<TextStyle>
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onPickedWorkspaceIdChange: (id: string) => void
  onNewWorkspaceNameChange: (name: string) => void
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
          value={newWorkspaceNameValue}
          workspaceNameError={fieldErrors.workspaceName}
          inputStyle={inputStyle}
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
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [workspacesQuery.data?.workspaces],
  )
  const allowedWorkspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces],
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
      displayName,
      description,
      workspaceMode,
      pickedWorkspaceId,
      allowedWorkspaceIds,
      newWorkspaceName,
      newWorkspaceNameOverridden,
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
      const workspaceName = resolveMirroredWorkspaceName(
        displayName,
        newWorkspaceName,
        newWorkspaceNameOverridden,
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
    } else if (!allowedWorkspaceIds.includes(workspaceId)) {
      setFieldErrors({ workspaceId: 'Select a user workspace.' })
      return
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
  const mirroredWorkspaceName = resolveMirroredWorkspaceName(
    displayName,
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
          <Text style={styles.pageTitle}>New project</Text>
          <Text style={styles.pageCopy}>
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

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="My project"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                autoFocus
                accessibilityLabel="Project name"
                style={inputStyle(Boolean(fieldErrors.displayName))}
              />
              {fieldErrors.displayName ? (
                <Text style={orgPanelStyles.error}>
                  {fieldErrors.displayName}
                </Text>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Optional"
                placeholderTextColor={colors.textDim}
                accessibilityLabel="Project description"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                style={[
                  inputStyle(Boolean(fieldErrors.description)),
                  styles.descriptionInput,
                ]}
              />
              {fieldErrors.description ? (
                <Text style={orgPanelStyles.error}>
                  {fieldErrors.description}
                </Text>
              ) : null}
            </View>

            <ProjectWorkspaceFields
              workspaceMode={workspaceMode}
              workspaces={workspaces}
              loadingWorkspaces={loadingWorkspaces}
              pickedWorkspaceId={pickedWorkspaceId}
              fieldErrors={fieldErrors}
              newWorkspaceNameValue={mirroredWorkspaceName}
              inputStyle={inputStyle}
              onWorkspaceModeChange={setWorkspaceMode}
              onPickedWorkspaceIdChange={setPickedWorkspaceId}
              onNewWorkspaceNameChange={handleNewWorkspaceNameChange}
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
  pageTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  pageCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
  label: {
    color: colors.textLabel,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subLabel: {
    color: colors.textDim,
    fontSize: 12,
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
    borderRadius: 8,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  descriptionInput: {
    minHeight: 72,
    paddingTop: 10,
    paddingBottom: 10,
  },
  segmentStretch: {
    alignSelf: 'stretch',
  },
  segmentChipFlex: {
    flex: 1,
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
  primaryButton: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    backgroundColor: chrome.accent,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 15,
    fontWeight: '700',
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
  disabled: {
    opacity: 0.55,
  },
})
